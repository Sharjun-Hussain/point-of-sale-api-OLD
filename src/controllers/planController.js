const { BusinessPlan } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');

/**
 * Business Plan Controller
 */
const getAllPlans = async (req, res, next) => {
    try {
        const { page, size } = req.query;
        const { limit, offset } = getPagination(page, size);

        const plans = await BusinessPlan.findAndCountAll({
            limit,
            offset,
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, plans.rows, {
            total: plans.count,
            page: parseInt(page) || 1,
            limit
        }, 'Business plans fetched successfully');
    } catch (error) {
        next(error);
    }
};

const createPlan = async (req, res, next) => {
    try {
        const plan = await BusinessPlan.create(req.body);
        return successResponse(res, plan, 'Business plan created successfully', 201);
    } catch (error) {
        next(error);
    }
};

const updatePlan = async (req, res, next) => {
    try {
        const plan = await BusinessPlan.findByPk(req.params.id);
        if (!plan) return errorResponse(res, 'Business plan not found', 404);

        await plan.update(req.body);
        return successResponse(res, plan, 'Business plan updated successfully');
    } catch (error) {
        next(error);
    }
};

const getPlanById = async (req, res, next) => {
    try {
        const plan = await BusinessPlan.findByPk(req.params.id);
        if (!plan) return errorResponse(res, 'Business plan not found', 404);
        return successResponse(res, plan, 'Business plan fetched successfully');
    } catch (error) {
        next(error);
    }
};

const deletePlan = async (req, res, next) => {
    try {
        const plan = await BusinessPlan.findByPk(req.params.id);
        if (!plan) return errorResponse(res, 'Business plan not found', 404);

        await plan.destroy();
        return successResponse(res, null, 'Business plan deleted successfully');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllPlans,
    createPlan,
    updatePlan,
    getPlanById,
    deletePlan
};
