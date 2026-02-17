const { User, Role, Organization, Branch } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { hashPassword } = require('../utils/passwordHelper');
const { Op } = require('sequelize');
const auditService = require('../services/auditService');

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
                { model: Branch, as: 'branches' }
            ],
            distinct: true,
            order: [['created_at', 'DESC']] // Fixed sort order
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
        const { name, email, password, role_ids, branch_ids } = req.body;
        const organization_id = req.user.organization_id;

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) return errorResponse(res, 'Email already exists', 409);

        const hashedPassword = await hashPassword(password);
        const user = await User.create({
            name, email, password: hashedPassword, organization_id
        });

        if (role_ids) await user.setRoles(role_ids);
        if (branch_ids) await user.setBranches(branch_ids);

        const createdUser = await User.findByPk(user.id, {
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
                roles: role_ids,
                branches: branch_ids
            },
            ipAddress,
            userAgent
        );

        return successResponse(res, createdUser, 'User created successfully', 201);
    } catch (error) { next(error); }
};

const updateUser = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return errorResponse(res, 'User not found', 404);

        const { role_ids, branch_ids, password, ...updateData } = req.body;

        if (password) {
            updateData.password = await hashPassword(password);
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
        const user = await User.findByPk(req.params.id);
        if (!user) return errorResponse(res, 'User not found', 404);

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
