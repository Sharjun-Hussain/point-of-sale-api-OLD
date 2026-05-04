const db = require('../models');
const {
    MeasurementUnit,
    Container,
    MainCategory,
    SubCategory,
    Brand,
    Unit,
    Attribute,
    Product,
    Organization
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
        const where = { organization_id: req.user.organization_id, is_active: true };

        const [
            mainCategories,
            subCategories,
            brands,
            units,
            measurements,
            containers,
            attributes,
            lastProduct,
            organization
        ] = await Promise.all([
            MainCategory.findAll({ where, order: [['name', 'ASC']] }),
            SubCategory.findAll({ where, order: [['name', 'ASC']] }),
            Brand.findAll({ where, order: [['name', 'ASC']] }),
            Unit.findAll({ where, order: [['name', 'ASC']] }),
            MeasurementUnit.findAll({ where, order: [['name', 'ASC']] }),
            Container.findAll({ where, order: [['name', 'ASC']] }),
            Attribute.findAll({ where: { organization_id: req.user.organization_id }, order: [['name', 'ASC']] }),
            Product.findOne({ 
                where: { organization_id: req.user.organization_id }, 
                order: [['created_at', 'DESC']],
                attributes: ['code']
            }),
            Organization.findByPk(req.user.organization_id, { attributes: ['name'] })
        ]);

        return successResponse(res, {
            mainCategories,
            subCategories,
            brands,
            units,
            measurements,
            containers,
            attributes,
            lastProductCode: lastProduct?.code || null,
            organizationName: organization?.name || null
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
