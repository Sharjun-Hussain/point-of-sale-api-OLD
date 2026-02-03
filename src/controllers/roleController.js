const { Role, Permission } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');

const getAllRoles = async (req, res, next) => {
    try {
        const roles = await Role.findAll({
            include: [{ model: Permission, as: 'permissions' }]
        });
        // Frontend expects data.data.data for some reason even for roles
        return successResponse(res, { data: roles }, 'Roles fetched successfully');
    } catch (error) { next(error); }
};

const createRole = async (req, res, next) => {
    try {
        const { name, description, permission_ids } = req.body;
        const role = await Role.create({ name, description });

        if (permission_ids) {
            await role.setPermissions(permission_ids);
        }

        const createdRole = await Role.findByPk(role.id, {
            include: [{ model: Permission, as: 'permissions' }]
        });
        return successResponse(res, createdRole, 'Role created successfully', 201);
    } catch (error) { next(error); }
};

const updateRole = async (req, res, next) => {
    try {
        const role = await Role.findByPk(req.params.id);
        if (!role) return errorResponse(res, 'Role not found', 404);

        const { permission_ids, ...updateData } = req.body;
        await role.update(updateData);

        if (permission_ids) {
            await role.setPermissions(permission_ids);
        }

        return successResponse(res, role, 'Role updated successfully');
    } catch (error) { next(error); }
};

const getAllPermissions = async (req, res, next) => {
    try {
        const permissions = await Permission.findAll();
        // Frontend expects data.data.data
        return successResponse(res, { data: permissions }, 'Permissions fetched successfully');
    } catch (error) { next(error); }
};

module.exports = {
    getAllRoles, createRole, updateRole, getAllPermissions
};
