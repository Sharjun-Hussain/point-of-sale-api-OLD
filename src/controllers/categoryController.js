const { MainCategory, SubCategory } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');

// --- Main Category ---
const getAllMainCategories = async (req, res, next) => {
    try {
        const { page, size, name } = req.query;
        const { limit, offset } = getPagination(page, size);
        const where = name ? { name: { [Op.like]: `%${name}%` } } : {};
        const categories = await MainCategory.findAndCountAll({ where, limit, offset, order: [['name', 'ASC']] });
        return paginatedResponse(res, categories.rows, { total: categories.count, page: parseInt(page) || 1, limit }, 'Main Categories fetched');
    } catch (error) { next(error); }
};

const getActiveMainCategoriesList = async (req, res, next) => {
    try {
        const categories = await MainCategory.findAll({ where: { is_active: true }, order: [['name', 'ASC']] });
        return successResponse(res, categories, 'Active main categories fetched');
    } catch (error) { next(error); }
};

const createMainCategory = async (req, res, next) => {
    try {
        const category = await MainCategory.create(req.body);
        return successResponse(res, category, 'Main Category created', 201);
    } catch (error) { next(error); }
};

const updateMainCategory = async (req, res, next) => {
    try {
        const category = await MainCategory.findByPk(req.params.id);
        if (!category) return errorResponse(res, 'Not found', 404);
        await category.update(req.body);
        return successResponse(res, category, 'Main Category updated');
    } catch (error) { next(error); }
};

const toggleMainStatus = async (req, res, next) => {
    try {
        const category = await MainCategory.findByPk(req.params.id);
        if (!category) return errorResponse(res, 'Not found', 404);
        const action = req.params.action || (category.is_active ? 'deactivate' : 'activate');
        category.is_active = (action === 'activate');
        await category.save();
        return successResponse(res, category, `Main Category ${action}d`);
    } catch (error) { next(error); }
};

// --- Sub Category ---
const getAllSubCategories = async (req, res, next) => {
    try {
        const { page, size, name } = req.query;
        const { limit, offset } = getPagination(page, size);
        const where = name ? { name: { [Op.like]: `%${name}%` } } : {};
        const categories = await SubCategory.findAndCountAll({
            where, limit, offset, order: [['name', 'ASC']],
            include: [{ model: MainCategory, as: 'main_category' }]
        });
        return paginatedResponse(res, categories.rows, { total: categories.count, page: parseInt(page) || 1, limit }, 'Sub Categories fetched');
    } catch (error) { next(error); }
};

const getActiveSubCategoriesList = async (req, res, next) => {
    try {
        const where = { is_active: true };
        if (req.query.main_category_id) where.main_category_id = req.query.main_category_id;
        const categories = await SubCategory.findAll({ where, order: [['name', 'ASC']] });
        return successResponse(res, categories, 'Active sub categories fetched');
    } catch (error) { next(error); }
};

const createSubCategory = async (req, res, next) => {
    try {
        const category = await SubCategory.create(req.body);
        return successResponse(res, category, 'Sub Category created', 201);
    } catch (error) { next(error); }
};

const updateSubCategory = async (req, res, next) => {
    try {
        const category = await SubCategory.findByPk(req.params.id);
        if (!category) return errorResponse(res, 'Not found', 404);
        await category.update(req.body);
        return successResponse(res, category, 'Sub Category updated');
    } catch (error) { next(error); }
};

const toggleSubStatus = async (req, res, next) => {
    try {
        const category = await SubCategory.findByPk(req.params.id);
        if (!category) return errorResponse(res, 'Not found', 404);
        const action = req.params.action || (category.is_active ? 'deactivate' : 'activate');
        category.is_active = (action === 'activate');
        await category.save();
        return successResponse(res, category, `Sub Category ${action}d`);
    } catch (error) { next(error); }
};

module.exports = {
    getAllMainCategories, getActiveMainCategoriesList, createMainCategory, updateMainCategory, toggleMainStatus,
    getAllSubCategories, getActiveSubCategoriesList, createSubCategory, updateSubCategory, toggleSubStatus
};
