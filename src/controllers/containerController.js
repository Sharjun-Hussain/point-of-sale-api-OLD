const { Container } = require('../models');
const { successResponse: resSuccess, errorResponse: resError, paginatedResponse: resPaged } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');

const getFormData = async (req, res, next) => {
    try {
        const { MeasurementUnit, Unit } = require('../models');
        const mUnits = await MeasurementUnit.findAll({
            where: { is_active: true, organization_id: req.user.organization_id },
            attributes: ['id', 'name', 'short_name'],
            order: [['name', 'ASC']]
        });
        const units = await Unit.findAll({
            where: { is_active: true, organization_id: req.user.organization_id },
            attributes: ['id', 'name', 'short_name'],
            order: [['name', 'ASC']]
        });
        return resSuccess(res, {
            measurement_units: mUnits,
            units: units
        }, 'Form data fetched');
    } catch (error) { next(error); }
};

const getAllContainers = async (req, res, next) => {

    try {
        const { page, size, name } = req.query;
        const { limit, offset } = getPagination(page, size);
        const where = { organization_id: req.user.organization_id };
        if (name) where.name = { [Op.like]: `%${name}%` };
        const { MeasurementUnit, Unit } = require('../models');
        const containers = await Container.findAndCountAll({
            where,
            limit,
            offset,
            order: [['name', 'ASC']],
            include: [
                { model: MeasurementUnit, as: 'measurement_unit', attributes: ['id', 'name', 'short_name'] },
                { model: Unit, as: 'base_unit', attributes: ['id', 'name', 'short_name'] }
            ]
        });
        return resPaged(res, containers.rows, { total: containers.count, page: parseInt(page) || 1, limit }, 'Containers fetched');
    } catch (error) { next(error); }
};

const getActiveContainersList = async (req, res, next) => {
    try {
        const { MeasurementUnit, Unit } = require('../models');
        const containers = await Container.findAll({
            where: { is_active: true, organization_id: req.user.organization_id },
            order: [['name', 'ASC']],
            include: [
                { model: MeasurementUnit, as: 'measurement_unit', attributes: ['id', 'name', 'short_name'] },
                { model: Unit, as: 'base_unit', attributes: ['id', 'name', 'short_name'] }
            ]
        });
        return resSuccess(res, containers, 'Active containers fetched');
    } catch (error) { next(error); }
};

const getContainerById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { MeasurementUnit, Unit } = require('../models');
        const container = await Container.findOne({
            where: { id, organization_id: req.user.organization_id },
            include: [
                { model: MeasurementUnit, as: 'measurement_unit', attributes: ['id', 'name', 'short_name'] },
                { model: Unit, as: 'base_unit', attributes: ['id', 'name', 'short_name'] }
            ]
        });

        if (!container) {
            console.log(`[GET] Container ${id} not found`);
            return resError(res, 'Container not found', 404);
        }

        return resSuccess(res, container, 'Container fetched');
    } catch (error) { next(error); }
};


const createContainer = async (req, res, next) => {
    try {
        const { name, description, measurement_unit_id, base_unit_id, capacity, slug, is_active } = req.body;
        const organization_id = req.user.organization_id;
        const { MeasurementUnit, Unit } = require('../models');

        // Validate measurement_unit_id if provided and not null/empty
        if (measurement_unit_id && measurement_unit_id !== "null") {
            const mUnit = await MeasurementUnit.findOne({
                where: { id: measurement_unit_id, organization_id }
            });
            if (!mUnit) {
                return resError(res, `Measurement Unit not found: ${measurement_unit_id}`, 400);
            }
        }

        // Validate base_unit_id if provided and not null/empty
        if (base_unit_id && base_unit_id !== "null") {
            const bUnit = await Unit.findOne({
                where: { id: base_unit_id, organization_id }
            });
            if (!bUnit) {
                return resError(res, `Base Unit not found: ${base_unit_id}`, 400);
            }
        }

        // Auto-generate slug if not provided
        let finalSlug = slug;
        if (!finalSlug && name) {
            finalSlug = name
                .toLowerCase()
                .trim()
                .replace(/[^\w\s-]/g, '') // Remove special characters
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .replace(/-+/g, '-'); // Replace multiple hyphens with single hyphen
        }

        const containerData = {
            name,
            slug: finalSlug,
            description,
            capacity: capacity || 0,
            measurement_unit_id: (measurement_unit_id === "" || measurement_unit_id === "null") ? null : (measurement_unit_id || null),
            base_unit_id: (base_unit_id === "" || base_unit_id === "null") ? null : (base_unit_id || null),
            is_active: is_active !== undefined ? is_active : true,
            organization_id
        };

        const container = await Container.create(containerData);

        // Reload with associations
        const reloadedContainer = await Container.findOne({
            where: { id: container.id, organization_id },
            include: [
                { model: MeasurementUnit, as: 'measurement_unit', attributes: ['id', 'name', 'short_name'] },
                { model: Unit, as: 'base_unit', attributes: ['id', 'name', 'short_name'] }
            ]
        });

        return resSuccess(res, reloadedContainer, 'Container created', 201);
    } catch (error) { next(error); }
};

const updateContainer = async (req, res, next) => {
    try {
        const { id } = req.params;
        const organization_id = req.user.organization_id;
        console.log(`[UPDATE] Attempting to find container with ID: "${id}"`);

        const container = await Container.findOne({
            where: { id, organization_id }
        });
        if (!container) {
            console.log(`[UPDATE] Container "${id}" not found in database.`);
            return resError(res, 'Container not found', 404);
        }


        const { name, description, measurement_unit_id, base_unit_id, capacity, slug, is_active } = req.body;
        console.log('[UPDATE] Request Body:', JSON.stringify(req.body, null, 2));

        const { MeasurementUnit, Unit } = require('../models');

        // Validate measurement_unit_id if provided and not null/empty
        if (measurement_unit_id) {
            const mUnit = await MeasurementUnit.findOne({
                where: { id: measurement_unit_id, organization_id }
            });
            if (!mUnit) {
                console.log(`[UPDATE] Invalid measurement_unit_id: ${measurement_unit_id}`);
                return resError(res, `Measurement Unit not found: ${measurement_unit_id}`, 400);
            }
        }

        // Validate base_unit_id if provided and not null/empty
        if (base_unit_id && base_unit_id !== "null") {
            const bUnit = await Unit.findOne({
                where: { id: base_unit_id, organization_id }
            });
            if (!bUnit) {
                console.log(`[UPDATE] Invalid base_unit_id: ${base_unit_id}`);
                return resError(res, `Base Unit not found: ${base_unit_id}`, 400);
            }
        }

        // Auto-generate slug if name is provided but slug is not
        let finalSlug = slug;
        if (!finalSlug && name && name !== container.name) {
            finalSlug = name
                .toLowerCase()
                .trim()
                .replace(/[^\w\s-]/g, '') // Remove special characters
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .replace(/-+/g, '-'); // Replace multiple hyphens with single hyphen
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (capacity !== undefined) updateData.capacity = capacity;
        if (finalSlug !== undefined) updateData.slug = finalSlug;

        // Handle IDs carefully: empty strings or "null" (as string) should be null
        if (measurement_unit_id !== undefined) {
            updateData.measurement_unit_id = (measurement_unit_id === "" || measurement_unit_id === "null") ? null : measurement_unit_id;
        }
        if (base_unit_id !== undefined) {
            updateData.base_unit_id = (base_unit_id === "" || base_unit_id === "null") ? null : base_unit_id;
        }

        if (is_active !== undefined) updateData.is_active = is_active;

        console.log('[UPDATE] Update Data:', JSON.stringify(updateData, null, 2));

        try {
            await container.update(updateData);

            // Reload with associations
            const reloadedContainer = await Container.findOne({
                where: { id, organization_id },
                include: [
                    { model: MeasurementUnit, as: 'measurement_unit', attributes: ['id', 'name', 'short_name'] },
                    { model: Unit, as: 'base_unit', attributes: ['id', 'name', 'short_name'] }
                ]
            });

            return resSuccess(res, reloadedContainer, 'Container updated');
        } catch (dbError) {
            console.error('[DATABASE UPDATE ERROR]:', dbError);
            return resError(res, `Database error: ${dbError.message}`, 500);
        }
    } catch (error) {
        console.error('[UPDATE CONTROLLER ERROR]:', error);
        next(error);
    }
};

const toggleStatus = async (req, res, next) => {
    try {
        const container = await Container.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!container) return resError(res, 'Not found', 404);
        const action = req.params.action || (container.is_active ? 'deactivate' : 'activate');
        container.is_active = (action === 'activate');
        await container.save();
        return resSuccess(res, container, `Container ${action}d`);
    } catch (error) { next(error); }
};

module.exports = {
    getAllContainers, getActiveContainersList, getContainerById, getFormData, createContainer, updateContainer, toggleStatus
};
