const {
    Stock,
    StockAdjustment,
    StockTransfer,
    StockTransferItem,
    Product,
    ProductVariant,
    Branch,
    ProductBatch,
    User,
    sequelize
} = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');
const auditService = require('../services/auditService');

/**
 * Get All Stocks
 */
const getAllStocks = async (req, res, next) => {
    try {
        const { page, size, branch_id, product_name, sku } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = {};
        if (branch_id) where.branch_id = branch_id;

        const productWhere = {};
        if (product_name) productWhere.name = { [Op.like]: `%${product_name}%` };

        const variantWhere = {};
        if (sku) variantWhere.sku = { [Op.like]: `%${sku}%` };

        const stocks = await Stock.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                {
                    model: Product,
                    as: 'product',
                    where: Object.keys(productWhere).length > 0 ? productWhere : null,
                    attributes: ['id', 'name', 'code', 'image']
                },
                {
                    model: ProductVariant,
                    as: 'variant',
                    where: Object.keys(variantWhere).length > 0 ? variantWhere : null,
                    attributes: ['id', 'name', 'sku', 'image']
                },
                { model: Branch, as: 'branch', attributes: ['id', 'name'] }
            ],
            order: [['product', 'name', 'ASC']]
        });

        return paginatedResponse(res, stocks.rows, {
            total: stocks.count,
            page: parseInt(page) || 1,
            limit
        }, 'Stocks fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Create Stock Adjustment
 */
const createStockAdjustment = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { branch_id, product_id, product_variant_id, quantity, type, reason } = req.body;
        const user_id = req.user.id;

        if (!branch_id || !product_id || !quantity || !type) {
            return errorResponse(res, 'Missing required fields', 400);
        }

        const qtyValue = parseFloat(quantity);

        // 1. Create Adjustment Record
        const adjustment = await StockAdjustment.create({
            branch_id,
            product_id,
            product_variant_id: product_variant_id || null,
            quantity: qtyValue,
            type,
            reason,
            user_id
        }, { transaction: t });

        // 2. Update Stock aggregate
        const [stock, created] = await Stock.findOrCreate({
            where: {
                branch_id,
                product_id,
                product_variant_id: product_variant_id || null
            },
            defaults: { quantity: 0 },
            transaction: t
        });

        let finalDeduction = 0;
        if (type === 'addition') {
            await stock.increment('quantity', { by: qtyValue, transaction: t });

            // Increment logic: Add to/Create a batch
            await ProductBatch.create({
                branch_id,
                product_id,
                product_variant_id: product_variant_id || null,
                quantity: qtyValue,
                batch_number: `ADJ-${Date.now()}`,
                purchase_date: new Date(),
                cost_price: 0, // Adjustment might not have cost info here
                is_active: true
            }, { transaction: t });

        } else if (type === 'subtraction') {
            await stock.decrement('quantity', { by: qtyValue, transaction: t });
            finalDeduction = qtyValue;
        } else if (type === 'set_to') {
            const diff = qtyValue - parseFloat(stock.quantity);
            stock.quantity = qtyValue;
            await stock.save({ transaction: t });

            if (diff > 0) {
                // Increment
                await ProductBatch.create({
                    branch_id,
                    product_id,
                    product_variant_id: product_variant_id || null,
                    quantity: diff,
                    batch_number: `ADJ-${Date.now()}`,
                    purchase_date: new Date(),
                    is_active: true
                }, { transaction: t });
            } else if (diff < 0) {
                // Decrement
                finalDeduction = Math.abs(diff);
            }
        }

        // Handle Batch Deduction for subtractions
        if (finalDeduction > 0) {
            const batches = await ProductBatch.findAll({
                where: {
                    branch_id,
                    product_id,
                    product_variant_id: product_variant_id || null,
                    quantity: { [Op.gt]: 0 }
                },
                order: [['created_at', 'ASC']], // FIFO
                transaction: t
            });

            let remainingToDeduct = finalDeduction;
            for (const batch of batches) {
                if (remainingToDeduct <= 0) break;
                const available = parseFloat(batch.quantity);
                const deduct = Math.min(available, remainingToDeduct);
                await batch.decrement('quantity', { by: deduct, transaction: t });
                remainingToDeduct -= deduct;
            }
        }

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            req.user.organization_id,
            user_id,
            'StockAdjustment',
            adjustment.id,
            { type, quantity: qtyValue, branch_id },
            ipAddress,
            userAgent
        );

        await t.commit();
        return successResponse(res, adjustment, 'Stock adjusted successfully', 201);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

/**
 * Create Stock Transfer
 */
const createStockTransfer = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { from_branch_id, to_branch_id, transfer_date, notes, items } = req.body;
        const organization_id = req.user.organization_id;
        const user_id = req.user.id;

        if (!from_branch_id || !to_branch_id || !items || items.length === 0) {
            return errorResponse(res, 'Missing required fields', 400);
        }

        // 1. Generate Transfer Number
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await StockTransfer.count({ where: { organization_id } });
        const transfer_number = `TR-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;

        // 2. Create Transfer Header
        const transfer = await StockTransfer.create({
            organization_id,
            from_branch_id,
            to_branch_id,
            user_id,
            transfer_number,
            transfer_date: transfer_date || new Date(),
            status: 'completed', // For now, direct completion. Pending/Received can be extra steps.
            notes
        }, { transaction: t });

        // 3. Process Items
        for (const item of items) {
            const { product_id, product_variant_id, quantity } = item;
            const qtyValue = parseFloat(quantity);

            await StockTransferItem.create({
                stock_transfer_id: transfer.id,
                product_id,
                product_variant_id: product_variant_id || null,
                quantity: qtyValue
            }, { transaction: t });

            // FROM Branch: Deduct Stock
            const [fromStock] = await Stock.findOrCreate({
                where: { branch_id: from_branch_id, product_id, product_variant_id: product_variant_id || null },
                defaults: { quantity: 0 },
                transaction: t
            });
            await fromStock.decrement('quantity', { by: qtyValue, transaction: t });

            // TO Branch: Add Stock
            const [toStock] = await Stock.findOrCreate({
                where: { branch_id: to_branch_id, product_id, product_variant_id: product_variant_id || null },
                defaults: { quantity: 0 },
                transaction: t
            });
            await toStock.increment('quantity', { by: qtyValue, transaction: t });

            // Batch Deduction (FIFO) from source branch
            const batches = await ProductBatch.findAll({
                where: {
                    branch_id: from_branch_id,
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

                // Create corresponding batch in destination branch
                await ProductBatch.create({
                    branch_id: to_branch_id,
                    product_id,
                    product_variant_id: product_variant_id || null,
                    quantity: deduct,
                    batch_number: batch.batch_number,
                    expiry_date: batch.expiry_date,
                    cost_price: batch.cost_price,
                    selling_price: batch.selling_price,
                    wholesale_price: batch.wholesale_price,
                    purchase_date: batch.purchase_date,
                    is_active: true
                }, { transaction: t });

                remainingToDeduct -= deduct;
            }

            // If still remaining (negative stock movement), create a "Transfer" batch at dest
            if (remainingToDeduct > 0) {
                await ProductBatch.create({
                    branch_id: to_branch_id,
                    product_id,
                    product_variant_id: product_variant_id || null,
                    quantity: remainingToDeduct,
                    batch_number: `TR-NEG-${transfer_number}`,
                    purchase_date: new Date(),
                    is_active: true
                }, { transaction: t });
            }
        }

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            organization_id,
            user_id,
            'StockTransfer',
            transfer.id,
            { transfer_number, from_branch_id, to_branch_id, items_count: items.length },
            ipAddress,
            userAgent
        );

        await t.commit();
        return successResponse(res, transfer, 'Stock transferred successfully', 201);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

/**
 * Get All Transfers
 */
const getAllTransfers = async (req, res, next) => {
    try {
        const { page, size, from_branch_id, to_branch_id } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = { organization_id: req.user.organization_id };
        if (from_branch_id) where.from_branch_id = from_branch_id;
        if (to_branch_id) where.to_branch_id = to_branch_id;

        const transfers = await StockTransfer.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                { model: Branch, as: 'from_branch', attributes: ['name'] },
                { model: Branch, as: 'to_branch', attributes: ['name'] },
                { model: User, as: 'user', attributes: ['name'] }
            ],
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, transfers.rows, {
            total: transfers.count,
            page: parseInt(page) || 1,
            limit
        }, 'Transfers fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Get Transfer By ID
 */
const getTransferById = async (req, res, next) => {
    try {
        const transfer = await StockTransfer.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id },
            include: [
                { model: Branch, as: 'from_branch' },
                { model: Branch, as: 'to_branch' },
                { model: User, as: 'user' },
                {
                    model: StockTransferItem,
                    as: 'items',
                    include: [
                        { model: Product, as: 'product' },
                        { model: ProductVariant, as: 'variant' }
                    ]
                }
            ]
        });

        if (!transfer) return errorResponse(res, 'Transfer not found', 404);
        return successResponse(res, transfer, 'Transfer fetched successfully');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllStocks,
    createStockAdjustment,
    createStockTransfer,
    getAllTransfers,
    getTransferById
};
