const { Employee, User, Role, Organization, Branch, sequelize } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { hashPassword } = require('../utils/passwordHelper');
const { Op } = require('sequelize');
const auditService = require('../services/auditService');

const getAllEmployees = async (req, res, next) => {
    try {
        const { page, size, name, branch_id, is_active } = req.query;
        const { limit, offset } = getPagination(page, size);
        const organization_id = req.user.organization_id;

        const where = { organization_id };
        if (name) {
            where.name = { [Op.like]: `%${name}%` };
        }
        if (branch_id) {
            // Filter by ANY branch assignment (Primary OR Secondary)
            // This is more industrial for a multi-branch filter
            where[Op.or] = [
                { branch_id: branch_id },
                { '$branches.id$': branch_id }
            ];
        }
        if (is_active !== undefined) {
            where.is_active = is_active === 'true';
        }

        const employees = await Employee.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                { 
                    model: User, 
                    as: 'user',
                    attributes: ['id', 'email', 'profile_image', 'is_active'],
                    include: [{ model: Role, as: 'roles', attributes: ['id', 'name'] }]
                },
                { model: Branch, as: 'primaryBranch', attributes: ['id', 'name'] },
                { model: Branch, as: 'branches', attributes: ['id', 'name'], through: { attributes: ['is_primary'] } }
            ],
            distinct: true,
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, employees.rows, {
            total: employees.count,
            page: parseInt(page) || 1,
            limit
        }, 'Employees fetched successfully');
    } catch (error) { next(error); }
};

const getEmployeeById = async (req, res, next) => {
    try {
        const employee = await Employee.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id },
            include: [
                { 
                    model: User, 
                    as: 'user',
                    include: [{ model: Role, as: 'roles' }]
                },
                { model: Branch, as: 'primaryBranch' },
                { model: Branch, as: 'branches', through: { attributes: ['is_primary'] } }
            ]
        });

        if (!employee) return errorResponse(res, 'Employee not found', 404);
        return successResponse(res, employee, 'Employee fetched successfully');
    } catch (error) { next(error); }
};

const createEmployee = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        let { 
            name, first_name, last_name, email, phone, nic, 
            joined_date, address, designation, branch_id,
            additional_branch_ids,
            grant_login, password, role_ids 
        } = req.body;
        
        const organization_id = req.user.organization_id;

        // 1. Basic Validations
        if (email) {
            const existingEmployee = await Employee.findOne({ where: { email, organization_id } });
            if (existingEmployee) return errorResponse(res, 'Employee with this email already exists', 409);
        }

        // 2. Handle Login Account if requested
        let userId = null;
        if (grant_login === true || grant_login === 'true') {
            if (!email || !password) {
                await t.rollback();
                return errorResponse(res, 'Email and password are required for system access', 400);
            }

            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                await t.rollback();
                return errorResponse(res, 'A system user with this email already exists', 409);
            }

            const hashedPassword = await hashPassword(password);
            const user = await User.create({
                name: name || `${first_name} ${last_name}`,
                email,
                password: hashedPassword,
                organization_id,
                is_active: true
            }, { transaction: t });

            userId = user.id;

            // Handle Roles
            if (role_ids) {
                if (typeof role_ids === 'string') {
                    try { role_ids = JSON.parse(role_ids); } catch (e) { role_ids = role_ids.split(',').filter(Boolean); }
                }
                await user.setRoles(role_ids, { transaction: t });
            }
        }

        // 3. Create Employee Master Record
        const employee = await Employee.create({
            user_id: userId,
            name: name || [first_name, last_name].filter(Boolean).join(' '),
            first_name,
            last_name,
            email,
            phone,
            nic,
            joined_date,
            address,
            designation,
            branch_id, // This remains the "Primary Master Branch"
            organization_id,
            is_active: true
        }, { transaction: t });

        // 4. Handle Multi-Branch Assignments
        // Always add the primary branch to the join table
        if (branch_id) {
            await employee.addBranch(branch_id, { through: { is_primary: true }, transaction: t });
        }

        // Add additional branches
        if (additional_branch_ids) {
            if (typeof additional_branch_ids === 'string') {
                try { additional_branch_ids = JSON.parse(additional_branch_ids); } catch (e) { additional_branch_ids = additional_branch_ids.split(',').filter(Boolean); }
            }
            // Filter out the primary branch to avoid duplicates if accidentally sent in both
            const secondaries = additional_branch_ids.filter(id => id !== branch_id);
            if (secondaries.length > 0) {
                await employee.addBranches(secondaries, { through: { is_primary: false }, transaction: t });
            }
        }

        await t.commit();

        const createdEmployee = await Employee.findByPk(employee.id, {
            include: [
                { model: User, as: 'user', include: [{ model: Role, as: 'roles' }] },
                { model: Branch, as: 'primaryBranch' },
                { model: Branch, as: 'branches' }
            ]
        });

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(organization_id, req.user.id, 'Employee', employee.id, { name: employee.name, grant_login }, ipAddress, userAgent);

        return successResponse(res, createdEmployee, 'Employee created successfully', 201);
    } catch (error) {
        if (t) await t.rollback();
        next(error);
    }
};

const updateEmployee = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const employee = await Employee.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id },
            include: [{ model: User, as: 'user' }]
        });

        if (!employee) return errorResponse(res, 'Employee not found', 404);

        let { 
            name, first_name, last_name, email, phone, nic, 
            joined_date, address, designation, branch_id,
            additional_branch_ids,
            password, role_ids, is_active, profile_image
        } = req.body;

        // Update Employee Profile
        const employeeUpdateData = {
            name: name || [first_name, last_name].filter(Boolean).join(' '),
            first_name, last_name, phone, nic, joined_date, address, designation, branch_id
        };
        
        if (is_active !== undefined) employeeUpdateData.is_active = is_active;
        
        await employee.update(employeeUpdateData, { transaction: t });

        // Update Multi-Branch Assignments
        if (branch_id || additional_branch_ids) {
            // We'll clear and rebuild assignments to ensure is_primary is correct
            await sequelize.query('DELETE FROM employee_branches WHERE employee_id = ?', {
                replacements: [employee.id],
                transaction: t
            });

            if (branch_id) {
                await employee.addBranch(branch_id, { through: { is_primary: true }, transaction: t });
            }

            if (additional_branch_ids) {
                if (typeof additional_branch_ids === 'string') {
                    try { additional_branch_ids = JSON.parse(additional_branch_ids); } catch (e) { additional_branch_ids = additional_branch_ids.split(',').filter(Boolean); }
                }
                const secondaries = additional_branch_ids.filter(id => id !== branch_id);
                if (secondaries.length > 0) {
                    await employee.addBranches(secondaries, { through: { is_primary: false }, transaction: t });
                }
            }
        }

        // Update Linked User if exists
        if (employee.user) {
            const userUpdateData = { name: employeeUpdateData.name };
            
            if (password) userUpdateData.password = await hashPassword(password);
            if (is_active !== undefined) userUpdateData.is_active = is_active;
            if (profile_image) userUpdateData.profile_image = profile_image;
            if (req.file) userUpdateData.profile_image = req.file.path;

            await employee.user.update(userUpdateData, { transaction: t });

            if (role_ids) {
                if (typeof role_ids === 'string') {
                    try { role_ids = JSON.parse(role_ids); } catch (e) { role_ids = role_ids.split(',').filter(Boolean); }
                }
                await employee.user.setRoles(role_ids, { transaction: t });
            }
        }

        await t.commit();

        const updatedEmployee = await Employee.findByPk(employee.id, {
            include: [
                { model: User, as: 'user', include: [{ model: Role, as: 'roles' }] },
                { model: Branch, as: 'primaryBranch' },
                { model: Branch, as: 'branches' }
            ]
        });

        return successResponse(res, updatedEmployee, 'Employee profile updated successfully');
    } catch (error) {
        if (t) await t.rollback();
        next(error);
    }
};

/**
 * Toggle Staff Enrollment Status (HR)
 * Deactivating an employee also automatically deactivates their linked system user.
 */
const toggleStatus = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const employee = await Employee.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id },
            include: [{ model: User, as: 'user' }]
        });

        if (!employee) return errorResponse(res, 'Employee not found', 404);

        const newStatus = !employee.is_active;
        await employee.update({ is_active: newStatus }, { transaction: t });

        // Safety Cascade: If staff is deactivated, login access MUST be revoked.
        if (employee.user && !newStatus) {
            await employee.user.update({ is_active: false }, { transaction: t });
            // Cleanup sessions
            await sequelize.models.RefreshToken.destroy({ where: { user_id: employee.user.id }, transaction: t });
        }

        await t.commit();
        return successResponse(res, { id: employee.id, is_active: newStatus }, `Employee ${newStatus ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
        if (t) await t.rollback();
        next(error);
    }
};

/**
 * Toggle System Workstation Access (Login Only)
 * Allows revoking/granting access without affecting the employee's HR record.
 */
const toggleLoginAccess = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const employee = await Employee.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id },
            include: [{ model: User, as: 'user' }]
        });

        if (!employee) return errorResponse(res, 'Staff member not found', 404);
        if (!employee.user) {
            await t.rollback();
            return errorResponse(res, 'This staff member does not have a linked system account. Please edit their profile to grant access.', 400);
        }

        const newStatus = !employee.user.is_active;
        await employee.user.update({ is_active: newStatus }, { transaction: t });

        if (!newStatus) {
            // Cleanup sessions if access is revoked
            await sequelize.models.RefreshToken.destroy({ where: { user_id: employee.user.id }, transaction: t });
        }

        await t.commit();
        return successResponse(res, { id: employee.id, login_access: newStatus }, `System access ${newStatus ? 'granted' : 'revoked'} successfully`);
    } catch (error) {
        if (t) await t.rollback();
        next(error);
    }
};

const deleteEmployee = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const employee = await Employee.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });

        if (!employee) return errorResponse(res, 'Employee not found', 404);

        const organization_id = req.user.organization_id;
        const employeeId = employee.id;
        const employeeName = employee.name;
        const userId = employee.user_id;

        // 1. Industrial History Check (Safety First)
        if (userId) {
            // Check for critical workstation history
            const [hasSales, hasPurchases, hasStockMoves] = await Promise.all([
                sequelize.models.SaleEmployee.findOne({ where: { user_id: userId } }),
                sequelize.models.PurchaseOrder.findOne({ where: { user_id: userId } }),
                sequelize.models.StockTransfer.findOne({ where: { user_id: userId } })
            ]);

            if (hasSales || hasPurchases || hasStockMoves) {
                await t.rollback();
                return errorResponse(res, 'Cannot remove staff with transactional history. Please deactivate their account instead to preserve audit trails.', 400);
            }

            // 2. Cleanup Non-Critical Dependencies
            await sequelize.models.RefreshToken.destroy({ where: { user_id: userId }, transaction: t });
        }

        // 3. Clear multi-branch assignments
        await sequelize.query('DELETE FROM employee_branches WHERE employee_id = ?', {
            replacements: [employeeId],
            transaction: t
        });

        // 4. Delete Employee Record
        await employee.destroy({ transaction: t });

        // 5. Delete Linked User if allowed
        if (userId) {
            const user = await User.findByPk(userId);
            if (user) {
                await user.destroy({ transaction: t });
            }
        }

        await t.commit();

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logDelete(organization_id, req.user.id, 'Employee', employeeId, { name: employeeName }, ipAddress, userAgent);

        return successResponse(res, null, 'Employee removed successfully');
    } catch (error) {
        if (t) await t.rollback();
        next(error);
    }
};

module.exports = {
    getAllEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    toggleStatus,
    toggleLoginAccess,
    deleteEmployee
};
