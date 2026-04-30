const { Role, Permission } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');

const getAllRoles = async (req, res, next) => {
    try {
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        
        const where = {
            [require('sequelize').Op.or]: [
                { organization_id: req.user.organization_id },
                { organization_id: null }
            ]
        };

        // Hide Super Admin role from everyone except Super Admins
        if (!isSuperAdmin) {
            where.name = { [require('sequelize').Op.ne]: 'Super Admin' };
        }

        const roles = await Role.findAll({
            where,
            include: [{ model: Permission, as: 'permissions' }]
        });
        return successResponse(res, { data: roles }, 'Roles fetched successfully');
    } catch (error) { next(error); }
};

const createRole = async (req, res, next) => {
    try {
        const { name, description, permission_ids, organization_id: target_org_id } = req.body;
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        
        // Block creation of any role named "Super Admin" by others
        if (name === 'Super Admin' && !isSuperAdmin) {
             return errorResponse(res, 'Critical Security Violation: Reserved system names cannot be used.', 403);
        }

        // System roles (org_id null) can only be created by Super Admins
        const organization_id = isSuperAdmin ? target_org_id : req.user.organization_id;
        
        if (!organization_id && !isSuperAdmin) {
            return errorResponse(res, 'Security Breach: You cannot create system-wide roles.', 403);
        }

        // Permission Scope Check: Non-SuperAdmins can only assign permissions they have
        let finalPermissionIds = permission_ids;
        if (!isSuperAdmin && permission_ids && permission_ids.length > 0) {
            const userPermissionIds = [];
            req.user.roles.forEach(r => {
                r.permissions?.forEach(p => userPermissionIds.push(p.id));
            });
            finalPermissionIds = permission_ids.filter(id => userPermissionIds.includes(id));
        }

        const role = await Role.create({ name, description, organization_id });

        if (finalPermissionIds) {
            await role.setPermissions(finalPermissionIds);
        }

        const createdRole = await Role.findOne({
            where: { id: role.id },
            include: [{ model: Permission, as: 'permissions' }]
        });
        return successResponse(res, createdRole, 'Role created successfully', 201);
    } catch (error) { next(error); }
};

const updateRole = async (req, res, next) => {
    try {
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        const role = await Role.findByPk(req.params.id);

        if (!role) return errorResponse(res, 'Role not found', 404);

        // Security check
        if (!isSuperAdmin && role.organization_id !== req.user.organization_id) {
            return errorResponse(res, 'Security Breach: Access Denied to this role configuration.', 403);
        }

        // Hard protection for Super Admin and Organization Admin roles
        const protectedRoles = ['Super Admin', 'Organization Admin'];
        if (protectedRoles.includes(role.name) && !isSuperAdmin) {
             return errorResponse(res, `Critical Security Violation: The ${role.name} role is immutable to non-system entities.`, 403);
        }

        const { name, description, permission_ids } = req.body;
        
        // Prevent renaming to Super Admin
        if (name === 'Super Admin' && role.name !== 'Super Admin' && !isSuperAdmin) {
             return errorResponse(res, 'Critical Security Violation: Reserved system names cannot be used.', 403);
        }

        await role.update({ name, description });

        if (permission_ids) {
            // Permission Scope Check
            let finalPermissionIds = permission_ids;
            if (!isSuperAdmin) {
                const userPermissionIds = [];
                req.user.roles.forEach(r => {
                    r.permissions?.forEach(p => userPermissionIds.push(p.id));
                });
                finalPermissionIds = permission_ids.filter(id => userPermissionIds.includes(id));
            }
            await role.setPermissions(finalPermissionIds);
        }

        return successResponse(res, role, 'Role updated successfully');
    } catch (error) { next(error); }
};

const getAllPermissions = async (req, res, next) => {
    try {
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        const allPermissions = await Permission.findAll();
        
        // Non-SuperAdmins can only assign permissions they themselves have
        const userPermissionIds = new Set();
        if (!isSuperAdmin) {
            req.user.roles.forEach(role => {
                role.permissions?.forEach(perm => {
                    userPermissionIds.add(perm.id);
                });
            });
        }

        const permissions = allPermissions.map(perm => {
            const p = perm.get({ plain: true });
            return {
                ...p,
                can_assign: isSuperAdmin || userPermissionIds.has(p.id)
            };
        });

        return successResponse(res, { data: permissions }, 'Permissions fetched successfully');
    } catch (error) { next(error); }
};

module.exports = {
    getAllRoles, createRole, updateRole, getAllPermissions
};
