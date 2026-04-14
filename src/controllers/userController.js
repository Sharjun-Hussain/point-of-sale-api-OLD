const { User, Role, Organization, Branch, Employee } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { hashPassword } = require('../utils/passwordHelper');
const { Op } = require('sequelize');
const auditService = require('../services/auditService');
const mailer = require('../utils/mailer');

const getAllUsers = async (req, res, next) => {
    try {
        const { page, size, name, organization_id } = req.query; // Added organization_id param
        const { limit, offset } = getPagination(page, size);

        // Check if user is Super Admin
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');

        const where = {};

        // If not Super Admin, restrict to their organization
        if (!isSuperAdmin) {
            where.organization_id = req.user.organization_id;
        } else if (organization_id) {
            // If Super Admin AND organization_id param is provided, filter by it
            where.organization_id = organization_id;
        }

        if (name) {
            where.name = { [Op.like]: `%${name}%` };
        }

        const users = await User.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                { model: Role, as: 'roles' },
                { model: Organization, as: 'organization' },
                { model: Branch, as: 'branches' },
                { model: Employee, as: 'employee', attributes: ['id', 'designation', 'name'] }
            ],
            distinct: true,
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, users.rows, {
            total: users.count,
            page: parseInt(page) || 1,
            limit
        }, 'Users fetched successfully');
    } catch (error) { next(error); }
};

const createUser = async (req, res, next) => {
    try {
        let { name, first_name, last_name, email, password, role_ids, branch_ids, nic, joined_date, phone, profile_image } = req.body;
        const organization_id = req.user.organization_id;

        // Handle File Upload
        if (req.file) {
            profile_image = req.file.path;
        }

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) return errorResponse(res, 'Email already exists', 409);

        const hashedPassword = await hashPassword(password);

        // Auto-construct name if not provided
        const userName = name || [first_name, last_name].filter(Boolean).join(' ') || email.split('@')[0];

        // Parse IDs if they come as strings from FormData
        if (typeof role_ids === 'string') {
            try { role_ids = JSON.parse(role_ids); } catch (e) { role_ids = role_ids.split(',').filter(Boolean); }
        }
        if (typeof branch_ids === 'string') {
            try { branch_ids = JSON.parse(branch_ids); } catch (e) { branch_ids = branch_ids.split(',').filter(Boolean); }
        }

        const user = await User.create({
            name: userName, first_name, last_name, email, password: hashedPassword, organization_id, nic, joined_date, phone, profile_image
        });

        if (role_ids) await user.setRoles(role_ids);
        if (branch_ids) await user.setBranches(branch_ids);

        const createdUser = await User.findOne({
            where: { id: user.id, organization_id: req.user.organization_id },
            include: [{ model: Role, as: 'roles' }, { model: Branch, as: 'branches' }]
        });

        // Log user creation
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            organization_id,
            req.user.id,
            'User',
            user.id,
            {
                name: user.name,
                email: user.email,
                phone: user.phone,
                nic: user.nic,
                roles: role_ids,
                branches: branch_ids
            },
            ipAddress,
            userAgent
        );

        // Dispatch Welcome Email with Credentials
        try {
            await mailer.sendWelcomeEmail(createdUser, password, organization_id);
        } catch (mailError) {
            console.error('Welcome Email Dispatch Failed:', mailError);
            // We don't block user creation if email fails, but we log it
        }

        return successResponse(res, createdUser, 'User created successfully', 201);
    } catch (error) { next(error); }
};

const updateUser = async (req, res, next) => {
    try {
        const user = await User.findOne({ 
            where: { id: req.params.id, organization_id: req.user.organization_id } 
        });
        if (!user) return errorResponse(res, 'User not found', 404);

        let { role_ids, branch_ids, password, first_name, last_name, name, phone, nic, joined_date, profile_image, ...otherData } = req.body;

        const updateData = { ...otherData };

        // Handle File Upload
        if (req.file) {
            updateData.profile_image = req.file.path;
        } else if (profile_image) {
            updateData.profile_image = profile_image;
        }

        // Parse IDs if they come as strings from FormData
        if (role_ids && typeof role_ids === 'string') {
            try { role_ids = JSON.parse(role_ids); } catch (e) { role_ids = role_ids.split(',').filter(Boolean); }
        }
        if (branch_ids && typeof branch_ids === 'string') {
            try { branch_ids = JSON.parse(branch_ids); } catch (e) { branch_ids = branch_ids.split(',').filter(Boolean); }
        }

        if (password) {
            updateData.password = await hashPassword(password);
        }

        if (first_name) updateData.first_name = first_name;
        if (last_name) updateData.last_name = last_name;
        if (phone) updateData.phone = phone;
        if (nic) updateData.nic = nic;
        if (joined_date) updateData.joined_date = joined_date;
        if (profile_image) updateData.profile_image = profile_image;
        
        if (name) {
            updateData.name = name;
        } else if (first_name || last_name) {
            const currentFirstName = first_name || user.first_name;
            const currentLastName = last_name || user.last_name;
            updateData.name = [currentFirstName, currentLastName].filter(Boolean).join(' ');
        }

        await user.update(updateData);

        if (role_ids) await user.setRoles(role_ids);
        if (branch_ids) await user.setBranches(branch_ids);

        // Log user update
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            req.user.organization_id,
            req.user.id,
            'User',
            user.id,
            { name: user.name, email: user.email },
            updateData,
            ipAddress,
            userAgent,
            { role_ids, branch_ids, password_changed: !!password }
        );

        return successResponse(res, user, 'User updated successfully');
    } catch (error) { next(error); }
};

const toggleUserStatus = async (req, res, next) => {
    try {
        const user = await User.findOne({ 
            where: { id: req.params.id, organization_id: req.user.organization_id } 
        });
        if (!user) return errorResponse(res, 'User not found', 404);

        // Safety: Prevent self-deactivation
        if (user.id === req.user.id && user.is_active) {
            return errorResponse(res, 'Security Breach: You cannot deactivate your own account. This measure prevents total organization lockout.', 400);
        }

        user.is_active = !user.is_active;
        await user.save();

        // Log status toggle
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCustom(
            req.user.organization_id,
            req.user.id,
            user.is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
            `User ${user.name} ${user.is_active ? 'activated' : 'deactivated'}`,
            ipAddress,
            userAgent,
            { user_id: user.id, new_status: user.is_active }
        );

        return successResponse(res, user, `User ${user.is_active ? 'activated' : 'deactivated'} successfully`);
    } catch (error) { next(error); }
};

const getActiveSellers = async (req, res, next) => {
    try {
        const { name } = req.query;
        const where = {
            organization_id: req.user.organization_id,
            is_active: true
        };

        if (name) {
            where.name = { [Op.like]: `%${name}%` };
        }

        const sellers = await User.findAll({
            where,
            attributes: ['id', 'name', 'email', 'profile_image'],
            order: [['name', 'ASC']]
        });

        return successResponse(res, sellers, 'Active sellers fetched successfully');
    } catch (error) { next(error); }
};

module.exports = {
    getAllUsers, createUser, updateUser, toggleUserStatus, getActiveSellers
};
