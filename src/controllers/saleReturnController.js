const db = require('../models');
const { Sale, SaleItem, SaleReturn, SaleReturnItem, Customer, Branch, User, Product, ProductVariant, Stock, ProductBatch, Account, Transaction } = db;
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Sequelize, Op } = require('sequelize');
const auditService = require('../services/auditService');
const accountingService = require('../services/accountingService');

/**
 * Get All Sale Returns
 */
const getAllSaleReturns = async (req, res, next) => {
    try {
        const { page, size, customer_id, sale_id } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = { organization_id: req.user.organization_id };
        if (customer_id) where.customer_id = customer_id;
        if (sale_id) where.sale_id = sale_id;

        const returns = await SaleReturn.findAndCountAll({
            where,
            include: [
                { model: Customer, as: 'customer', attributes: ['name', 'phone'] },
                { model: Branch, as: 'branch', attributes: ['name'] },
                { model: User, as: 'user', attributes: ['name'] },
                { model: Sale, as: 'sale', attributes: ['invoice_number'] }
            ],
            limit,
            offset,
            order: [['return_date', 'DESC']]
        });

        return paginatedResponse(res, returns.rows, {
            total: returns.count,
            page: parseInt(page) || 1,
            limit
        }, 'Sale returns fetched successfully');
    } catch (error) { next(error); }
};

/**
 * Get Sale Return Details
 */
const getSaleReturnById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const saleReturn = await SaleReturn.findOne({
            where: { id, organization_id: req.user.organization_id },
            include: [
                { model: Customer, as: 'customer' },
                { model: Branch, as: 'branch' },
                { model: User, as: 'user' },
                { model: Sale, as: 'sale' },
                {
                    model: SaleReturnItem,
                    as: 'items',
                    include: [
                        { model: Product, as: 'product', attributes: ['name', 'code'] },
                        { model: ProductVariant, as: 'variant', attributes: ['name', 'sku'] }
                    ]
                }
            ]
        });

        if (!saleReturn) return errorResponse(res, 'Sale Return not found', 404);
        return successResponse(res, saleReturn, 'Sale Return details fetched');
    } catch (error) { next(error); }
};

/**
 * Create Sale Return
 */
const createSaleReturn = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { sale_id, items, refund_amount, refund_method, notes, return_date } = req.body;
        const organization_id = req.user.organization_id;
        const user_id = req.user.id;

        const sale = await Sale.findOne({
            where: { id: sale_id, organization_id },
            include: [{ model: SaleItem, as: 'items' }]
        });

        if (!sale) return errorResponse(res, 'Original sale not found', 404);
        if (!items || items.length === 0) return errorResponse(res, 'No items to return', 400);

        // Fallback to sale branch if user has no specific branch (e.g. Admin)
        const branch_id = req.user.branch_id || sale.branch_id;

        // Generate Return Number
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await SaleReturn.count({ where: { organization_id } });
        const return_number = `SR-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;

        // Calculate Total Return Amount
        let total_return_amount = 0;
        for (const item of items) {
            const saleItem = sale.items.find(si => si.product_id === item.product_id &&
                (si.product_variant_id === item.product_variant_id || (!si.product_variant_id && !item.product_variant_id)));

            if (!saleItem) throw new Error(`Product ${item.product_id} was not part of original sale`);
            if (parseFloat(item.quantity) > parseFloat(saleItem.quantity)) {
                throw new Error(`Cannot return more than purchased quantity for product ${item.product_id}`);
            }

            total_return_amount += parseFloat(item.quantity) * parseFloat(saleItem.unit_price);
        }

        // 1. Create Sale Return
        const saleReturn = await SaleReturn.create({
            organization_id,
            branch_id,
            customer_id: sale.customer_id,
            sale_id,
            user_id,
            return_number,
            return_date: return_date || new Date(),
            total_amount: total_return_amount,
            refund_amount: refund_amount || 0,
            refund_method,
            status: 'completed',
            notes
        }, { transaction: t });

        // 2. Process Items (Update Stock & Batches)
        for (const item of items) {
            // ... (existing code for SaleReturnItem creation) ...
            const saleItem = sale.items.find(si => si.product_id === item.product_id &&
                (si.product_variant_id === item.product_variant_id || (!si.product_variant_id && !item.product_variant_id)));

            await SaleReturnItem.create({
                sale_return_id: saleReturn.id,
                product_id: item.product_id,
                product_variant_id: item.product_variant_id || null,
                quantity: item.quantity,
                unit_price: saleItem.unit_price,
                total_amount: parseFloat(item.quantity) * parseFloat(saleItem.unit_price),
                reason: item.reason
            }, { transaction: t });

            // A. Increment Global Stock
            const stockWhere = { branch_id, product_id: item.product_id, product_variant_id: item.product_variant_id || null };
            const stock = await Stock.findOne({ where: stockWhere, transaction: t });
            if (stock) {
                await stock.increment('quantity', { by: item.quantity, transaction: t });
            } else {
                await Stock.create({ ...stockWhere, quantity: item.quantity }, { transaction: t });
            }

            // B. Increment Batch (Restore to Latest Batch)
            // We assume the returned item goes back to the most recent batch (LIFO for returns)
            const latestBatch = await ProductBatch.findOne({
                where: {
                    branch_id,
                    product_id: item.product_id,
                    product_variant_id: item.product_variant_id || null
                },
                order: [
                    ['expiry_date', 'DESC'], // Put back into longest living batch? Or newest?
                    ['created_at', 'DESC']   // Usually newest batch is best proxy
                ],
                transaction: t
            });

            if (latestBatch) {
                await latestBatch.increment('quantity', { by: item.quantity, transaction: t });
            }
        }

        // 3. Accounting Transactions
        const [cashAccount] = await Account.findOrCreate({
            where: { organization_id, code: '1000' },
            defaults: { name: 'Cash', type: 'asset' },
            transaction: t
        });

        const [arAccount] = await Account.findOrCreate({
            where: { organization_id, code: '1100' },
            defaults: { name: 'Accounts Receivable', type: 'asset' },
            transaction: t
        });

        const [salesReturnAccount] = await Account.findOrCreate({
            where: { organization_id, code: '4100' },
            defaults: { name: 'Sales Returns & Allowances', type: 'revenue' }, // Contra-revenue
            transaction: t
        });

        // Debit Sales Return (Reduce Revenue)
        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: salesReturnAccount.id,
            customer_id: sale.customer_id,
            amount: total_return_amount,
            type: 'debit',
            reference_type: 'SaleReturn',
            reference_id: saleReturn.id,
            transaction_date: return_date || new Date(),
            description: `Sales Return for Invoice ${sale.invoice_number}`
        }, t);

        // Credit Refund source (Cash or AR)
        if (refund_amount > 0) {
            // Case where we give back cash
            await accountingService.recordTransaction({
                organization_id,
                branch_id,
                account_id: cashAccount.id,
                customer_id: sale.customer_id,
                amount: refund_amount,
                type: 'credit',
                reference_type: 'SaleReturn',
                reference_id: saleReturn.id,
                transaction_date: return_date || new Date(),
                description: `Refund for Sales Return ${return_number}`
            }, t);
        }

        // If it was a credit sale, reduce the AR balance for the remaining return amount
        const appliedToAR = total_return_amount - (refund_amount || 0);
        if (appliedToAR > 0 && sale.customer_id) {
            await accountingService.recordTransaction({
                organization_id,
                branch_id,
                account_id: arAccount.id,
                customer_id: sale.customer_id,
                amount: appliedToAR,
                type: 'credit',
                reference_type: 'SaleReturn',
                reference_id: saleReturn.id,
                transaction_date: return_date || new Date(),
                description: `Adjustment to AR for Sales Return ${return_number}`
            }, t);
        }

        // 4. Update Original Sale Status if needed (Optional)
        // If everything is returned, set status to 'returned'
        // For simplicity, we just keep the return record.

        await t.commit();

        // Log sale return
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            organization_id,
            req.user.id,
            'SaleReturn',
            saleReturn.id,
            {
                return_number: saleReturn.return_number,
                invoice_number: sale.invoice_number,
                total_amount: saleReturn.total_amount,
                refund_amount: saleReturn.refund_amount,
                items_count: items.length
            },
            ipAddress,
            userAgent
        );

        return successResponse(res, saleReturn, 'Sale Return processed successfully', 201);

    } catch (error) {
        await t.rollback();
        next(error);
    }
};

module.exports = {
    getAllSaleReturns,
    getSaleReturnById,
    createSaleReturn
};
