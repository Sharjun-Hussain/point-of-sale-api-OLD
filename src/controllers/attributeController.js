const db = require('../models');
const { Attribute } = db;
const { successResponse, errorResponse } = require('../utils/responseHandler');

/**
 * Attribute Controller
 */
const getAllAttributes = async (req, res, next) => {
    try {
        const attributes = await Attribute.findAll({
            where: { organization_id: req.user.organization_id },
            order: [['name', 'ASC']]
        });
        return successResponse(res, attributes, 'Attributes fetched successfully');
    } catch (error) {
        next(error);
    }
};

const createAttribute = async (req, res, next) => {
    try {
        const { name, is_active } = req.body;

        if (!name) return errorResponse(res, 'Attribute name is required', 400);

        const attribute = await Attribute.create({
            name,
            is_active: is_active !== undefined ? is_active : true,
            organization_id: req.user.organization_id
        });

        return successResponse(res, attribute, 'Attribute created successfully', 201);
    } catch (error) {
        next(error);
    }
};

const updateAttribute = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, is_active } = req.body;

        const attribute = await Attribute.findOne({
            where: { id, organization_id: req.user.organization_id }
        });

        if (!attribute) return errorResponse(res, 'Attribute not found', 404);

        await attribute.update({ name, is_active });
        return successResponse(res, attribute, 'Attribute updated successfully');
    } catch (error) {
        next(error);
    }
};

const deleteAttribute = async (req, res, next) => {
    try {
        const { id } = req.params;
        const attribute = await Attribute.findOne({
            where: { id, organization_id: req.user.organization_id }
        });

        if (!attribute) return errorResponse(res, 'Attribute not found', 404);

        await attribute.destroy();
        return successResponse(res, null, 'Attribute deleted successfully');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllAttributes,
    createAttribute,
    updateAttribute,
    deleteAttribute
};
