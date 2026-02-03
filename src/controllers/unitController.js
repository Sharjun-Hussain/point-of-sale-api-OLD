const { Unit, MeasurementUnit } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');

// --- Unit ---
const getAllUnits = async (req, res, next) => {
    try {
        const { page, size, name } = req.query;
        const { limit, offset } = getPagination(page, size);
        const where = name ? { name: { [Op.like]: `%${name}%` } } : {};
        const units = await Unit.findAndCountAll({ where, limit, offset, order: [['name', 'ASC']] });
        return paginatedResponse(res, units.rows, { total: units.count, page: parseInt(page) || 1, limit }, 'Units fetched');
    } catch (error) { next(error); }
};

const getActiveUnitsList = async (req, res, next) => {
    try {
        const units = await Unit.findAll({ where: { is_active: true }, order: [['name', 'ASC']] });
        return successResponse(res, units, 'Active units fetched');
    } catch (error) { next(error); }
};

const createUnit = async (req, res, next) => {
    try {
        const unit = await Unit.create(req.body);
        return successResponse(res, unit, 'Unit created', 201);
    } catch (error) { next(error); }
};

const updateUnit = async (req, res, next) => {
    try {
        const unit = await Unit.findByPk(req.params.id);
        if (!unit) return errorResponse(res, 'Not found', 404);
        await unit.update(req.body);
        return successResponse(res, unit, 'Unit updated');
    } catch (error) { next(error); }
};

const toggleUnitStatus = async (req, res, next) => {
    try {
        const unit = await Unit.findByPk(req.params.id);
        if (!unit) return errorResponse(res, 'Not found', 404);
        const action = req.params.action || (unit.is_active ? 'deactivate' : 'activate');
        unit.is_active = (action === 'activate');
        await unit.save();
        return successResponse(res, unit, `Unit ${action}d`);
    } catch (error) { next(error); }
};

// --- Measurement Unit ---
const getAllMeasurementUnits = async (req, res, next) => {
    try {
        const { page, size, name } = req.query;
        const { limit, offset } = getPagination(page, size);
        const where = name ? { name: { [Op.like]: `%${name}%` } } : {};
        const units = await MeasurementUnit.findAndCountAll({ where, limit, offset, order: [['name', 'ASC']] });
        return paginatedResponse(res, units.rows, { total: units.count, page: parseInt(page) || 1, limit }, 'Measurement Units fetched');
    } catch (error) { next(error); }
};

const getActiveMeasurementUnitsList = async (req, res, next) => {
    try {
        const units = await MeasurementUnit.findAll({ where: { is_active: true }, order: [['name', 'ASC']] });
        return successResponse(res, units, 'Active measurement units fetched');
    } catch (error) { next(error); }
};

const createMeasurementUnit = async (req, res, next) => {
    try {
        const unit = await MeasurementUnit.create(req.body);
        return successResponse(res, unit, 'Measurement Unit created', 201);
    } catch (error) { next(error); }
};

const updateMeasurementUnit = async (req, res, next) => {
    try {
        const unit = await MeasurementUnit.findByPk(req.params.id);
        if (!unit) return errorResponse(res, 'Not found', 404);
        await unit.update(req.body);
        return successResponse(res, unit, 'Measurement Unit updated');
    } catch (error) { next(error); }
};

const toggleMeasurementStatus = async (req, res, next) => {
    try {
        const unit = await MeasurementUnit.findByPk(req.params.id);
        if (!unit) return errorResponse(res, 'Not found', 404);
        const action = req.params.action || (unit.is_active ? 'deactivate' : 'activate');
        unit.is_active = (action === 'activate');
        await unit.save();
        return successResponse(res, unit, `Measurement Unit ${action}d`);
    } catch (error) { next(error); }
};

module.exports = {
    getAllUnits, getActiveUnitsList, createUnit, updateUnit, toggleUnitStatus,
    getAllMeasurementUnits, getActiveMeasurementUnitsList, createMeasurementUnit, updateMeasurementUnit, toggleMeasurementStatus
};
