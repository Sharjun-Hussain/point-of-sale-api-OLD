const { 
    ProductionOrder, 
    ProductionOrderItem, 
    Recipe, 
    RecipeItem, 
    Stock, 
    ProductBatch, 
    Product, 
    ProductVariant, 
    sequelize 
} = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');

/**
 * Production Controller
 * Handles manufacturing batches and stock transformations
 */

const createProductionOrder = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { recipe_id, quantity_planned, branch_id, notes, start_date } = req.body;
        const organization_id = req.user.organization_id;

        // 1. Fetch Recipe
        const recipe = await Recipe.findOne({
            where: { id: recipe_id, organization_id },
            include: [{ model: RecipeItem, as: 'items' }]
        });

        if (!recipe) return errorResponse(res, 'Recipe not found', 404);

        // 2. Generate Order Number
        const count = await ProductionOrder.count({ where: { organization_id } });
        const order_number = `PO-${Date.now()}-${(count + 1).toString().padStart(4, '0')}`;

        // 3. Create Order Header
        const order = await ProductionOrder.create({
            organization_id,
            branch_id,
            recipe_id,
            order_number,
            product_id: recipe.product_id,
            product_variant_id: recipe.product_variant_id,
            quantity_planned,
            status: 'pending',
            start_date: start_date || new Date(),
            notes,
            user_id: req.user.id
        }, { transaction: t });

        // 4. Create Order Items (Explode BOM)
        const orderItems = recipe.items.map(ri => ({
            production_order_id: order.id,
            raw_material_id: ri.raw_material_id,
            raw_material_variant_id: ri.raw_material_variant_id,
            quantity_planned: (parseFloat(ri.quantity) / parseFloat(recipe.batch_size)) * parseFloat(quantity_planned),
            unit_id: ri.unit_id,
            cost_per_unit: ri.cost_at_creation
        }));

        await ProductionOrderItem.bulkCreate(orderItems, { transaction: t });

        await t.commit();
        return successResponse(res, order, 'Production order created', 201);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

const completeProductionOrder = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { quantity_produced, items_consumed } = req.body; // items_consumed: [{ id, quantity_consumed }]
        const organization_id = req.user.organization_id;

        const order = await ProductionOrder.findOne({
            where: { id, organization_id, status: { [Op.ne]: 'completed' } },
            include: [{ model: ProductionOrderItem, as: 'items' }]
        });

        if (!order) return errorResponse(res, 'Active production order not found', 404);

        let totalBatchCost = 0;

        // 1. Update Items Consumption & Deduct Stock
        for (const orderItem of order.items) {
            const consumed = items_consumed?.find(i => i.id === orderItem.id);
            const actualQty = consumed ? parseFloat(consumed.quantity_consumed) : parseFloat(orderItem.quantity_planned);

            await orderItem.update({ quantity_consumed: actualQty }, { transaction: t });

            // Stock Deduction Logic (FIFO)
            const batches = await ProductBatch.findAll({
                where: {
                    organization_id,
                    branch_id: order.branch_id,
                    product_id: orderItem.raw_material_id,
                    product_variant_id: orderItem.raw_material_variant_id,
                    quantity: { [Op.gt]: 0 }
                },
                order: [['created_at', 'ASC']],
                transaction: t
            });

            let remainingToDeduct = actualQty;
            for (const batch of batches) {
                if (remainingToDeduct <= 0) break;
                const available = parseFloat(batch.quantity);
                const deduct = Math.min(available, remainingToDeduct);
                
                // Add to total cost based on actual batch cost
                totalBatchCost += (parseFloat(batch.cost_price || 0) * deduct);

                await batch.decrement('quantity', { by: deduct, transaction: t });
                remainingToDeduct -= deduct;
            }

            // Update aggregate stock
            const stock = await Stock.findOne({
                where: {
                    organization_id,
                    branch_id: order.branch_id,
                    product_id: orderItem.raw_material_id,
                    product_variant_id: orderItem.raw_material_variant_id
                },
                transaction: t
            });
            if (stock) await stock.decrement('quantity', { by: actualQty, transaction: t });
        }

        // 2. Add Produced Stock
        const [targetStock] = await Stock.findOrCreate({
            where: {
                organization_id,
                branch_id: order.branch_id,
                product_id: order.product_id,
                product_variant_id: order.product_variant_id
            },
            defaults: { quantity: 0 },
            transaction: t
        });
        await targetStock.increment('quantity', { by: quantity_produced, transaction: t });

        // Create new batch for produced item
        await ProductBatch.create({
            organization_id,
            branch_id: order.branch_id,
            product_id: order.product_id,
            product_variant_id: order.product_variant_id,
            quantity: quantity_produced,
            batch_number: `PROD-${order.order_number}`,
            purchase_date: new Date(),
            cost_price: totalBatchCost / quantity_produced,
            is_active: true
        }, { transaction: t });

        // 3. Finalize Order
        await order.update({
            quantity_produced,
            total_cost: totalBatchCost,
            status: 'completed',
            end_date: new Date()
        }, { transaction: t });

        await t.commit();
        return successResponse(res, order, 'Production completed and stock updated');
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

const getProductionOrders = async (req, res, next) => {
    try {
        const { page, size, status, branch_id } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = { organization_id: req.user.organization_id };
        if (status) where.status = status;
        if (branch_id) where.branch_id = branch_id;

        const orders = await ProductionOrder.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                { model: Product, as: 'product', attributes: ['name', 'code'] },
                { model: Recipe, as: 'recipe', attributes: ['name'] }
            ],
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, orders.rows, {
            total: orders.count,
            page: parseInt(page) || 1,
            limit
        }, 'Production orders fetched');
    } catch (error) { next(error); }
};

const getProductionOrderDetail = async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await ProductionOrder.findOne({
            where: { id, organization_id: req.user.organization_id },
            include: [
                { model: Product, as: 'product', attributes: ['id', 'name', 'code'] },
                { model: Recipe, as: 'recipe', attributes: ['id', 'name', 'batch_size'] },
                { 
                    model: ProductionOrderItem, 
                    as: 'items',
                    include: [{ model: Product, as: 'raw_material', attributes: ['id', 'name', 'code'] }]
                }
            ]
        });

        if (!order) return errorResponse(res, 'Production order not found', 404);
        return successResponse(res, order, 'Production order detail fetched');
    } catch (error) { next(error); }
};

module.exports = {
    createProductionOrder,
    completeProductionOrder,
    getProductionOrders,
    getProductionOrderDetail
};
