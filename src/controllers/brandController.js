const { Brand } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');

const getAllBrands = async (req, res, next) => {
    try {
        const { page, size, name } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = {};
        if (name) {
            where.name = { [Op.like]: `%${name}%` };
        }

        const brands = await Brand.findAndCountAll({
            where,
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
            where: { is_active: true },
            order: [['name', 'ASC']]
        });
        return successResponse(res, brands, 'Active brands fetched successfully');
    } catch (error) {
        next(error);
    }
};

const createBrand = async (req, res, next) => {
    try {
        const { name, description } = req.body;
        const brand = await Brand.create({ name, description });
        return successResponse(res, brand, 'Brand created successfully', 201);
    } catch (error) {
        next(error);
    }
};

const updateBrand = async (req, res, next) => {
    try {
        const brand = await Brand.findByPk(req.params.id);
        if (!brand) return errorResponse(res, 'Brand not found', 404);

        await brand.update(req.body);
        return successResponse(res, brand, 'Brand updated successfully');
    } catch (error) {
        next(error);
    }
};

const toggleStatus = async (req, res, next) => {
    try {
        const brand = await Brand.findByPk(req.params.id);
        if (!brand) return errorResponse(res, 'Brand not found', 404);

        const action = req.params.action || (brand.is_active ? 'deactivate' : 'activate');
        brand.is_active = (action === 'activate');
        await brand.save();

        return successResponse(res, brand, `Brand ${action}d successfully`);
    } catch (error) {
        next(error);
    }
};

const deleteBrand = async (req, res, next) => {
    try {
        const brand = await Brand.findByPk(req.params.id);
        if (!brand) return errorResponse(res, 'Brand not found', 404);
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
