const db = require('../models');
const {
    MeasurementUnit,
    Container,
    MainCategory,
    SubCategory,
    Brand,
    Unit,
    Attribute
} = db;
const { successResponse } = require('../utils/responseHandler');

/**
 * Common Metadata Controller
 */
const getMeasurementUnits = async (req, res, next) => {
    try {
        const units = await MeasurementUnit.findAll({ where: { is_active: true }, order: [['name', 'ASC']] });
        return successResponse(res, units, 'Measurement units fetched successfully');
    } catch (error) {
        next(error);
    }
};

const getContainers = async (req, res, next) => {
    try {
        const containers = await Container.findAll({ where: { is_active: true }, order: [['name', 'ASC']] });
        return successResponse(res, containers, 'Containers fetched successfully');
    } catch (error) {
        next(error);
    }
};

const getBulkOptions = async (req, res, next) => {
    try {
        const [
            mainCategories,
            subCategories,
            brands,
            units,
            measurements,
            containers,
            attributes
        ] = await Promise.all([
            MainCategory.findAll({ where: { is_active: true }, order: [['name', 'ASC']] }),
            SubCategory.findAll({ where: { is_active: true }, order: [['name', 'ASC']] }),
            Brand.findAll({ where: { is_active: true }, order: [['name', 'ASC']] }),
            Unit.findAll({ where: { is_active: true }, order: [['name', 'ASC']] }),
            MeasurementUnit.findAll({ where: { is_active: true }, order: [['name', 'ASC']] }),
            Container.findAll({ where: { is_active: true }, order: [['name', 'ASC']] }),
            Attribute.findAll({ order: [['name', 'ASC']] })
        ]);

        return successResponse(res, {
            mainCategories,
            subCategories,
            brands,
            units,
            measurements,
            containers,
            attributes
        }, 'Bulk options fetched successfully');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getMeasurementUnits,
    getContainers,
    getBulkOptions
};
