const db = require('../models');
const { PurchaseReturn, PurchaseReturnItem, Supplier, Branch, User, Product, ProductVariant, Stock, ProductBatch, Account, Transaction, PurchaseOrder, GRN, AuditLog, PurchaseOrderItem } = db;
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Sequelize } = require('sequelize');
const accountingService = require('../services/accountingService');

/**
 * Get All Purchase Returns
 */
const getAllPurchaseReturns = async (req, res, next) => {
    try {
        const { page, size, supplier_id, status } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = { organization_id: req.user.organization_id };
        if (supplier_id) where.supplier_id = supplier_id;
        if (status) where.status = status;

        const returns = await PurchaseReturn.findAndCountAll({
            where,
            include: [
                { model: Supplier, as: 'supplier', attributes: ['name'] },
                { model: Branch, as: 'branch', attributes: ['name'] },
                { model: User, as: 'created_by_user', attributes: ['name'] },
                { model: PurchaseOrder, as: 'purchase_order', attributes: ['po_number'] },
                { model: GRN, as: 'grn', attributes: ['grn_number', 'invoice_number'] }
            ],
            limit,
            offset,
            order: [['return_date', 'DESC']]
        });

        return paginatedResponse(res, returns.rows, {
            total: returns.count,
            page: parseInt(page) || 1,
            limit
        }, 'Purchase returns fetched successfully');
    } catch (error) { next(error); }
};

/**
 * Get Purchase Return Details
 */
const getPurchaseReturnById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const purchaseReturn = await PurchaseReturn.findOne({
            where: { id, organization_id: req.user.organization_id },
            include: [
                { model: Supplier, as: 'supplier' },
                { model: Branch, as: 'branch' },
                { model: User, as: 'created_by_user' },
                { model: PurchaseOrder, as: 'purchase_order' },
                { model: GRN, as: 'grn' },
                {
                    model: PurchaseReturnItem,
                    as: 'items',
                    include: [
                        { model: Product, as: 'product', attributes: ['name', 'code'] },
                        { model: ProductVariant, as: 'variant', attributes: ['name', 'sku'] },
                        { model: ProductBatch, as: 'batch', attributes: ['batch_number', 'expiry_date'] }
                    ]
                }
            ]
        });

        if (!purchaseReturn) return errorResponse(res, 'Purchase Return not found', 404);
        return successResponse(res, purchaseReturn, 'Purchase Return details fetched');
    } catch (error) { next(error); }
};

/**
 * Create Purchase Return
 */
const createPurchaseReturn = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { supplier_id, branch_id: payload_branch_id, purchase_order_id, grn_id, items, notes, return_date } = req.body;
        const organization_id = req.user.organization_id;
        const branch_id = payload_branch_id || req.user.branch_id;
        const user_id = req.user.id;

        if (!items || items.length === 0) {
            return errorResponse(res, 'No items to return', 400);
        }

        // Generate Return Number
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await PurchaseReturn.count({ where: { organization_id } });
        const return_number = `PR-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;

        // Calculate Total
        let total_amount = 0;
        const processedItems = items.map(item => {
            const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_cost);
            total_amount += itemTotal;
            return { ...item, total_amount: itemTotal };
        });

        // 1. Create Purchase Return
        const purchaseReturn = await PurchaseReturn.create({
            organization_id,
            branch_id,
            supplier_id,
            purchase_order_id: purchase_order_id || null,
            grn_id: grn_id || null,
            user_id,
            return_number,
            return_date: return_date || new Date(),
            total_amount,
            status: 'completed', // Direct completion for now, or 'pending' if approval needed
            notes
        }, { transaction: t });

        // 2. Process Items (Create Items, Deduct Stock, Adjust Batches)
        for (const item of processedItems) {
            const product = await Product.findByPk(item.product_id, { transaction: t });
            const productName = product ? product.name : item.product_id;

            let product_batch_id = null;
            // B. Deduct from Batch (if batch_number provided)
            if (item.batch_number) {
                const batch = await ProductBatch.findOne({
                    where: {
                        branch_id,
                        product_id: item.product_id,
                        product_variant_id: item.product_variant_id || null,
                        batch_number: item.batch_number
                    },
                    transaction: t
                });
                if (batch) {
                    if (parseFloat(batch.quantity) < parseFloat(item.quantity)) {
                        throw new Error(`Insufficient stock in Batch "${item.batch_number}" for product "${productName}". Available: ${batch.quantity}, Returning: ${item.quantity}`);
                    }
                    await batch.decrement('quantity', { by: item.quantity, transaction: t });
                    product_batch_id = batch.id;
                } else {
                    throw new Error(`Batch "${item.batch_number}" not found for product "${productName}" in this branch.`);
                }
            }

            await PurchaseReturnItem.create({
                purchase_return_id: purchaseReturn.id,
                product_id: item.product_id,
                product_variant_id: item.product_variant_id || null,
                batch_number: item.batch_number || null,
                product_batch_id,
                quantity: item.quantity,
                unit_cost: item.unit_cost,
                total_amount: item.total_amount,
                reason: item.reason
            }, { transaction: t });

            // A. Deduct from Global Stock
            const stock = await Stock.findOne({
                where: {
                    branch_id,
                    product_id: item.product_id,
                    product_variant_id: item.product_variant_id || null
                },
                transaction: t
            });

            if (stock) {
                // Ensure sufficient stock
                if (parseFloat(stock.quantity) < parseFloat(item.quantity)) {
                    throw new Error(`Insufficient global stock for product "${productName}". Available: ${stock.quantity}, Returning: ${item.quantity}`);
                }
                await stock.decrement('quantity', { by: item.quantity, transaction: t });
            } else {
                throw new Error(`Stock record not found for product "${productName}" in the selected branch.`);
            }

            // C. Adjust Purchase Order Item if linked (Net Received Qty)
            if (purchase_order_id) {
                const poItem = await PurchaseOrderItem.findOne({
                    where: {
                        purchase_order_id,
                        product_id: item.product_id,
                        product_variant_id: item.product_variant_id || null
                    },
                    transaction: t
                });
                if (poItem) {
                    await poItem.decrement('quantity_received', { by: item.quantity, transaction: t });
                }
            }
        }

        // Update Purchase Order status if linked (Re-evaluate status)
        if (purchase_order_id) {
            const po = await PurchaseOrder.findByPk(purchase_order_id, {
                include: [{ model: PurchaseOrderItem, as: 'items' }],
                transaction: t
            });
            if (po) {
                let allReceived = true;
                let partiallyReceived = false;

                for (const poItem of po.items) {
                    const received = parseFloat(poItem.quantity_received);
                    const ordered = parseFloat(poItem.quantity);
                    if (received < ordered) {
                        allReceived = false;
                    }
                    if (received > 0) {
                        partiallyReceived = true;
                    }
                }

                const newStatus = allReceived ? 'received' : (partiallyReceived ? 'partially_received' : 'ordered');
                if (po.status !== newStatus) {
                    await po.update({ status: newStatus }, { transaction: t });
                }
            }
        }

        // 3. Create Financial Transaction (Debit Note - Supplier owes us / Reduces our Liability)
        // Check if Supplier exists
        const supplier = await Supplier.findByPk(supplier_id, { transaction: t });

        // Find Accounts
        const [apAccount] = await Account.findOrCreate({
            where: { organization_id, code: '2100' },
            defaults: { name: 'Accounts Payable', type: 'liability' },
            transaction: t
        });

        const [inventoryAccount] = await Account.findOrCreate({
            where: { organization_id, code: '1200' },
            defaults: { name: 'Inventory Asset', type: 'asset' },
            transaction: t
        });

        // Debit AP (Reduce Liability)
        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: apAccount.id,
            supplier_id,
            amount: total_amount,
            type: 'debit',
            reference_type: 'PurchaseReturn',
            reference_id: purchaseReturn.id,
            transaction_date: return_date || new Date(),
            description: `Purchase Return: ${return_number}`
        }, t);

        // Credit Inventory (Reduce Asset)
        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: inventoryAccount.id,
            supplier_id,
            amount: total_amount,
            type: 'credit',
            reference_type: 'PurchaseReturn',
            reference_id: purchaseReturn.id,
            transaction_date: return_date || new Date(),
            description: `Inventory reduction for Return: ${return_number}`
        }, t);

        // 4. Create Audit Log
        await AuditLog.create({
            organization_id,
            user_id,
            action: 'CREATE',
            entity_type: 'PurchaseReturn',
            entity_id: purchaseReturn.id,
            description: `Purchase Return created: ${return_number}. Total: ${total_amount}. Stock deducted from branch.`,
            metadata: { supplier_id, total_amount, items_count: items.length }
        }, { transaction: t });

        // Add to Purchase Order timeline if linked
        if (purchase_order_id) {
            await AuditLog.create({
                organization_id,
                user_id,
                action: 'UPDATE',
                entity_type: 'PurchaseOrder',
                entity_id: purchase_order_id,
                description: `Items returned to supplier. Return: ${return_number}. ${items.length} items returned.`,
                metadata: { return_id: purchaseReturn.id, return_number, total_amount, items_count: items.length }
            }, { transaction: t });
        }

        await t.commit();
        return successResponse(res, purchaseReturn, 'Purchase Return created successfully', 201);

    } catch (error) {
        await t.rollback();
        next(error);
    }
};

module.exports = {
    getAllPurchaseReturns,
    getPurchaseReturnById,
    createPurchaseReturn
};
