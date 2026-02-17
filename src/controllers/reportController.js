const db = require('../models');
const {
    Sale, SaleItem, Product, ProductVariant, Customer, User,
    Stock, Branch, Supplier, PurchaseOrder, Expense, Organization
} = db;
const { Op, Sequelize } = require('sequelize');
const { successResponse, errorResponse } = require('../utils/responseHandler');

const reportController = {
    // 1. Daily Sales Summary
    getDailySales: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id } = req.query;
            const organization_id = req.user.organization_id;

            const whereClause = {
                organization_id,
                status: 'completed'
            };

            if (branch_id && branch_id !== 'all') {
                whereClause.branch_id = branch_id;
            }

            if (req.query.user_id && req.query.user_id !== 'all') {
                whereClause.user_id = req.query.user_id;
            }

            if (start_date && end_date) {
                whereClause.created_at = {
                    [Op.between]: [
                        new Date(start_date + 'T00:00:00'),
                        new Date(end_date + 'T23:59:59')
                    ]
                };
            }

            const sales = await Sale.findAll({
                where: whereClause,
                include: [
                    { model: Customer, as: 'customer', attributes: ['name'] },
                    { model: User, as: 'cashier', attributes: ['name'] }
                ],
                order: [['created_at', 'DESC']]
            });



            // Aggregate Data
            const totalSales = sales.reduce((sum, sale) => sum + Number(sale.payable_amount), 0);
            const totalDiscounts = sales.reduce((sum, sale) => sum + Number(sale.discount_amount), 0);
            const totalTax = sales.reduce((sum, sale) => sum + Number(sale.tax_amount), 0);

            const paymentBreakdown = sales.reduce((acc, sale) => {
                let category = sale.payment_method || 'Other';

                // If the sale is not fully paid, categorize it as "Credit" or "Partial"
                // However, user specifically asked for "Credit" with amber color
                if (sale.payment_status === 'unpaid' || sale.payment_status === 'partially_paid') {
                    category = 'Credit';
                }

                acc[category] = (acc[category] || 0) + 1;
                return acc;
            }, {});

            // Calculate percentages for breakdown
            const totalCount = sales.length;
            const breakdownPercentages = {};
            for (const [category, count] of Object.entries(paymentBreakdown)) {
                breakdownPercentages[category] = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
            }

            return successResponse(res, {
                transactions: sales.map(s => ({
                    id: s.invoice_number || s.id.substring(0, 8).toUpperCase(),
                    date: s.created_at,
                    customer: s.customer ? s.customer.name : 'Walk-in',
                    total: Number(s.payable_amount), // Use payable_amount as total revenue
                    subtotal: Number(s.total_amount),
                    discount: Number(s.discount_amount),
                    tax: Number(s.tax_amount),
                    status: s.status,
                    type: s.payment_method, // Cash/Card/Cheque
                    payment_status: s.payment_status, // unpaid/partially_paid/paid
                    paid_amount: Number(s.paid_amount),
                    cashier: s.cashier ? s.cashier.name : 'Unknown'
                })),
                stats: {
                    totalSales,
                    totalTransactions: totalCount,
                    totalDiscounts,
                    totalTax,
                    avgValue: totalCount > 0 ? totalSales / totalCount : 0,
                    paymentBreakdown: breakdownPercentages
                }
            }, 'Daily sales report fetched successfully');

        } catch (error) {
            next(error);
        }
    },

    // 2. Sales by Product
    getSalesByProduct: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id, main_category_id, brand_id } = req.query;
            const organization_id = req.user.organization_id;

            const whereClause = { status: 'completed', organization_id };

            if (start_date && end_date) {
                whereClause.created_at = {
                    [Op.between]: [
                        new Date(start_date + 'T00:00:00'),
                        new Date(end_date + 'T23:59:59')
                    ]
                };
            }

            if (branch_id && branch_id !== 'all') {
                whereClause.branch_id = branch_id;
            }

            const productWhere = {};
            if (main_category_id && main_category_id !== 'all') {
                productWhere.main_category_id = main_category_id;
            }
            if (brand_id && brand_id !== 'all') {
                productWhere.brand_id = brand_id;
            }

            const items = await SaleItem.findAll({
                include: [
                    {
                        model: Sale,
                        as: 'sale',
                        where: whereClause,
                        attributes: []
                    },
                    {
                        model: Product,
                        as: 'product',
                        where: productWhere,
                        attributes: ['name', 'code', 'image']
                    },
                    {
                        model: ProductVariant,
                        as: 'variant',
                        attributes: ['name', 'sku']
                    }
                ],
                attributes: [
                    'product_id',
                    'product_variant_id',
                    [Sequelize.fn('SUM', Sequelize.col('quantity')), 'total_quantity'],
                    [Sequelize.fn('SUM', Sequelize.col('SaleItem.total_amount')), 'total_revenue']
                ],
                group: ['product_id', 'product_variant_id', 'product.id', 'variant.id'],
                order: [[Sequelize.literal('total_revenue'), 'DESC']]
            });

            return successResponse(res, items, 'Product sales report fetched successfully');
        } catch (error) { next(error); }
    },

    // 3. Current Stock Value
    getStockValue: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;

            const stocks = await Stock.findAll({
                include: [
                    {
                        model: Product,
                        as: 'product',
                        attributes: ['name']
                    },
                    {
                        model: ProductVariant,
                        as: 'variant',
                        attributes: ['name', 'cost_price', 'price']
                    },
                    {
                        model: Branch,
                        as: 'branch',
                        where: { organization_id },
                        attributes: ['name']
                    }
                ]
            });

            // Calculate values
            let totalRetailValue = 0;
            let totalCostValue = 0;
            let totalItems = 0;

            const stockDetails = stocks.map(stock => {
                const qty = Number(stock.quantity);
                const cost = Number(stock.variant?.cost_price || 0);
                const price = Number(stock.variant?.price || 0);

                const retailVal = qty * price;
                const costVal = qty * cost;

                totalRetailValue += retailVal;
                totalCostValue += costVal;
                totalItems += qty;

                return {
                    id: stock.id,
                    product: stock.product.name,
                    variant: stock.variant?.name || '-',
                    branch: stock.branch?.name,
                    quantity: qty,
                    unit_cost: cost,
                    unit_price: price,
                    total_cost: costVal,
                    total_retail: retailVal
                };
            });

            return successResponse(res, {
                details: stockDetails,
                summary: {
                    totalItems,
                    totalCostValue,
                    totalRetailValue,
                    potentialProfit: totalRetailValue - totalCostValue
                }
            }, 'Stock value report fetched successfully');

        } catch (error) { next(error); }
    },

    // 4. Low Stock Report
    getLowStock: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;

            // Logic: Quantity <= Reorder Point (or fixed threshold like 5 if not set)
            // Assuming Product has alert_quantity or similar. If not, we use default 5.

            const stocks = await Stock.findAll({
                include: [
                    {
                        model: Product,
                        as: 'product',
                        attributes: ['name', 'image']
                    },
                    {
                        model: ProductVariant,
                        as: 'variant',
                        attributes: ['name', 'low_stock_threshold']
                    },
                    {
                        model: Branch,
                        as: 'branch',
                        where: { organization_id },
                        attributes: ['name']
                    }
                ]
            });

            const lowStockItems = stocks.filter(s => {
                const threshold = Number(s.variant?.low_stock_threshold || 10);
                return Number(s.quantity) <= threshold;
            }).map(s => ({
                id: s.id,
                product: s.product.name + (s.variant?.name ? ` (${s.variant.name})` : ''),
                image: s.product.image,
                branch: s.branch?.name,
                quantity: s.quantity,
                threshold: s.variant?.low_stock_threshold || 10,
                status: Number(s.quantity) === 0 ? 'Out of Stock' : 'Low Stock'
            }));

            return successResponse(res, lowStockItems, 'Low stock report fetched successfully');
        } catch (error) { next(error); }
    },

    // 5. Profit & Loss (Simple estimation)
    getProfitLoss: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id } = req.query;
            const organization_id = req.user.organization_id;

            const dateFilter = {};
            if (start_date && end_date) {
                dateFilter.created_at = {
                    [Op.between]: [
                        new Date(start_date + 'T00:00:00'),
                        new Date(end_date + 'T23:59:59')
                    ]
                };
            } else if (start_date) {
                dateFilter.created_at = { [Op.gte]: new Date(start_date + 'T00:00:00') };
            }

            const branchFilter = {};
            if (branch_id && branch_id !== 'all') {
                branchFilter.branch_id = branch_id;
            }

            // 1. Revenue (Sales)
            const sales = await Sale.sum('payable_amount', {
                where: {
                    organization_id,
                    status: 'completed',
                    ...dateFilter,
                    ...branchFilter
                }
            });

            // 2. Expenses
            const expenseDateFilter = {};
            if (start_date && end_date) {
                expenseDateFilter.expense_date = {
                    [Op.between]: [
                        new Date(start_date),
                        new Date(end_date)
                    ]
                };
            } else if (start_date) {
                expenseDateFilter.expense_date = { [Op.gte]: new Date(start_date) };
            }

            const expenses = await Expense.sum('amount', {
                where: {
                    organization_id,
                    ...expenseDateFilter,
                    ...branchFilter
                }
            });

            // 3. COGS (Estimation based on items sold * cost)
            // This is expensive to calculate exactly on the fly without aggregation table. 
            // We will try a simplified approach or just mock COGS if Product Cost not available.
            // For now, let's fetch SaleItems and calc cost.

            const soldItems = await SaleItem.findAll({
                include: [
                    {
                        model: Sale,
                        as: 'sale',
                        where: {
                            organization_id,
                            status: 'completed',
                            ...dateFilter,
                            ...branchFilter
                        },
                        attributes: []
                    },
                    { model: ProductVariant, as: 'variant', attributes: ['cost_price'] }
                ]
            });

            const cogs = soldItems.reduce((sum, item) => {
                return sum + (Number(item.quantity) * Number(item.variant?.cost_price || 0));
            }, 0);

            // 4. Sales Returns
            const returns = await db.SaleReturn.findAll({
                where: {
                    organization_id,
                    status: 'completed',
                    ...dateFilter,
                    ...branchFilter
                },
                include: [{ model: db.SaleReturnItem, as: 'items', include: [{ model: db.ProductVariant, as: 'variant', attributes: ['cost_price'] }] }]
            });

            const totalReturns = returns.reduce((sum, r) => sum + Number(r.total_amount), 0);
            const returnCogs = returns.reduce((sum, r) => {
                const itemCogs = r.items.reduce((iSum, item) => iSum + (Number(item.quantity) * Number(item.variant?.cost_price || 0)), 0);
                return sum + itemCogs;
            }, 0);

            const revenue = (sales || 0) - totalReturns;
            const adjustedCogs = cogs - returnCogs;
            const totalExpenses = expenses || 0;
            const grossProfit = revenue - adjustedCogs;
            const netProfit = grossProfit - totalExpenses;

            return successResponse(res, {
                revenue,
                cogs: adjustedCogs,
                returns: totalReturns,
                grossProfit,
                expenses: totalExpenses,
                netProfit,
                margin: revenue > 0 ? (netProfit / revenue) * 100 : 0
            }, 'Profit & Loss fetched');

        } catch (error) { next(error); }
    },

    // 6. Customer Purchase History
    getCustomerHistory: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;

            const customers = await Customer.findAll({
                where: { organization_id },
                attributes: ['id', 'name', 'phone', 'email']
            });

            const customerSales = await Sale.findAll({
                where: { organization_id, status: 'completed' },
                attributes: [
                    'customer_id',
                    [Sequelize.fn('SUM', Sequelize.col('payable_amount')), 'total_spent'],
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'total_sales'],
                    [Sequelize.fn('MAX', Sequelize.col('created_at')), 'last_visit']
                ],
                group: ['customer_id']
            });

            const result = customers.map(c => {
                const sales = customerSales.find(s => s.customer_id === c.id);
                return {
                    id: c.id,
                    name: c.name,
                    phone: c.phone,
                    email: c.email,
                    totalSales: Number(sales?.dataValues.total_sales || 0),
                    totalSpent: Number(sales?.dataValues.total_spent || 0),
                    lastVisit: sales?.dataValues.last_visit || null
                };
            }).sort((a, b) => b.totalSpent - a.totalSpent);

            return successResponse(res, result, 'Customer purchase history fetched successfully');
        } catch (error) { next(error); }
    },

    // 7. Tax Liability Report
    getTaxReport: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id } = req.query;
            const organization_id = req.user.organization_id;

            const whereClause = { organization_id, status: 'completed' };

            if (branch_id && branch_id !== 'all') {
                whereClause.branch_id = branch_id;
            }

            if (start_date && end_date) {
                whereClause.created_at = {
                    [Op.between]: [
                        new Date(start_date + 'T00:00:00'),
                        new Date(end_date + 'T23:59:59')
                    ]
                };
            }

            const sales = await Sale.findAll({
                where: whereClause,
                attributes: ['invoice_number', 'total_amount', 'tax_amount', 'payable_amount', 'created_at'],
                order: [['created_at', 'DESC']]
            });

            const summary = {
                totalTaxable: sales.reduce((sum, s) => sum + Number(s.total_amount), 0),
                totalTax: sales.reduce((sum, s) => sum + Number(s.tax_amount), 0),
                totalPayable: sales.reduce((sum, s) => sum + Number(s.payable_amount), 0),
                count: sales.length
            };

            return successResponse(res, { details: sales, summary }, 'Tax liability report fetched successfully');
        } catch (error) { next(error); }
    },

    // 8. Supplier Performance
    getSupplierPerformance: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;

            const suppliers = await Supplier.findAll({
                where: { organization_id },
                attributes: ['id', 'name']
            });

            const purchases = await PurchaseOrder.findAll({
                where: { organization_id, status: 'received' },
                attributes: [
                    'supplier_id',
                    [Sequelize.fn('SUM', Sequelize.col('total_amount')), 'total_purchase'],
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'order_count']
                ],
                group: ['supplier_id']
            });

            const result = suppliers.map(s => {
                const p = purchases.find(item => item.supplier_id === s.id);
                return {
                    id: s.id,
                    name: s.name,
                    totalPurchase: Number(p?.dataValues.total_purchase || 0),
                    orderCount: Number(p?.dataValues.order_count || 0)
                };
            }).sort((a, b) => b.totalPurchase - a.totalPurchase);

            return successResponse(res, result, 'Supplier performance report fetched successfully');
        } catch (error) { next(error); }
    },

    // 9. Sales Return History & Report Data
    getSalesReturnHistory: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id, user_id } = req.query;
            const organization_id = req.user.organization_id;

            const whereClause = { organization_id };

            if (branch_id && branch_id !== 'all') {
                whereClause.branch_id = branch_id;
            }

            if (user_id && user_id !== 'all') {
                whereClause.user_id = user_id;
            }

            if (start_date && end_date) {
                whereClause.return_date = {
                    [Op.between]: [
                        new Date(start_date + 'T00:00:00'),
                        new Date(end_date + 'T23:59:59')
                    ]
                };
            }

            const returns = await db.SaleReturn.findAll({
                where: whereClause,
                include: [
                    { model: db.Customer, as: 'customer', attributes: ['name'] },
                    { model: db.Sale, as: 'sale', attributes: ['invoice_number'] },
                    { model: db.User, as: 'cashier', attributes: ['name'] },
                    {
                        model: db.SaleReturnItem,
                        as: 'items',
                        include: [{ model: db.Product, as: 'product', attributes: ['name'] }]
                    }
                ],
                order: [['return_date', 'DESC']]
            });

            // Calculate Metrics for Report
            const totalReturns = returns.length;
            const totalReturnAmount = returns.reduce((sum, r) => sum + parseFloat(r.total_amount || 0), 0);
            const totalRefundAmount = returns.reduce((sum, r) => sum + parseFloat(r.refund_amount || 0), 0);
            const uniqueCustomers = new Set(returns.map(r => r.customer_id)).size;

            return successResponse(res, {
                data: returns,
                stats: {
                    totalReturns,
                    totalReturnAmount,
                    totalRefundAmount,
                    uniqueCustomers
                }
            }, 'Sales return history fetched successfully');
        } catch (error) { next(error); }
    },

    // 10. Category Sales (Main & Sub)
    getCategorySales: async (req, res, next) => {
        try {
            const { type, start_date, end_date } = req.query; // type: 'main' or 'sub'
            const organization_id = req.user.organization_id;

            const dateFilter = {};
            if (start_date && end_date) {
                dateFilter.created_at = {
                    [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')]
                };
            }

            const isMain = type === 'main';
            const categoryModel = isMain ? 'main_category' : 'sub_category';

            const categorySales = await db.SaleItem.findAll({
                include: [
                    {
                        model: db.Sale,
                        as: 'sale',
                        where: { organization_id, status: 'completed', ...dateFilter },
                        attributes: []
                    },
                    {
                        model: db.Product,
                        as: 'product',
                        attributes: [],
                        include: [
                            { model: isMain ? db.MainCategory : db.SubCategory, as: categoryModel, attributes: ['name'] }
                        ]
                    }
                ],
                attributes: [
                    [Sequelize.col(`product->${categoryModel}.name`), 'category_name'],
                    [Sequelize.fn('SUM', Sequelize.col('SaleItem.quantity')), 'total_quantity'],
                    [Sequelize.fn('SUM', Sequelize.col('SaleItem.total_amount')), 'total_revenue']
                ],
                group: [Sequelize.col(`product->${categoryModel}.id`), Sequelize.col(`product->${categoryModel}.name`)],
                order: [[Sequelize.literal('total_revenue'), 'DESC']]
            });

            return successResponse(res, categorySales, 'Category sales report fetched successfully');
        } catch (error) { next(error); }
    },

    // 11. Cheque Summary
    getChequeSummary: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            const { type } = req.query; // 'receivable' or 'payable'

            const where = { organization_id };
            if (type) where.type = type;

            const cheques = await db.Cheque.findAll({
                where,
                include: [
                    { model: db.Account, as: 'account', attributes: ['name'] },
                    { model: db.Branch, as: 'branch', attributes: ['name'] }
                ],
                order: [['cheque_date', 'ASC']]
            });

            const summary = cheques.reduce((acc, c) => {
                acc[c.status] = (acc[c.status] || 0) + parseFloat(c.amount);
                acc.total = (acc.total || 0) + parseFloat(c.amount);
                return acc;
            }, { total: 0 });

            return successResponse(res, { details: cheques, summary }, 'Cheque summary fetched successfully');
        } catch (error) { next(error); }
    },

    // 12. Sold Item Count
    getSoldItemCount: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id } = req.query;
            const organization_id = req.user.organization_id;

            const dateFilter = {};
            if (start_date && end_date) {
                dateFilter.created_at = {
                    [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')]
                };
            }

            const items = await db.SaleItem.findAll({
                include: [
                    {
                        model: db.Sale,
                        as: 'sale',
                        where: { organization_id, status: 'completed', ...dateFilter, ...(branch_id && branch_id !== 'all' ? { branch_id } : {}) },
                        attributes: []
                    },
                    { model: db.Product, as: 'product', attributes: ['name', 'code'] },
                    { model: db.ProductVariant, as: 'variant', attributes: ['name', 'sku'] }
                ],
                attributes: [
                    'product_id', 'product_variant_id',
                    [Sequelize.fn('SUM', Sequelize.col('quantity')), 'count']
                ],
                group: ['product_id', 'product_variant_id', 'product.id', 'variant.id'],
                order: [[Sequelize.literal('count'), 'DESC']]
            });

            return successResponse(res, items, 'Sold item count report fetched successfully');
        } catch (error) { next(error); }
    },

    // 13. Capital Balance (Financial Overview)
    getCapitalBalance: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;

            const accounts = await db.Account.findAll({
                where: { organization_id }
            });

            const assets = accounts.filter(a => a.type === 'asset');
            const liabilities = accounts.filter(a => a.type === 'liability');
            const equity = accounts.filter(a => a.type === 'equity');

            const totalAssets = assets.reduce((sum, a) => sum + parseFloat(a.balance), 0);
            const totalLiabilities = liabilities.reduce((sum, a) => sum + parseFloat(a.balance), 0);
            const netWorth = totalAssets - totalLiabilities;

            return successResponse(res, {
                assets,
                liabilities,
                equity,
                summary: {
                    totalAssets,
                    totalLiabilities,
                    netWorth
                }
            }, 'Capital balance report fetched successfully');
        } catch (error) { next(error); }
    },

    // 14. Stock Transfers
    getStockTransfers: async (req, res, next) => {
        try {
            const { start_date, end_date, from_branch, to_branch } = req.query;
            const organization_id = req.user.organization_id;

            const where = { organization_id };
            if (from_branch && from_branch !== 'all') where.from_branch_id = from_branch;
            if (to_branch && to_branch !== 'all') where.to_branch_id = to_branch;

            if (start_date && end_date) {
                where.transfer_date = {
                    [Op.between]: [new Date(start_date), new Date(end_date)]
                };
            }

            const transfers = await db.StockTransfer.findAll({
                where,
                include: [
                    { model: db.Branch, as: 'from_branch', attributes: ['name'] },
                    { model: db.Branch, as: 'to_branch', attributes: ['name'] },
                    { model: db.User, as: 'user', attributes: ['name'] },
                    {
                        model: db.StockTransferItem,
                        as: 'items',
                        include: [
                            { model: db.Product, as: 'product', attributes: ['name'] },
                            { model: db.ProductVariant, as: 'variant', attributes: ['name'] }
                        ]
                    }
                ],
                order: [['transfer_date', 'DESC']]
            });

            return successResponse(res, transfers, 'Stock transfers fetched successfully');
        } catch (error) { next(error); }
    },

    // 15. Stock Summary (Current stock counts per product/variant)
    getStockSummary: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            const { branch_id, main_category_id } = req.query;

            const where = {};
            if (branch_id && branch_id !== 'all') where.branch_id = branch_id;

            const productWhere = {};
            if (main_category_id && main_category_id !== 'all') productWhere.main_category_id = main_category_id;

            const stocks = await db.Stock.findAll({
                where,
                include: [
                    {
                        model: db.Product,
                        as: 'product',
                        where: productWhere,
                        attributes: ['name', 'code'],
                        include: [{ model: db.MainCategory, as: 'main_category', attributes: ['name'] }]
                    },
                    { model: db.ProductVariant, as: 'variant', attributes: ['name', 'sku', 'low_stock_threshold'] },
                    {
                        model: db.Branch,
                        as: 'branch',
                        where: { organization_id },
                        attributes: ['name']
                    }
                ],
                order: [['product', 'name', 'ASC']]
            });

            return successResponse(res, stocks, 'Stock summary fetched successfully');
        } catch (error) { next(error); }
    },

    // 16. Supplier Profitability (Profit generated from goods bought from specific suppliers)
    getSupplierProfit: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            const { start_date, end_date, branch_id, supplier_id } = req.query;

            const where = { organization_id, status: 'completed' };
            if (branch_id && branch_id !== 'all') {
                where.branch_id = branch_id;
            }
            if (start_date && end_date) {
                where.created_at = { [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')] };
            }

            const supplierWhere = {};
            if (supplier_id && supplier_id !== 'all') {
                supplierWhere.id = supplier_id;
            }

            const items = await db.SaleItem.findAll({
                include: [
                    { model: db.Sale, as: 'sale', where, attributes: [] },
                    {
                        model: db.Product,
                        as: 'product',
                        attributes: ['name'],
                        include: [{
                            model: db.Supplier,
                            as: 'supplier',
                            where: Object.keys(supplierWhere).length ? supplierWhere : undefined,
                            attributes: ['id', 'name']
                        }]
                    },
                    { model: db.ProductVariant, as: 'variant', attributes: ['cost_price'] }
                ]
            });

            // Group by Supplier
            const profitBySupplier = {};
            items.forEach(item => {
                const supplier = item.product?.supplier;
                const supplierId = supplier?.id || 'unknown';
                const supplierName = supplier?.name || 'Unknown';

                if (!profitBySupplier[supplierId]) {
                    profitBySupplier[supplierId] = {
                        supplier_name: supplierName,
                        sold: 0,
                        totalSales: 0,
                        discount: 0,
                        cost: 0,
                        netSales: 0,
                        profit: 0
                    };
                }
                const qty = Number(item.quantity);
                const totalAmount = Number(item.total_amount); // amount inclusive of tax and after line discount
                const lineDiscount = Number(item.discount_amount || 0);
                const cost = Number(item.variant?.cost_price || 0) * qty;

                // totalSales is gross (before line discount)
                profitBySupplier[supplierId].sold += qty;
                profitBySupplier[supplierId].totalSales += (totalAmount + lineDiscount);
                profitBySupplier[supplierId].discount += lineDiscount;
                profitBySupplier[supplierId].netSales += totalAmount;
                profitBySupplier[supplierId].cost += cost;
                profitBySupplier[supplierId].profit += (totalAmount - cost);
            });

            const result = Object.values(profitBySupplier).map(stats => ({
                ...stats,
                margin: stats.netSales > 0 ? (stats.profit / stats.netSales) * 100 : 0
            })).sort((a, b) => b.profit - a.profit);

            return successResponse(res, result, 'Supplier profit report fetched successfully');
        } catch (error) { next(error); }
    },

    // 17. Non-Stock Sales Summary
    getNonStockSales: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            const { start_date, end_date } = req.query;

            const where = { organization_id, status: 'completed' };
            if (start_date && end_date) {
                where.created_at = { [Op.between]: [new Date(start_date), new Date(end_date)] };
            }

            const items = await db.SaleItem.findAll({
                include: [
                    { model: db.Sale, as: 'sale', where, attributes: [] },
                    {
                        model: db.Product,
                        as: 'product',
                        where: { is_stock_managed: false },
                        attributes: ['name', 'code']
                    }
                ]
            });

            return successResponse(res, items, 'Non-stock sales report fetched successfully');
        } catch (error) { next(error); }
    },

    // 17. Trial Balance
    getTrialBalance: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            const accounts = await db.Account.findAll({
                where: { organization_id },
                order: [['type', 'ASC'], ['code', 'ASC']]
            });

            const balances = accounts.map(a => {
                const bal = parseFloat(a.balance);

                let debit = 0;
                let credit = 0;

                const isNormalDebit = ['asset', 'expense'].includes(a.type);

                if (isNormalDebit) {
                    if (bal >= 0) debit = bal;
                    else credit = Math.abs(bal);
                } else {
                    if (bal >= 0) credit = bal;
                    else debit = Math.abs(bal);
                }

                return {
                    id: a.id,
                    code: a.code,
                    name: a.name,
                    type: a.type,
                    debit,
                    credit
                };
            });

            const summary = balances.reduce((acc, b) => {
                acc.totalDebit += b.debit;
                acc.totalCredit += b.credit;
                return acc;
            }, { totalDebit: 0, totalCredit: 0 });

            return successResponse(res, { accounts: balances, summary }, 'Trial Balance fetched successfully');
        } catch (error) { next(error); }
    },

    // 17. Dashboard Summary
    getDashboardSummary: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            const branch_id = req.user.branch_id;

            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            // Date range for "Last Month" (to calculate trends - simple version)
            const lastMonthStart = new Date();
            lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
            lastMonthStart.setHours(0, 0, 0, 0);
            const lastMonthEnd = new Date(todayEnd);
            lastMonthEnd.setMonth(lastMonthEnd.getMonth() - 1);

            const filter = { organization_id };
            if (branch_id) {
                filter.branch_id = branch_id;
            }

            // 1. Today's Revenue
            const todayRevenue = await Sale.sum('payable_amount', {
                where: {
                    ...filter,
                    status: 'completed',
                    created_at: { [Op.between]: [todayStart, todayEnd] }
                }
            }) || 0;

            const lastMonthRevenue = await Sale.sum('payable_amount', {
                where: {
                    ...filter,
                    status: 'completed',
                    created_at: { [Op.between]: [lastMonthStart, lastMonthEnd] }
                }
            }) || 0;

            // 2. Pending Invoices (Unpaid or Partially Paid Sales)
            const pendingInvoices = await Sale.count({
                where: {
                    ...filter,
                    payment_status: { [Op.or]: ['unpaid', 'partially_paid'] },
                    status: { [Op.ne]: 'cancelled' }
                }
            });

            // 3. Low Stock Items
            const stocks = await Stock.findAll({
                include: [
                    {
                        model: ProductVariant,
                        as: 'variant',
                        attributes: ['low_stock_threshold']
                    }
                ],
                where: branch_id ? { branch_id } : {
                    organization_id  // If no branch_id, we still need to filter by organization via associations or direct where if Stock had organization_id
                    // Note: Stock model has organization_id according to previous view_file
                }
            });

            const lowStockCount = stocks.filter(s => {
                const threshold = Number(s.variant?.low_stock_threshold || 10);
                return Number(s.quantity) <= threshold;
            }).length;

            // 4. New Customers (This Month or Today) - Let's do This Month for "Change" visibility
            const thisMonthStart = new Date();
            thisMonthStart.setDate(1);
            thisMonthStart.setHours(0, 0, 0, 0);

            const newCustomers = await Customer.count({
                where: {
                    organization_id,
                    created_at: { [Op.gte]: thisMonthStart }
                }
            });

            // Helper for simple Trend
            const calcTrend = (now, then) => {
                if (!then || then === 0) return { trend: 'up', change: '100%' };
                const pct = ((now - then) / then) * 100;
                return {
                    trend: pct >= 0 ? 'up' : 'down',
                    change: `${Math.abs(pct).toFixed(1)}%`
                };
            };

            const revenueTrend = calcTrend(todayRevenue, lastMonthRevenue / 30);

            return successResponse(res, {
                todayRevenue: {
                    value: todayRevenue,
                    ...revenueTrend
                },
                pendingInvoices: {
                    value: pendingInvoices,
                    trend: 'stable',
                    change: '0%'
                },
                lowStockCount: {
                    value: lowStockCount,
                    trend: lowStockCount > 5 ? 'up' : 'down',
                    change: 'Alert'
                },
                newCustomers: {
                    value: newCustomers,
                    trend: 'up',
                    change: 'Monthly'
                }
            }, 'Dashboard summary fetched');
        } catch (error) { next(error); }
    }
};

module.exports = reportController;
