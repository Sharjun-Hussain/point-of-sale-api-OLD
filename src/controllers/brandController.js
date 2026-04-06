const { Brand } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');
const auditService = require('../services/auditService');

const getAllBrands = async (req, res, next) => {
    try {
        const { page, size, name } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = {};
        if (name) {
            where.name = { [Op.like]: `%${name}%` };
        }

        const brands = await Brand.findAndCountAll({
            where: { ...where, organization_id: req.user.organization_id },
            limit,
            offset,
            order: [['name', 'ASC']]
        });

        return paginatedResponse(res, brands.rows, {
            total: brands.count,
            page: parseInt(page) || 1,
            limit
        }, 'Brands fetched successfully');
    } catch (error) {
        next(error);
    }
};

const getActiveBrandsList = async (req, res, next) => {
    try {
        const brands = await Brand.findAll({
            where: { is_active: true, organization_id: req.user.organization_id },
            order: [['name', 'ASC']]
        });
        return successResponse(res, brands, 'Active brands fetched successfully');
    } catch (error) {
        next(error);
    }
};

const createBrand = async (req, res, next) => {
    try {
        const organization_id = req.user.organization_id;
        const { name, description } = req.body;
        const brand = await Brand.create({ name, description, organization_id });

        // Log brand creation
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            organization_id,
            req.user.id,
            'Brand',
            brand.id,
            { name: brand.name },
            ipAddress,
            userAgent
        );

        return successResponse(res, brand, 'Brand created successfully', 201);
    } catch (error) {
        next(error);
    }
};

const updateBrand = async (req, res, next) => {
    try {
        const brand = await Brand.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!brand) return errorResponse(res, 'Brand not found', 404);

        const oldValues = { name: brand.name, description: brand.description };
        await brand.update(req.body);

        // Log brand update
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            req.user.organization_id,
            req.user.id,
            'Brand',
            brand.id,
            oldValues,
            req.body,
            ipAddress,
            userAgent
        );

        return successResponse(res, brand, 'Brand updated successfully');
    } catch (error) {
        next(error);
    }
};

const toggleStatus = async (req, res, next) => {
    try {
        const brand = await Brand.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!brand) return errorResponse(res, 'Brand not found', 404);

        const action = req.params.action || (brand.is_active ? 'deactivate' : 'activate');
        brand.is_active = (action === 'activate');
        await brand.save();

        // Log status toggle
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCustom(
            req.user.organization_id,
            req.user.id,
            brand.is_active ? 'ACTIVATE_BRAND' : 'DEACTIVATE_BRAND',
            `Brand ${brand.name} ${brand.is_active ? 'activated' : 'deactivated'}`,
            ipAddress,
            userAgent,
            { brand_id: brand.id }
        );

        return successResponse(res, brand, `Brand ${action}d successfully`);
    } catch (error) {
        next(error);
    }
};

const deleteBrand = async (req, res, next) => {
    try {
        const brand = await Brand.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!brand) return errorResponse(res, 'Brand not found', 404);

        // Log brand deletion
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logDelete(
            req.user.organization_id,
            req.user.id,
            'Brand',
            brand.id,
            { name: brand.name },
            ipAddress,
            userAgent
        );

        await brand.destroy();
        return successResponse(res, null, 'Brand deleted successfully');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllBrands,
    getActiveBrandsList,
    createBrand,
    updateBrand,
    toggleStatus,
    deleteBrand
};
