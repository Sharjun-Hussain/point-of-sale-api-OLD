const { Organization, Branch, User, Role, SubscriptionHistory } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { hashPassword } = require('../utils/passwordHelper');
const sequelize = require('../config/database');

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

        // 1. Create Organization with Smart Subscription Setup
        // If Trial: auto-set 30-day expiry
        // If Paid: use provided subscription details
        const subscriptionStatus = req.body.subscription_status || 'Trial';
        let subscriptionExpiryDate = req.body.subscription_expiry_date;
        let subscriptionTier = req.body.subscription_tier || 'Basic';
        let billingCycle = req.body.billing_cycle || 'Monthly';
        let notes = req.body.notes || 'Initial setup';

        // Auto-configure trial period
        if (subscriptionStatus === 'Trial') {
            const trialExpiry = new Date();
            trialExpiry.setDate(trialExpiry.getDate() + 30); // 30 days from now
            subscriptionExpiryDate = trialExpiry;
            notes = '30-day free trial';
        }

        const organization = await Organization.create({
            name,
            email,
            phone,
            address,
            city,
            website,
            logo,
            tax_id,
            subscription_tier: subscriptionTier,
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

        // 4. Assign Role (default to Admin)
        const adminRole = await Role.findOne({ where: { name: 'Admin' } }); // Changed from Manager to Admin
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
        const organization = await Organization.findByPk(req.user.organization_id);
        await organization.update(req.body);
        return successResponse(res, organization, 'Organization updated');
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

const updateOrganizationById = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const organization = await Organization.findByPk(req.params.id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        const oldTier = organization.subscription_tier;
        const oldCycle = organization.billing_cycle;
        const oldStatus = organization.subscription_status;


        // Auto-activate organization if subscription status is being set to Active
        if (req.body.subscription_status === 'Active') {
            req.body.is_active = true;
        }


        // Auto-suspend if subscription status is being set to Expired or Suspended
        if (req.body.subscription_status === 'Expired' || req.body.subscription_status === 'Suspended') {
            req.body.is_active = false;
        }

        await organization.update(req.body, { transaction });

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
                notes: req.body.notes || `Subscription updated: ${oldStatus} → ${organization.subscription_status}`
            }, { transaction });
        }

        await transaction.commit();
        return successResponse(res, organization, 'Organization updated');
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
                    attributes: ['id', 'name'] // Removed 'code' as it doesn't exist
                },
                {
                    model: User,
                    as: 'users',
                    attributes: ['id', 'name', 'phone'],
                    include: [{
                        model: Role,
                        as: 'roles',
                        where: { name: ['Admin', 'Manager', 'Branch Manager'] }, // Filter users by leadership roles
                        required: false // Left join, so we still get branches even if no manager assigned
                    }],
                    required: false,
                    through: { attributes: [] } // Exclude join table attributes
                }],
            distinct: true // distinct is important when including hasMany associations with limit
        });

        // Map the results to flatten the manager info
        const branchData = branches.rows.map(branch => {
            const branchJson = branch.toJSON();
            // Find the first user with a role
            const manager = branchJson.users && branchJson.users.find(u => u.roles && u.roles.length > 0);

            return {
                ...branchJson,
                manager_name: manager ? manager.name : null,
                manager_phone: manager ? manager.phone : null,
                // Remove the large users array from response if not needed, or keep it
                users: undefined
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

        if (!isSuperAdmin) {
            branchData.organization_id = req.user.organization_id;
        } else if (!branchData.organization_id) {
            // If Super Admin forgets to send org id, maybe error or fallback?
            // For now let's assume valid payload, or let DB validation fail if not null.
            // Or allow creating branch for their own org if they have one.
            if (req.user.organization_id) {
                branchData.organization_id = req.user.organization_id;
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

        await branch.update(req.body);
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

        const branch = await Branch.findOne({ where: whereClause });
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

module.exports = {
    getOrganization, getAllOrganizations, updateOrganization, createOrganization,
    getOrganizationById, updateOrganizationById, toggleOrganizationStatus, getSubscriptionHistory,
    getAllBranches, getActiveBranchesList, getBranchById, createBranch, updateBranch, toggleBranchStatus,
    getSuperAdminStats
};
