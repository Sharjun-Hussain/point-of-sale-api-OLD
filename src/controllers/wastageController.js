const { 
    Wastage, 
    Stock, 
    ProductBatch, 
    Product, 
    ProductVariant, 
    Branch, 
    User, 
    sequelize 
} = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');
const auditService = require('../services/auditService');

/**
 * Get All Wastage Logs
 */
const getWastages = async (req, res, next) => {
    try {
        const { page, size, branch_id, product_id, wastage_type } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = { organization_id: req.user.organization_id };
        if (branch_id) where.branch_id = branch_id;
        if (product_id) where.product_id = product_id;
        if (wastage_type) where.wastage_type = wastage_type;

        const wastages = await Wastage.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                { model: Product, as: 'product', attributes: ['name', 'code'] },
                { model: ProductVariant, as: 'variant', attributes: ['name', 'sku'] },
                { model: Branch, as: 'branch', attributes: ['name'] },
                { model: User, as: 'user', attributes: ['name'] }
            ],
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, wastages.rows, {
            total: wastages.count,
            page: parseInt(page) || 1,
            limit
        }, 'Wastage logs fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Record New Wastage
 */
const createWastage = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { 
            branch_id, 
            product_id, 
            product_variant_id, 
            quantity, 
            wastage_type, 
            reason, 
            notes 
        } = req.body;
        const organization_id = req.user.organization_id;
        const user_id = req.user.id;

        if (!branch_id || !product_id || !quantity || !reason) {
            return errorResponse(res, 'Missing required fields', 400);
        }

        const qtyValue = parseFloat(quantity);

        // 1. Create Wastage Record
        const wastage = await Wastage.create({
            organization_id,
            branch_id,
            product_id,
            product_variant_id: product_variant_id || null,
            quantity: qtyValue,
            wastage_type: wastage_type || 'finished_good',
            reason,
            notes,
            user_id
        }, { transaction: t });

        // 2. Update Stock Aggregate
        const stock = await Stock.findOne({
            where: {
                organization_id,
                branch_id,
                product_id,
                product_variant_id: product_variant_id || null
            },
            transaction: t
        });

        if (!stock || parseFloat(stock.quantity) < qtyValue) {
            // We allow negative stock if configured, but usually for wastage it should exist.
            // For now, let's just deduct.
            if (!stock) {
                 await Stock.create({
                    organization_id,
                    branch_id,
                    product_id,
                    product_variant_id: product_variant_id || null,
                    quantity: -qtyValue
                }, { transaction: t });
            } else {
                await stock.decrement('quantity', { by: qtyValue, transaction: t });
            }
        } else {
            await stock.decrement('quantity', { by: qtyValue, transaction: t });
        }

        // 3. Handle Batch Deduction (FIFO)
        const batches = await ProductBatch.findAll({
            where: {
                organization_id,
                branch_id,
                product_id,
                product_variant_id: product_variant_id || null,
                quantity: { [Op.gt]: 0 }
            },
            order: [['created_at', 'ASC']],
            transaction: t
        });

        let remainingToDeduct = qtyValue;
        for (const batch of batches) {
            if (remainingToDeduct <= 0) break;
            const available = parseFloat(batch.quantity);
            const deduct = Math.min(available, remainingToDeduct);

            await batch.decrement('quantity', { by: deduct, transaction: t });
            remainingToDeduct -= deduct;
        }

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            organization_id,
            user_id,
            'Wastage',
            wastage.id,
            { product_id, quantity: qtyValue, reason },
            ipAddress,
            userAgent
        );

        await t.commit();
        return successResponse(res, wastage, 'Wastage recorded successfully', 201);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

module.exports = {
    getWastages,
    createWastage
};
