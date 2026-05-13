const db = require('../models');
const { Organization, Branch, User, Role, SubscriptionHistory, Employee, BusinessPlan } = db;
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { hashPassword } = require('../utils/passwordHelper');
const sequelize = require('../config/database');
const auditService = require('../services/auditService');

// --- Organization ---

const createOrganization = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const {
            // Organization Details
            name,
            email,
            phone,
            address,
            city,
            website,
            logo,
            tax_id,
            business_type,
            business_mode,

            // Main Branch Details
            branch_name,
            branch_email,
            branch_phone,
            branch_address,

            // Shop Owner (Admin) Details
            owner_name,
            owner_email,
            owner_password,
            owner_phone
        } = req.body;

        // Handle Logo Upload
        let logoPath = logo;
        if (req.file) {
            logoPath = req.file.path.replace(/\\/g, '/');
        }

        // 1. Create Organization with Smart Subscription Setup
        const subscriptionStatus = req.body.subscription_status || 'Trial';
        let subscriptionTier = req.body.subscription_tier || 'Essential';
        let plan_id = req.body.plan_id;
        let trialDays = 30; // Default fallback

        // Case A: plan_id provided → derive tier name and trial days from it
        if (plan_id) {
            const plan = await BusinessPlan.findByPk(plan_id);
            if (plan) {
                subscriptionTier = plan.name;
                trialDays = plan.trial_days || 0;
            }
        }
        // Case B: only tier name provided (from UI form) → look up and link plan_id
        else if (subscriptionTier) {
            const plan = await BusinessPlan.findOne({ where: { name: subscriptionTier } });
            if (plan) {
                plan_id = plan.id;
                trialDays = plan.trial_days || 30;
            }
        }

        let subscriptionExpiryDate = req.body.subscription_expiry_date;
        let billingCycle = req.body.billing_cycle || 'Monthly';
        let notes = req.body.notes || 'Initial setup';

        // Auto-configure trial period
        if (subscriptionStatus === 'Trial') {
            const trialExpiry = new Date();
            trialExpiry.setDate(trialExpiry.getDate() + trialDays);
            subscriptionExpiryDate = trialExpiry;
            notes = `${trialDays}-day free trial`;
        }

        const organization = await Organization.create({
            name,
            email,
            phone,
            address,
            city,
            website,
            logo: logoPath,
            tax_id,
            business_type,
            business_mode,
            subscription_tier: subscriptionTier,
            plan_id: plan_id,
            billing_cycle: billingCycle,
            subscription_expiry_date: subscriptionExpiryDate,
            subscription_status: subscriptionStatus,
            purchase_date: req.body.purchase_date || new Date(),
            is_active: true
        }, { transaction });

        // Create initial subscription history record
        await SubscriptionHistory.create({
            organization_id: organization.id,
            subscription_tier: subscriptionTier,
            billing_cycle: billingCycle,
            amount: req.body.amount || 0,
            purchase_date: organization.purchase_date,
            expiry_date: subscriptionExpiryDate,
            payment_status: subscriptionStatus === 'Trial' ? 'Paid' : (req.body.payment_status || 'Paid'),
            notes: notes
        }, { transaction });

        // 2. Create Main Branch
        const branch = await Branch.create({
            name: branch_name || 'Main Branch',
            email: branch_email,
            phone: branch_phone,
            address: branch_address || address,
            organization_id: organization.id,
            is_main: true,
            is_active: true
        }, { transaction });

        // 3. Create Shop Owner User
        const hashedPassword = await hashPassword(owner_password);
        const user = await User.create({
            name: owner_name,
            email: owner_email,
            password: hashedPassword,
            phone: owner_phone,
            organization_id: organization.id,
            is_active: true
        }, { transaction });

        // 4. Assign Role (default to Organization Admin)
        const adminRole = await Role.findOne({ where: { name: 'Organization Admin' } });
        if (adminRole) {
            await user.addRole(adminRole, { transaction });
        }

        // 5. Assign User to Main Branch
        await user.addBranch(branch, { transaction });

        await transaction.commit();

        return successResponse(res, {
            organization,
            branch,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: adminRole ? adminRole.name : 'None'
            }
        }, 'Organization created successfully', 201);

    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};


// --- Organization ---
const getOrganization = async (req, res, next) => {
    try {
        const organization = await Organization.findByPk(req.user.organization_id, {
            include: [{ model: Branch, as: 'branches' }]
        });
        return successResponse(res, organization, 'Organization fetched');
    } catch (error) { next(error); }
};

const getAllOrganizations = async (req, res, next) => {
    try {
        const { page, size, search } = req.query;
        const { limit, offset } = getPagination(page, size);

        // Optional: Add search functionality
        const whereClause = {};
        if (search) {
            const { Op } = require('sequelize');
            whereClause.name = { [Op.like]: `%${search}%` };
        }

        const organizations = await Organization.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [['created_at', 'DESC']],
            include: [{
                model: Branch,
                as: 'branches',
                required: false, // Left join, in case an org has no branches (though it should)
            }]
        });

        return paginatedResponse(res, organizations.rows, {
            total: organizations.count,
            page: parseInt(page) || 1,
            limit
        }, 'Organizations fetched successfully');
    } catch (error) { next(error); }
};

const updateOrganization = async (req, res, next) => {
    try {
        // PERMISSION SCOPE CHECK
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        const userPermissions = [];
        req.user.roles.forEach(role => role.permissions?.forEach(p => userPermissions.push(p.name)));
        const hasUpdatePermission = userPermissions.includes('settings:business:update') || userPermissions.includes('system:settings');

        if (!isSuperAdmin && !hasUpdatePermission) {
            return errorResponse(res, 'Security Violation: You do not have permission to synchronize business identity.', 403);
        }

        const organization = await Organization.findByPk(req.user.organization_id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        // Capture previous state for audit log basis
        const oldValues = organization.toJSON();

        // Filter req.body to only include valid Organization fields to avoid polluting the model
        const allowedFields = [
            'name', 'email', 'phone', 'address', 'tax_id', 'website',
            'business_type', 'business_mode', 'city', 'state', 'zip_code', 'logo'
        ];
        const updateData = Object.keys(req.body)
            .filter(key => allowedFields.includes(key))
            .reduce((obj, key) => {
                obj[key] = req.body[key];
                return obj;
            }, {});

        // Handle Logo Upload
        if (req.file) {
            updateData.logo = req.file.path.replace(/\\/g, '/');
        }

        const transaction = await sequelize.transaction();
        try {
            await organization.update(updateData, { transaction });

            // Detailed Audit Logging
            const { ipAddress, userAgent } = auditService.getRequestContext(req);
            await auditService.logUpdate(
                req.user.organization_id,
                req.user.id,
                'Organization',
                organization.id,
                oldValues,
                updateData,
                ipAddress,
                userAgent,
                null,
                transaction
            );

            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }

        return successResponse(res, organization, 'Organization identity synchronized successfully');
    } catch (error) { next(error); }
};

const getOrganizationById = async (req, res, next) => {
    try {
        const organization = await Organization.findByPk(req.params.id, {
            include: [{ model: Branch, as: 'branches' }]
        });
        if (!organization) return errorResponse(res, 'Organization not found', 404);
        return successResponse(res, organization, 'Organization fetched');
    } catch (error) { next(error); }
};

const getOrganizationFullDetails = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [organization, totalBranches, totalUsers] = await Promise.all([
            Organization.findByPk(id, {
                include: [
                    { model: Branch, as: 'branches', limit: 5 },
                    { model: BusinessPlan, as: 'plan' },
                    {
                        model: SubscriptionHistory,
                        as: 'subscription_histories',
                        limit: 10,
                        order: [['created_at', 'DESC']]
                    }
                ]
            }),
            Branch.count({ where: { organization_id: id } }),
            User.count({ where: { organization_id: id } })
        ]);

        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const responseData = {
            organization,
            stats: {
                totalBranches,
                totalUsers
            }
        };

        return successResponse(res, responseData, 'Full organization details fetched');
    } catch (error) { next(error); }
};

const updateOrganizationById = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const organization = await Organization.findByPk(req.params.id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const oldValues = organization.toJSON();
        const oldStatus = organization.subscription_status;
        const updateData = { ...req.body };

        // 1. Smart Plan/Tier Alignment
        // Case A: plan_id provided → derive tier name from it
        if (updateData.plan_id) {
            const plan = await BusinessPlan.findByPk(updateData.plan_id);
            if (plan) {
                updateData.subscription_tier = plan.name;
            }
        }
        // Case B: only subscription_tier provided (from UI form) → look up and link plan_id
        else if (updateData.subscription_tier) {
            const plan = await BusinessPlan.findOne({ where: { name: updateData.subscription_tier } });
            if (plan) {
                updateData.plan_id = plan.id;
            }
        }

        // 2. Smart Status Logic
        if (updateData.subscription_status === 'Active') {
            updateData.is_active = true;
        } else if (['Expired', 'Suspended'].includes(updateData.subscription_status)) {
            updateData.is_active = false;
        }

        // 3. Smart Expiry Calculation
        if (updateData.subscription_status === 'Active' && !updateData.subscription_expiry_date) {
            const now = new Date();
            const cycle = updateData.billing_cycle || organization.billing_cycle || 'Monthly';

            if (cycle === 'Monthly') now.setMonth(now.getMonth() + 1);
            else if (cycle === '6 Months') now.setMonth(now.getMonth() + 6);
            else if (cycle === 'Yearly') now.setFullYear(now.getFullYear() + 1);
            else if (cycle === 'Lifetime') now.setFullYear(now.getFullYear() + 100);

            updateData.subscription_expiry_date = now;
        }

        // Handle Logo Upload
        if (req.file) {
            updateData.logo = req.file.path.replace(/\\/g, '/');
        }

        await organization.update(updateData, { transaction });

        // If subscription details changed, create a history record
        if (req.body.subscription_tier !== undefined || req.body.billing_cycle !== undefined || req.body.subscription_status !== oldStatus) {
            await SubscriptionHistory.create({
                organization_id: organization.id,
                subscription_tier: organization.subscription_tier,
                billing_cycle: organization.billing_cycle,
                amount: req.body.amount || 0,
                purchase_date: req.body.purchase_date || new Date(),
                expiry_date: organization.subscription_expiry_date,
                payment_status: req.body.payment_status || 'Paid',
                notes: req.body.notes || `Subscription updated by Admin: ${oldStatus} → ${organization.subscription_status}`
            }, { transaction });
        }

        // Detailed Audit Logging for Super Admin action
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            organization.id,
            req.user.id,
            'Organization',
            organization.id,
            oldValues,
            req.body,
            ipAddress,
            userAgent,
            { is_admin_action: true },
            transaction
        );

        await transaction.commit();
        return successResponse(res, organization, 'Organization updated successfully');
    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};

const toggleOrganizationStatus = async (req, res, next) => {
    try {
        // Strict Super Admin Check
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        if (!isSuperAdmin) return errorResponse(res, 'Unauthorized: Super Admin only', 403);

        const organization = await Organization.findByPk(req.params.id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const action = req.params.action || (organization.is_active ? 'deactivate' : 'activate');
        organization.is_active = (action === 'activate');

        // Also update subscription status if deactivating
        if (action === 'deactivate') {
            organization.subscription_status = 'Suspended';
        } else if (organization.subscription_status === 'Suspended') {
            organization.subscription_status = 'Active';
        }

        await organization.save();
        return successResponse(res, organization, `Organization ${action}d successfully`);
    } catch (error) { next(error); }
};

const getSubscriptionHistory = async (req, res, next) => {
    try {
        const { page, size } = req.query;
        const { limit, offset } = getPagination(page, size);

        const organizationId = req.params.id || req.user.organization_id;

        const history = await SubscriptionHistory.findAndCountAll({
            where: { organization_id: organizationId },
            limit,
            offset,
            order: [['purchase_date', 'DESC']]
        });

        return paginatedResponse(res, history.rows, {
            total: history.count,
            page: parseInt(page) || 1,
            limit
        }, 'Subscription history fetched');
    } catch (error) { next(error); }
};

// --- Branches ---
const getAllBranches = async (req, res, next) => {
    try {
        const { page, size } = req.query;
        const { limit, offset } = getPagination(page, size);

        // Check if user is Super Admin
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');

        const whereClause = {};

        // If not Super Admin, restrict to their organization
        if (!isSuperAdmin) {
            whereClause.organization_id = req.user.organization_id;
        } else if (req.query.organization_id) {
            // If Super Admin AND organization_id param is provided, filter by it
            whereClause.organization_id = req.query.organization_id;
        }
        // If Super Admin and no param, return all branches

        const branches = await Branch.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [['name', 'ASC']],
            include: [
                {
                    model: Organization,
                    as: 'organization',
                    attributes: ['id', 'name']
                },
                {
                    model: Employee,
                    as: 'employees',
                    attributes: ['id', 'name', 'phone', 'designation'],
                    through: { attributes: [] }
                },
                {
                    model: Employee,
                    as: 'manager',
                    attributes: ['id', 'name', 'phone', 'designation']
                }],
            distinct: true
        });

        // Map the results to flatten the manager info
        const branchData = branches.rows.map(branch => {
            const branchJson = branch.toJSON();

            // Priority 1: Use explicitly linked manager_id
            let manager = branchJson.manager;

            // Priority 2: Fallback to dynamic lookup based on designation
            if (!manager && branchJson.employees) {
                manager = branchJson.employees.find(emp =>
                    emp.designation && (
                        emp.designation.toLowerCase().includes('manager') ||
                        emp.designation.toLowerCase().includes('in-charge') ||
                        emp.designation.toLowerCase().includes('founder')
                    )
                );
            }

            return {
                ...branchJson,
                manager_name: manager ? manager.name : null,
                manager_phone: manager ? manager.phone : null,
                employees: undefined, // Cleanup
                manager: undefined   // Cleanup for table view
            };
        });

        return paginatedResponse(res, branchData, {
            total: branches.count,
            page: parseInt(page) || 1,
            limit
        }, 'Branches fetched successfully');
    } catch (error) { next(error); }
};

const getActiveBranchesList = async (req, res, next) => {
    try {
        const branches = await Branch.findAll({
            where: {
                organization_id: req.user.organization_id,
                is_active: true
            },
            order: [['name', 'ASC']]
        });
        return successResponse(res, branches, 'Active branches fetched');
    } catch (error) { next(error); }
};

const createBranch = async (req, res, next) => {
    try {
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');

        const branchData = { ...req.body };

        // Convert empty strings or 'none' to null (especially for foreign keys like manager_id)
        Object.keys(branchData).forEach(key => {
            if (branchData[key] === '' || branchData[key] === 'none') {
                branchData[key] = null;
            }
        });

        if (!isSuperAdmin) {
            branchData.organization_id = req.user.organization_id;
        } else if (!branchData.organization_id) {
            if (req.user.organization_id) {
                branchData.organization_id = req.user.organization_id;
            }
        }

        if (branchData.organization_id) {
            const organization = await Organization.findByPk(branchData.organization_id, {
                include: [{ model: BusinessPlan, as: 'plan' }]
            });

            if (organization) {
                const tier = organization.subscription_tier;
                if (tier === 'Essential') {
                    return errorResponse(res, "Plan Restriction: Multi-location management is not available on the Essential plan. Please upgrade to Professional or Enterprise to add more branches.", 403);
                }

                if (organization.plan) {
                    const currentBranchesCount = await Branch.count({ where: { organization_id: branchData.organization_id, is_active: true } });
                    const maxBranches = organization.plan.max_branches;

                    if (maxBranches !== -1 && currentBranchesCount >= maxBranches) {
                        return errorResponse(res, `Branch Limit Reached: Your current plan '${organization.plan.name}' allows only ${maxBranches} branches. Please upgrade your plan for multi-location support.`, 403);
                    }
                }
            }
        }

        const branch = await Branch.create(branchData);
        return successResponse(res, branch, 'Branch created successfully', 201);
    } catch (error) { next(error); }
};

const updateBranch = async (req, res, next) => {
    try {
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        const whereClause = { id: req.params.id };

        if (!isSuperAdmin) {
            whereClause.organization_id = req.user.organization_id;
        }

        const branch = await Branch.findOne({ where: whereClause });
        if (!branch) return errorResponse(res, 'Branch not found', 404);

        const updateData = { ...req.body };
        // Convert empty strings or 'none' to null (especially for foreign keys like manager_id)
        Object.keys(updateData).forEach(key => {
            if (updateData[key] === '' || updateData[key] === 'none') {
                updateData[key] = null;
            }
        });

        await branch.update(updateData);
        return successResponse(res, branch, 'Branch updated successfully');
    } catch (error) { next(error); }
};

const getBranchById = async (req, res, next) => {
    try {
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        const whereClause = { id: req.params.id };

        if (!isSuperAdmin) {
            whereClause.organization_id = req.user.organization_id;
        }

        const branch = await Branch.findOne({
            where: whereClause,
            include: [{
                model: Employee,
                as: 'manager',
                attributes: ['id', 'name', 'designation']
            }]
        });
        if (!branch) return errorResponse(res, 'Branch not found', 404);

        return successResponse(res, branch, 'Branch fetched successfully');
    } catch (error) { next(error); }
};

const toggleBranchStatus = async (req, res, next) => {
    try {
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        const whereClause = { id: req.params.id };

        if (!isSuperAdmin) {
            whereClause.organization_id = req.user.organization_id;
        }

        const branch = await Branch.findOne({ where: whereClause });
        if (!branch) return errorResponse(res, 'Branch not found', 404);

        const action = req.params.action || (branch.is_active ? 'deactivate' : 'activate');
        branch.is_active = (action === 'activate');
        await branch.save();

        return successResponse(res, branch, `Branch ${action}d successfully`);
    } catch (error) { next(error); }
};

const getSuperAdminStats = async (req, res, next) => {
    try {
        // Strict Super Admin Check
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        if (!isSuperAdmin) return errorResponse(res, 'Unauthorized: Super Admin only', 403);

        const totalOrganizations = await Organization.count();
        const totalBranches = await Branch.count({ where: { is_active: true } });
        const totalUsers = await User.count({ where: { is_active: true } });

        return successResponse(res, {
            totalOrganizations,
            totalBranches,
            totalUsers,
            systemHealth: 'Excellent' // Placeholder
        }, 'Super admin stats fetched successfully');
    } catch (error) { next(error); }
};

const toggleShopifyIntegration = async (req, res, next) => {
    try {
        // Strict Super Admin Check
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        if (!isSuperAdmin) return errorResponse(res, 'Unauthorized: Super Admin only', 403);

        const organization = await Organization.findByPk(req.params.id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const currentStatus = organization.shopify_enabled;
        organization.shopify_enabled = !currentStatus;
        await organization.save();

        // Audit Logging
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            organization.id,
            req.user.id,
            'Organization',
            organization.id,
            { shopify_enabled: currentStatus },
            { shopify_enabled: organization.shopify_enabled },
            ipAddress,
            userAgent,
            { is_admin_action: true }
        );

        return successResponse(res, organization, `Shopify integration ${organization.shopify_enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) { next(error); }
};

const toggleWhatsAppIntegration = async (req, res, next) => {
    try {
        // Strict Super Admin Check
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        if (!isSuperAdmin) return errorResponse(res, 'Unauthorized: Super Admin only', 403);

        const organization = await Organization.findByPk(req.params.id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const currentStatus = organization.whatsapp_enabled;
        organization.whatsapp_enabled = !currentStatus;
        await organization.save();

        // Audit Logging
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            organization.id,
            req.user.id,
            'Organization',
            organization.id,
            { whatsapp_enabled: currentStatus },
            { whatsapp_enabled: organization.whatsapp_enabled },
            ipAddress,
            userAgent,
            { is_admin_action: true }
        );

        return successResponse(res, organization, `WhatsApp CRM integration ${organization.whatsapp_enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) { next(error); }
};

const toggleLoyaltyIntegration = async (req, res, next) => {
    try {
        // Strict Super Admin Check
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        if (!isSuperAdmin) return errorResponse(res, 'Unauthorized: Super Admin only', 403);

        const organization = await Organization.findByPk(req.params.id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const currentStatus = organization.loyalty_enabled;
        organization.loyalty_enabled = !currentStatus;
        await organization.save();

        // Audit Logging
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            organization.id,
            req.user.id,
            'Organization',
            organization.id,
            { loyalty_enabled: currentStatus },
            { loyalty_enabled: organization.loyalty_enabled },
            ipAddress,
            userAgent,
            { is_admin_action: true }
        );

        return successResponse(res, organization, `Customer Loyalty system ${organization.loyalty_enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) { next(error); }
};

const toggleBackupFeature = async (req, res, next) => {
    try {
        // Strict Super Admin Check
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        if (!isSuperAdmin) return errorResponse(res, 'Unauthorized: Super Admin only', 403);

        const organization = await Organization.findByPk(req.params.id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const currentStatus = organization.backup_enabled;
        organization.backup_enabled = !currentStatus;

        // If enabling for the first time, set some defaults
        if (organization.backup_enabled && !organization.backup_email) {
            organization.backup_email = organization.email;
        }

        await organization.save();

        // Audit Logging
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            organization.id,
            req.user.id,
            'Organization',
            organization.id,
            { backup_enabled: currentStatus },
            { backup_enabled: organization.backup_enabled },
            ipAddress,
            userAgent,
            { is_admin_action: true }
        );

        return successResponse(res, organization, `Backup feature ${organization.backup_enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) { next(error); }
};

const getOnboardingStatus = async (req, res, next) => {
    try {
        const orgId = req.user.organization_id;

        if (!orgId) {
            // Default for Super Admins or users without an organization
            return successResponse(res, {
                onboarding_completed: false,
                force_onboarding: false
            }, 'Default onboarding status (No Organization)');
        }

        const organization = await Organization.findByPk(orgId, {
            attributes: ['id', 'onboarding_completed', 'force_onboarding']
        });

        if (!organization) {
            return successResponse(res, {
                onboarding_completed: false,
                force_onboarding: false
            }, 'Default onboarding status (Org not found)');
        }

        return successResponse(res, organization, 'Onboarding status fetched');
    } catch (error) { next(error); }
};

const updateOnboardingStatus = async (req, res, next) => {
    try {
        const { completed } = req.body;
        const organization = await Organization.findByPk(req.user.organization_id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        organization.onboarding_completed = !!completed;
        await organization.save();

        return successResponse(res, organization, 'Onboarding status updated');
    } catch (error) { next(error); }
};

const updateOnboardingPolicy = async (req, res, next) => {
    try {
        // Strict Super Admin Check
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        if (!isSuperAdmin) return errorResponse(res, 'Unauthorized: Super Admin only', 403);

        const { id } = req.params;
        const { force_onboarding } = req.body;

        const organization = await Organization.findByPk(id || req.user.organization_id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const oldValues = { force_onboarding: organization.force_onboarding };
        organization.force_onboarding = !!force_onboarding;
        await organization.save();

        // Audit Logging
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            organization.id,
            req.user.id,
            'Organization',
            organization.id,
            oldValues,
            { force_onboarding: organization.force_onboarding },
            ipAddress,
            userAgent,
            { is_admin_action: true }
        );

        return successResponse(res, organization, `Onboarding policy updated: Force Mode is now ${organization.force_onboarding ? 'ON' : 'OFF'}`);
    } catch (error) { next(error); }
};

const updateOrganizationPlan = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { plan_id, subscription_status, billing_cycle, billing_model, subscription_expiry_date } = req.body;

        const organization = await Organization.findByPk(id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const plan = await BusinessPlan.findByPk(plan_id);
        if (!plan) return errorResponse(res, 'Plan not found', 404);

        const oldValues = organization.toJSON();

        // Smart Expiry Calculation
        let expiryDate = subscription_expiry_date;
        if (!expiryDate && subscription_status === 'Active') {
            const now = new Date();
            const cycle = billing_cycle || organization.billing_cycle || 'Monthly';

            if (cycle === 'Monthly') now.setMonth(now.getMonth() + 1);
            else if (cycle === '6 Months') now.setMonth(now.getMonth() + 6);
            else if (cycle === 'Yearly') now.setFullYear(now.getFullYear() + 1);
            else if (cycle === 'Lifetime') now.setFullYear(now.getFullYear() + 100);

            expiryDate = now;
        }

        // Update Organization
        await organization.update({
            plan_id,
            subscription_tier: plan.name,
            subscription_status: subscription_status || 'Active',
            billing_cycle: billing_cycle || organization.billing_cycle,
            billing_model: billing_model || organization.billing_model,
            subscription_expiry_date: expiryDate || organization.subscription_expiry_date,
            is_active: (subscription_status !== 'Expired' && subscription_status !== 'Suspended')
        }, { transaction });

        // Create History Record
        await SubscriptionHistory.create({
            organization_id: organization.id,
            subscription_tier: organization.subscription_tier,
            billing_cycle: organization.billing_cycle,
            amount: req.body.amount || plan.price_monthly,
            purchase_date: new Date(),
            expiry_date: organization.subscription_expiry_date,
            payment_status: 'Paid',
            notes: req.body.notes || `Plan changed to ${plan.name} by Super Admin`
        }, { transaction });

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            organization.id,
            req.user.id,
            'Organization',
            organization.id,
            oldValues,
            req.body,
            ipAddress,
            userAgent,
            { is_admin_action: true, action: 'plan_change' },
            transaction
        );

        await transaction.commit();
        return successResponse(res, organization, `Plan updated to ${plan.name} successfully`);
    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};

const updateOrganizationModules = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { module_overrides } = req.body;

        const organization = await Organization.findByPk(id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const oldOverrides = organization.module_overrides;
        organization.module_overrides = module_overrides;
        await organization.save();

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            organization.id,
            req.user.id,
            'Organization',
            organization.id,
            { module_overrides: oldOverrides },
            { module_overrides },
            ipAddress,
            userAgent,
            { is_admin_action: true, action: 'module_overrides' }
        );

        return successResponse(res, organization, 'Module overrides updated successfully');
    } catch (error) { next(error); }
};

const extendOrganizationTrial = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { days } = req.body;

        if (!days || isNaN(days) || days <= 0) {
            return errorResponse(res, 'Invalid number of days provided', 400);
        }

        const organization = await Organization.findByPk(id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const oldValues = organization.toJSON();

        // Calculate new expiry: extend from current expiry, or from today if none
        const baseDate = organization.subscription_expiry_date
            ? new Date(organization.subscription_expiry_date)
            : new Date();
        baseDate.setDate(baseDate.getDate() + parseInt(days));

        await organization.update({
            subscription_expiry_date: baseDate,
            subscription_status: 'Trial',
            is_active: true
        }, { transaction });

        // Create history entry
        await SubscriptionHistory.create({
            organization_id: organization.id,
            subscription_tier: organization.subscription_tier,
            billing_cycle: organization.billing_cycle || 'Monthly',
            amount: 0,
            purchase_date: new Date(),
            expiry_date: baseDate,
            payment_status: 'Paid',
            notes: `Trial extended by ${days} day(s) by Super Admin`
        }, { transaction });

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            organization.id,
            req.user.id,
            'Organization',
            organization.id,
            oldValues,
            { subscription_expiry_date: baseDate, subscription_status: 'Trial' },
            ipAddress,
            userAgent,
            { is_admin_action: true, action: 'extend_trial', days: parseInt(days) },
            transaction
        );

        await transaction.commit();
        return successResponse(res, {
            new_expiry_date: baseDate,
            days_extended: parseInt(days)
        }, `Trial extended by ${days} day(s) successfully`);
    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};


const resetAdminPassword = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { password } = req.body;

        if (!password) {
            return errorResponse(res, 'New password is required', 400);
        }

        // Strict Super Admin Check
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        if (!isSuperAdmin) return errorResponse(res, 'Unauthorized: Super Admin only', 403);

        const organization = await Organization.findByPk(id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        // Find the primary Organization Admin
        const adminRole = await Role.findOne({ where: { name: 'Organization Admin' } });
        if (!adminRole) return errorResponse(res, 'System Error: Organization Admin role not found', 500);

        const adminUser = await User.findOne({
            where: { organization_id: id },
            include: [{
                model: Role,
                as: 'roles',
                where: { id: adminRole.id }
            }],
            order: [['created_at', 'ASC']] // Target the first one created
        });

        if (!adminUser) {
            return errorResponse(res, 'No Organization Admin found for this business profile', 404);
        }

        const hashedPassword = await hashPassword(password);
        await adminUser.update({ password: hashedPassword });

        // Audit Logging
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCustom(
            id,
            req.user.id,
            'ADMIN_PASSWORD_RESET',
            `Super Admin reset password for ${adminUser.name} (${adminUser.email})`,
            ipAddress,
            userAgent,
            { target_user_id: adminUser.id }
        );

        return successResponse(res, null, `Administrative password for ${adminUser.name} has been reset successfully.`);
    } catch (error) {
        next(error);
    }
};

const resetOrganizationData = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const { id: organizationId } = req.params;
        const { confirmation } = req.body;

        // Security check
        if (confirmation !== 'Institutional Safety Operations') {
            return errorResponse(res, 'Invalid confirmation phrase', 400);
        }

        const organization = await Organization.findByPk(organizationId);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        // List of models to clear, ordered logically (though FOREIGN_KEY_CHECKS=0 helps)
        const modelsToClear = [
            // 1. Transactions & Operations
            'SaleReturnItem', 'SaleReturn', 'SaleReturnPayment',
            'PurchaseReturnItem', 'PurchaseReturn',
            'StockAdjustmentItem', 'StockAdjustment',
            'StockTransferItem', 'StockTransfer',
            'StockOpening', 'Wastage',
            'SaleItem', 'Sale', 'SalePayment', 'SaleEmployee',
            'PurchaseOrderItem', 'PurchaseOrder',
            'GRNItem', 'GRN',
            'ProductionOrderItem', 'ProductionOrder',
            'RecipeItem', 'Recipe',
            'Transaction', 'Expense', 'Payment', 'SupplierPayment', 'Cheque', 'Account',
            'CashDrawerSession', 'Shift', 'ShiftTransaction',

            // 2. Inventory & Products
            'Stock', 'ProductBatch', 'ProductVariant', 'ProductAttribute', 'ProductSupplier',
            'VariantAttributeValue', 'Product',
            'Category', 'SubCategory', 'MainCategory', 'Brand', 'Unit', 'MeasurementUnit',
            'Attribute', 'AttributeValue',

            // 3. Partners & HR
            'Supplier', 'Customer', 'Distributor',
            'EmployeeBranch', 'Employee', 'Department', 'Designation',

            // 4. Structure (Users are preserved, but their links to branches are cleared)
            'Branch', 'UserBranch', 'Setting'
        ];

        // Disable foreign key checks for the duration of the reset
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });

        for (const modelName of modelsToClear) {
            const Model = db[modelName];
            if (Model) {
                // IMPORTANT: Only delete if the model has organization_id column in its definition
                // to avoid Sequelize generating invalid queries.
                if (Model.rawAttributes && Model.rawAttributes.organization_id) {
                    await Model.destroy({
                        where: { organization_id: organizationId },
                        transaction,
                        force: true // Skip paranoid soft deletes if enabled
                    });
                }
            }
        }

        // Re-enable foreign key checks
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });

        // Audit Logging
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCustom(
            organizationId,
            req.user.id,
            'ORGANIZATION_DATA_RESET',
            `Super Admin performed a full institutional data reset for organization: ${organization.name}. Users preserved, all operational data wiped.`,
            ipAddress,
            userAgent,
            { organization_id: organizationId }
        );

        await transaction.commit();
        return successResponse(res, null, 'Organization data has been successfully reset. Operational history, inventory, and masters cleared.');
    } catch (error) {
        // Ensure foreign key checks are re-enabled even on failure
        try {
            await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
        } catch (e) {
            console.error('Failed to re-enable foreign key checks during rollback', e);
        }
        await transaction.rollback();
        next(error);
    }
};


module.exports = {
    getOrganization, getAllOrganizations, updateOrganization, createOrganization,
    getOrganizationById, updateOrganizationById, toggleOrganizationStatus, getSubscriptionHistory,
    getOrganizationFullDetails,
    getAllBranches, getActiveBranchesList, getBranchById, createBranch, updateBranch, toggleBranchStatus,
    getSuperAdminStats, toggleShopifyIntegration, toggleWhatsAppIntegration, toggleLoyaltyIntegration, toggleBackupFeature,
    getOnboardingStatus, updateOnboardingStatus, updateOnboardingPolicy,
    updateOrganizationPlan, updateOrganizationModules, extendOrganizationTrial,
    resetAdminPassword, resetOrganizationData
};
