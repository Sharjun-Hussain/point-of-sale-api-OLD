const db = require('../models');
const { AuditLog, User, Organization } = db;
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');

/**
 * Get all audit logs with filtering
 */
const getAllAuditLogs = async (req, res, next) => {
    try {
        const {
            page,
            size,
            user_id,
            entity_type,
            entity_id,
            action,
            status,
            start_date,
            end_date,
            search
        } = req.query;

        const { limit, offset } = getPagination(page, size);

        // Build where clause
        const where = { organization_id: req.user.organization_id };

        if (user_id) where.user_id = user_id;
        if (entity_type) where.entity_type = entity_type;
        if (entity_id) where.entity_id = entity_id;
        if (action) where.action = action;
        if (status) where.status = status;

        // Date range filter
        if (start_date || end_date) {
            where.created_at = {};
            if (start_date) where.created_at[Op.gte] = new Date(start_date);
            if (end_date) where.created_at[Op.lte] = new Date(end_date);
        }

        // Search in description
        if (search) {
            where.description = { [Op.like]: `%${search}%` };
        }

        const auditLogs = await AuditLog.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'name', 'email']
                }
            ],
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, auditLogs.rows, {
            total: auditLogs.count,
            page: parseInt(page) || 1,
            limit
        }, 'Audit logs fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Get audit log by ID
 */
const getAuditLogById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const auditLog = await AuditLog.findOne({
            where: {
                id,
                organization_id: req.user.organization_id
            },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'name', 'email']
                }
            ]
        });

        if (!auditLog) {
            return errorResponse(res, 'Audit log not found', 404);
        }

        return successResponse(res, auditLog, 'Audit log fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Get audit trail for a specific entity
 */
const getEntityAuditTrail = async (req, res, next) => {
    try {
        const { entityType, entityId } = req.params;
        const { page, size } = req.query;
        const { limit, offset } = getPagination(page, size);

        const auditLogs = await AuditLog.findAndCountAll({
            where: {
                organization_id: req.user.organization_id,
                entity_type: entityType,
                entity_id: entityId
            },
            limit,
            offset,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'name', 'email']
                }
            ],
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, auditLogs.rows, {
            total: auditLogs.count,
            page: parseInt(page) || 1,
            limit
        }, 'Entity audit trail fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Get user activity history
 */
const getUserActivity = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { page, size, action, start_date, end_date } = req.query;
        const { limit, offset } = getPagination(page, size);

        // Check if user can view this activity (admin or own activity)
        if (req.user.id !== userId && !req.user.roles?.some(r => r.name === 'Admin')) {
            return errorResponse(res, 'Unauthorized to view this user activity', 403);
        }

        const where = {
            organization_id: req.user.organization_id,
            user_id: userId
        };

        if (action) where.action = action;

        if (start_date || end_date) {
            where.created_at = {};
            if (start_date) where.created_at[Op.gte] = new Date(start_date);
            if (end_date) where.created_at[Op.lte] = new Date(end_date);
        }

        const auditLogs = await AuditLog.findAndCountAll({
            where,
            limit,
            offset,
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, auditLogs.rows, {
            total: auditLogs.count,
            page: parseInt(page) || 1,
            limit
        }, 'User activity fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Get audit statistics
 */
const getAuditStats = async (req, res, next) => {
    try {
        const { start_date, end_date } = req.query;

        const where = { organization_id: req.user.organization_id };

        if (start_date || end_date) {
            where.created_at = {};
            if (start_date) where.created_at[Op.gte] = new Date(start_date);
            if (end_date) where.created_at[Op.lte] = new Date(end_date);
        }

        // Get counts by action
        const actionStats = await AuditLog.findAll({
            where,
            attributes: [
                'action',
                [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
            ],
            group: ['action']
        });

        // Get counts by entity type
        const entityStats = await AuditLog.findAll({
            where,
            attributes: [
                'entity_type',
                [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
            ],
            group: ['entity_type']
        });

        // Get counts by user
        const userStats = await AuditLog.findAll({
            where,
            attributes: [
                'user_id',
                [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
            ],
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['name', 'email']
                }
            ],
            group: ['user_id', 'user.id', 'user.name', 'user.email'],
            order: [[db.sequelize.fn('COUNT', db.sequelize.col('id')), 'DESC']],
            limit: 10
        });

        // Get success/failure counts
        const statusStats = await AuditLog.findAll({
            where,
            attributes: [
                'status',
                [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
            ],
            group: ['status']
        });

        return successResponse(res, {
            actionStats,
            entityStats,
            userStats,
            statusStats
        }, 'Audit statistics fetched successfully');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllAuditLogs,
    getAuditLogById,
    getEntityAuditTrail,
    getUserActivity,
    getAuditStats
};
