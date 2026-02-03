const { Container } = require('../models'); // Wait, incorrect import in my head.
const { successResponse: resSuccess, errorResponse: resError, paginatedResponse: resPaged } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');

const getAllContainers = async (req, res, next) => {
    try {
        const { page, size, name } = req.query;
        const { limit, offset } = getPagination(page, size);
        const where = name ? { name: { [Op.like]: `%${name}%` } } : {};
        const containers = await Container.findAndCountAll({ where, limit, offset, order: [['name', 'ASC']] });
        return resPaged(res, containers.rows, { total: containers.count, page: parseInt(page) || 1, limit }, 'Containers fetched');
    } catch (error) { next(error); }
};

const getActiveContainersList = async (req, res, next) => {
    try {
        const containers = await Container.findAll({ where: { is_active: true }, order: [['name', 'ASC']] });
        return resSuccess(res, containers, 'Active containers fetched');
    } catch (error) { next(error); }
};

const createContainer = async (req, res, next) => {
    try {
        const container = await Container.create(req.body);
        return resSuccess(res, container, 'Container created', 201);
    } catch (error) { next(error); }
};

const updateContainer = async (req, res, next) => {
    try {
        const container = await Container.findByPk(req.params.id);
        if (!container) return resError(res, 'Not found', 404);
        await container.update(req.body);
        return resSuccess(res, container, 'Container updated');
    } catch (error) { next(error); }
};

const toggleStatus = async (req, res, next) => {
    try {
        const container = await Container.findByPk(req.params.id);
        if (!container) return resError(res, 'Not found', 404);
        const action = req.params.action || (container.is_active ? 'deactivate' : 'activate');
        container.is_active = (action === 'activate');
        await container.save();
        return resSuccess(res, container, `Container ${action}d`);
    } catch (error) { next(error); }
};

module.exports = {
    getAllContainers, getActiveContainersList, createContainer, updateContainer, toggleStatus
};
