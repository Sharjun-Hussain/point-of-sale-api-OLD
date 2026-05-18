const { DiningArea, DiningTable, Sale, SaleItem, Product, Branch } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');
const auditService = require('../services/auditService');

// --- Dining Area Controller Methods ---

const getAllDiningAreas = async (req, res, next) => {
    try {
        const { name } = req.query;
        const where = { organization_id: req.user.organization_id };
        
        if (name) {
            where.name = { [Op.like]: `%${name}%` };
        }

        const areas = await DiningArea.findAll({
            where,
            include: [{ model: DiningTable, as: 'tables' }],
            order: [['name', 'ASC']]
        });

        return successResponse(res, areas, 'Dining areas fetched successfully');
    } catch (error) {
        next(error);
    }
};

const createDiningArea = async (req, res, next) => {
    try {
        const organization_id = req.user.organization_id;
        let branch_id = req.body.branch_id || req.user.branch_id;

        if (!branch_id) {
            const defaultBranch = await Branch.findOne({ where: { organization_id } });
            if (defaultBranch) {
                branch_id = defaultBranch.id;
            } else {
                return errorResponse(res, 'No branch found for this organization. Please configure a branch first.', 400);
            }
        }

        const { name } = req.body;

        if (!name) return errorResponse(res, 'Area name is required', 400);

        const area = await DiningArea.create({
            name,
            organization_id,
            branch_id
        });

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            organization_id,
            req.user.id,
            'DiningArea',
            area.id,
            { name: area.name },
            ipAddress,
            userAgent
        );

        return successResponse(res, area, 'Dining area created successfully', 201);
    } catch (error) {
        next(error);
    }
};

const updateDiningArea = async (req, res, next) => {
    try {
        const area = await DiningArea.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!area) return errorResponse(res, 'Dining area not found', 404);

        const oldValues = { name: area.name };
        await area.update(req.body);

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            req.user.organization_id,
            req.user.id,
            'DiningArea',
            area.id,
            oldValues,
            req.body,
            ipAddress,
            userAgent
        );

        return successResponse(res, area, 'Dining area updated successfully');
    } catch (error) {
        next(error);
    }
};

const deleteDiningArea = async (req, res, next) => {
    try {
        const area = await DiningArea.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!area) return errorResponse(res, 'Dining area not found', 404);

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logDelete(
            req.user.organization_id,
            req.user.id,
            'DiningArea',
            area.id,
            { name: area.name },
            ipAddress,
            userAgent
        );

        await area.destroy();
        return successResponse(res, null, 'Dining area deleted successfully');
    } catch (error) {
        next(error);
    }
};

// --- Dining Table Controller Methods ---

const getAllDiningTables = async (req, res, next) => {
    try {
        const { area_id, status } = req.query;
        const where = { organization_id: req.user.organization_id };

        if (area_id) where.dining_area_id = area_id;
        if (status) where.status = status;

        const tables = await DiningTable.findAll({
            where,
            include: [{ model: DiningArea, as: 'area', attributes: ['name'] }],
            order: [['table_number', 'ASC']]
        });

        return successResponse(res, tables, 'Dining tables fetched successfully');
    } catch (error) {
        next(error);
    }
};

const createDiningTable = async (req, res, next) => {
    try {
        const organization_id = req.user.organization_id;
        let branch_id = req.body.branch_id || req.user.branch_id;

        if (!branch_id) {
            const defaultBranch = await Branch.findOne({ where: { organization_id } });
            if (defaultBranch) {
                branch_id = defaultBranch.id;
            } else {
                return errorResponse(res, 'No branch found for this organization. Please configure a branch first.', 400);
            }
        }

        const { dining_area_id, table_number, capacity } = req.body;

        if (!dining_area_id || !table_number) {
            return errorResponse(res, 'Dining area and table number are required', 400);
        }

        const table = await DiningTable.create({
            organization_id,
            branch_id,
            dining_area_id,
            table_number,
            capacity: capacity || 4,
            status: 'free'
        });

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            organization_id,
            req.user.id,
            'DiningTable',
            table.id,
            { table_number: table.table_number },
            ipAddress,
            userAgent
        );

        return successResponse(res, table, 'Dining table created successfully', 201);
    } catch (error) {
        next(error);
    }
};

const updateDiningTable = async (req, res, next) => {
    try {
        const table = await DiningTable.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!table) return errorResponse(res, 'Dining table not found', 404);

        const oldValues = { table_number: table.table_number, status: table.status };
        await table.update(req.body);

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            req.user.organization_id,
            req.user.id,
            'DiningTable',
            table.id,
            oldValues,
            req.body,
            ipAddress,
            userAgent
        );

        return successResponse(res, table, 'Dining table updated successfully');
    } catch (error) {
        next(error);
    }
};

const deleteDiningTable = async (req, res, next) => {
    try {
        const table = await DiningTable.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!table) return errorResponse(res, 'Dining table not found', 404);

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logDelete(
            req.user.organization_id,
            req.user.id,
            'DiningTable',
            table.id,
            { table_number: table.table_number },
            ipAddress,
            userAgent
        );

        await table.destroy();
        return successResponse(res, null, 'Dining table deleted successfully');
    } catch (error) {
        next(error);
    }
};

const getTableDetailsWithSale = async (req, res, next) => {
    try {
        const table = await DiningTable.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id },
            include: [{ model: DiningArea, as: 'area', attributes: ['name'] }]
        });
        if (!table) return errorResponse(res, 'Dining table not found', 404);

        let activeSale = null;
        if (table.current_sale_id) {
            activeSale = await Sale.findOne({
                where: { id: table.current_sale_id, organization_id: req.user.organization_id },
                include: [
                    {
                        model: SaleItem,
                        as: 'items',
                        include: [{ model: Product, as: 'product', attributes: ['name', 'image'] }]
                    }
                ]
            });
        }

        return successResponse(res, { table, activeSale }, 'Dining table specifications fetched successfully');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllDiningAreas,
    createDiningArea,
    updateDiningArea,
    deleteDiningArea,
    getAllDiningTables,
    createDiningTable,
    updateDiningTable,
    deleteDiningTable,
    getTableDetailsWithSale
};
