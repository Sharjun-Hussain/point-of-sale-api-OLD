const db = require('../models');
const {
    Sale, SaleItem, Product, ProductVariant, Customer, User,
    Stock, Branch, Supplier, PurchaseOrder, Expense, Organization,
    SupplierPayment, SupplierPaymentMethod, ExpensePaymentMethod, SaleReturnPayment,
    SaleReturn, SaleReturnItem
} = db;
const { Op, Sequelize } = require('sequelize');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination, getPaginationData } = require('../utils/pagination');

const reportController = {
    // 1. Daily Sales Summary
    getSalePaymentMethods: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            
            const methodsFromPayments = await db.SalePayment.findAll({
                where: { organization_id },
                attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('payment_method')), 'payment_method']],
                raw: true
            });
            
            const methodsFromSales = await db.Sale.findAll({
                where: { 
                    organization_id,
                    payment_method: { [Op.not]: null, [Op.ne]: '' }
                },
                attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('payment_method')), 'payment_method']],
                raw: true
            });
            
            const allMethods = new Set();
            methodsFromPayments.forEach(m => {
                if (m.payment_method && m.payment_method !== 'split') allMethods.add(m.payment_method);
            });
            methodsFromSales.forEach(m => {
                if (m.payment_method && m.payment_method !== 'split') allMethods.add(m.payment_method);
            });
            
            ['cash', 'card', 'bank_transfer', 'cheque'].forEach(m => allMethods.add(m));
            
            return successResponse(res, Array.from(allMethods).map(m => ({ id: m, name: m.charAt(0).toUpperCase() + m.slice(1) })), 'Payment methods fetched successfully');
        } catch (error) { next(error); }
    },

    getDailySales: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id, main_category_ids, sub_category_ids, brand_ids, supplier_ids, batch_ids, payment_methods } = req.query;
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

            if (main_category_ids || sub_category_ids || brand_ids || supplier_ids || batch_ids) {
                const itemWhere = { organization_id };
                const productWhere = {};
                const batchWhere = {};
                
                if (main_category_ids && main_category_ids !== '') {
                    productWhere.main_category_id = { [Op.in]: main_category_ids.split(',') };
                }
                if (sub_category_ids && sub_category_ids !== '') {
                    productWhere.sub_category_id = { [Op.in]: sub_category_ids.split(',') };
                }
                if (brand_ids && brand_ids !== '') {
                    productWhere.brand_id = { [Op.in]: brand_ids.split(',') };
                }
                if (supplier_ids && supplier_ids !== '') {
                    productWhere.supplier_id = { [Op.in]: supplier_ids.split(',') };
                }
                if (batch_ids && batch_ids !== '') {
                    batchWhere.batch_number = { [Op.in]: batch_ids.split(',') };
                }
                
                const includeArray = [];
                if (Object.keys(productWhere).length > 0) {
                    includeArray.push({
                        model: Product,
                        as: 'product',
                        where: productWhere,
                        attributes: []
                    });
                }
                
                if (Object.keys(batchWhere).length > 0) {
                    includeArray.push({
                        model: db.ProductBatch,
                        as: 'batch',
                        where: batchWhere,
                        attributes: []
                    });
                }
                
                const matchingItems = await SaleItem.findAll({
                    where: itemWhere,
                    include: includeArray,
                    attributes: ['sale_id'],
                    raw: true
                });
                
                const saleIds = [...new Set(matchingItems.map(item => item.sale_id))];
                whereClause.id = { [Op.in]: saleIds };
            }

            
            if (payment_methods && payment_methods !== '') {
                const methodsArray = payment_methods.split(',');
                
                const matchingPayments = await db.SalePayment.findAll({
                    where: { 
                        organization_id,
                        payment_method: { [Op.in]: methodsArray }
                    },
                    attributes: ['sale_id'],
                    raw: true
                });
                
                const saleIdsFromPayments = matchingPayments.map(p => p.sale_id);
                
                whereClause[Op.and] = whereClause[Op.and] || [];
                whereClause[Op.and].push({
                    [Op.or]: [
                        { id: { [Op.in]: saleIdsFromPayments } },
                        { payment_method: { [Op.in]: methodsArray } }
                    ]
                });
            }

            const sales = await Sale.findAll({
                where: whereClause,
                include: [
                    { model: Customer, as: 'customer', attributes: ['name'] },
                    { model: User, as: 'cashier', attributes: ['name'] },
                    { model: db.SalePayment, as: 'payments' },
                    { 
                        model: SaleItem, 
                        as: 'items',
                        include: [
                            {
                                model: ProductVariant,
                                as: 'variant',
                                attributes: ['cost_price', 'mrp_price', 'wholesale_price', 'price']
                            },
                            {
                                model: Product,
                                as: 'product',
                                attributes: ['name', 'product_type'],
                                include: [{ model: db.Brand, as: 'brand', attributes: ['name'] }]
                            }
                        ]
                    }
                ],
                order: [['created_at', 'DESC']]
            });



            // Aggregate Data
            const productBreakdown = {};
            const totalSales = sales.reduce((sum, sale) => sum + Number(sale.payable_amount), 0);
            const totalDiscounts = sales.reduce((sum, sale) => sum + Number(sale.discount_amount), 0);
            const totalTax = sales.reduce((sum, sale) => sum + Number(sale.tax_amount), 0);
            let totalRefund = 0; 

            // ── Split Payment Aware Breakdown ──────────────────────────────────────
            const categoryAmounts = {};
            const categoryCounts = {};

            for (const sale of sales) {
                // Determine if there's any credit component
                const isPartiallyUnpaid = sale.payment_status === 'unpaid' || sale.payment_status === 'partially_paid';
                const remaining = Number(sale.payable_amount) - Number(sale.paid_amount);

                if (isPartiallyUnpaid && remaining > 0) {
                    categoryAmounts['Credit'] = (categoryAmounts['Credit'] || 0) + remaining;
                    categoryCounts['Credit'] = (categoryCounts['Credit'] || 0) + 1;
                }

                // Process actual payments
                if (sale.payments && sale.payments.length > 0) {
                    let remaining_payable = Number(sale.payable_amount);
                    for (const pmt of sale.payments) {
                        const method = pmt.payment_method || 'Other';
                        const pmt_amount = Number(pmt.amount);
                        
                        // Cap the payment to remaining payable to exclude change given back
                        // This ensures 'Total Payment' matches 'Total Sales' exactly
                        const effective_amount = Math.max(0, Math.min(pmt_amount, remaining_payable));
                        
                        categoryAmounts[method] = (categoryAmounts[method] || 0) + effective_amount;
                        categoryCounts[method] = (categoryCounts[method] || 0) + 1;
                        
                        remaining_payable -= effective_amount;
                    }
                } else {
                    // Fallback for legacy data/drafts
                    const method = sale.payment_method || 'Other';
                    const effective_amount = Math.max(0, Math.min(Number(sale.paid_amount), Number(sale.payable_amount)));
                    categoryAmounts[method] = (categoryAmounts[method] || 0) + effective_amount;
                    categoryCounts[method] = (categoryCounts[method] || 0) + 1;
                }

                // Product Breakdown
                if (sale.items && sale.items.length > 0) {
                    for (const item of sale.items) {
                        const qty = Number(item.quantity);
                        const amount = Number(item.total_amount || (qty * Number(item.price || item.variant?.price || 0)));
                        const isService = item.product?.product_type === 'Service';
                        
                        if (!isService) {
                            const brandName = item.product?.brand?.name || item.product?.name || item.variant?.name || 'Unbranded';
                            if (!productBreakdown[brandName]) productBreakdown[brandName] = { brand: brandName, quantity: 0, amount: 0 };
                            productBreakdown[brandName].quantity += qty;
                            productBreakdown[brandName].amount += amount;
                        }
                    }
                }
            }

            // ── Cash Refunds (cash returned to customers in this date range) ───────
            const refundWhereClause = { organization_id, payment_method: 'cash' };
            if (start_date && end_date) {
                refundWhereClause.created_at = {
                    [Op.between]: [
                        new Date(start_date + 'T00:00:00'),
                        new Date(end_date + 'T23:59:59')
                    ]
                };
            }
            const cashRefunds = await db.SaleReturnPayment.findAll({
                where: refundWhereClause,
                attributes: ['amount'],
                raw: true
            });
            const totalCashRefunded = cashRefunds.reduce((sum, r) => sum + Number(r.amount), 0);
            totalRefund = totalCashRefunded;

            // ── Shift Opening Balance (sum of all shifts opened in this date range) ─
            const shiftWhereClause = { organization_id };
            if (branch_id && branch_id !== 'all') {
                shiftWhereClause.branch_id = branch_id;
            }
            if (start_date && end_date) {
                shiftWhereClause.opening_time = {
                    [Op.between]: [
                        new Date(start_date + 'T00:00:00'),
                        new Date(end_date + 'T23:59:59')
                    ]
                };
            }
            const shifts = await db.Shift.findAll({
                where: shiftWhereClause,
                attributes: ['opening_cash'],
                raw: true
            });
            const totalOpeningBalance = shifts.reduce((sum, s) => sum + Number(s.opening_cash || 0), 0);

            // ── Real Cash in Hand Calculation ──────────────────────────────────────
            // Normalise cash key — DB may store as 'cash' (lowercase) or 'Cash' (capitalised)
            const cashSales = (categoryAmounts['cash'] || categoryAmounts['Cash'] || 0);
            const cashInHand = totalOpeningBalance + cashSales - totalCashRefunded;

            // Calculate percentages based on AMOUNT (more useful for financial reports)
            const breakdownPercentages = {};
            for (const [category, amount] of Object.entries(categoryAmounts)) {
                breakdownPercentages[category] = totalSales > 0 ? Math.round((amount / totalSales) * 100) : 0;
            }

            return successResponse(res, {
                transactions: sales.map(s => {
                    const total_cost = s.items ? s.items.reduce((sum, item) => sum + (Number(item.variant?.cost_price || 0) * Number(item.quantity)), 0) : 0;
                    const total_mrp = s.items ? s.items.reduce((sum, item) => sum + (Number(item.variant?.mrp_price || 0) * Number(item.quantity)), 0) : 0;
                    const total_wholesale = s.items ? s.items.reduce((sum, item) => sum + (Number(item.variant?.wholesale_price || 0) * Number(item.quantity)), 0) : 0;
                    const total_selling_base = s.items ? s.items.reduce((sum, item) => sum + (Number(item.variant?.price || 0) * Number(item.quantity)), 0) : 0;
                    
                    return {
                        id: s.invoice_number || s.id.substring(0, 8).toUpperCase(),
                        date: s.created_at,
                        customer: s.customer ? s.customer.name : 'Walk-in',
                        total: Number(s.payable_amount), 
                        subtotal: Number(s.total_amount),
                        discount: Number(s.discount_amount),
                        tax: Number(s.tax_amount),
                        status: s.status,
                        type: s.payment_method, // legacy field remains for simple list
                        payment_status: s.payment_status, 
                        paid_amount: Number(s.paid_amount),
                        cashier: s.cashier ? s.cashier.name : 'Unknown',
                        payments: s.payments, // include detail
                        total_cost,
                        total_mrp,
                        total_wholesale,
                        total_selling_base,
                        source: s.source
                    };
                }),
                stats: {
                    totalSales,
                    totalTransactions: sales.length,
                    totalDiscounts,
                    totalTax,
                    avgValue: sales.length > 0 ? totalSales / sales.length : 0,
                    paymentBreakdown: breakdownPercentages,
                    paymentAmounts: categoryAmounts,
                    productBreakdown,
                    totalRefund,
                    totalOpeningBalance,
                    cashInHand,
                    shopifyEnabled: !!(await db.Organization.findByPk(organization_id))?.shopify_enabled,
                    posSalesVolume: sales.filter(s => s.source !== 'shopify').reduce((sum, s) => sum + Number(s.payable_amount), 0),
                    shopifySalesVolume: sales.filter(s => s.source === 'shopify').reduce((sum, s) => sum + Number(s.payable_amount), 0),
                }
            }, 'Daily sales report fetched successfully');

        } catch (error) {
            next(error);
        }
    },

    // 2. Sales by Product
    getSalesByProduct: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id, main_category_id, sub_category_id, brand_id, page = 1, limit = 10 } = req.query;
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
            if (sub_category_id && sub_category_id !== 'all') {
                productWhere.sub_category_id = sub_category_id;
            }
            if (req.query.search) {
                productWhere[Op.or] = [
                    { name: { [Op.like]: `%${req.query.search}%` } },
                    { code: { [Op.like]: `%${req.query.search}%` } }
                ];
            }

            // Note: We need to aggregate first, then paginate. 
            // Since we're grouping by product and variant, items might be numerous.
            // Using a subquery or calculating the full set is necessary for correct total counts.

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
                        attributes: ['name', 'sku', 'price', 'mrp_price', 'wholesale_price', 'cost_price']
                    },
                    {
                        model: db.ProductBatch,
                        as: 'batch',
                        attributes: ['batch_number', 'expiry_date']
                    }
                ],
                attributes: [
                    'product_id',
                    'product_variant_id',
                    'product_batch_id',
                    [Sequelize.fn('SUM', Sequelize.col('SaleItem.quantity')), 'total_quantity'],
                    [Sequelize.fn('SUM', Sequelize.col('SaleItem.total_amount')), 'total_revenue']
                ],
                group: ['product_id', 'product_variant_id', 'product_batch_id', 'product.id', 'variant.id', 'batch.id'],
                order: [[Sequelize.literal('total_revenue'), 'DESC']],
                raw: true,
                nest: true
            });

            // Calculate Summary for the whole set
            const summary = items.reduce((acc, curr) => ({
                totalRevenue: acc.totalRevenue + Number(curr.total_revenue),
                totalSold: acc.totalSold + Number(curr.total_quantity),
                uniqueProducts: acc.uniqueProducts + 1
            }), { totalRevenue: 0, totalSold: 0, uniqueProducts: 0 });

            // Pagination
            const total = items.length;
            const totalPages = Math.ceil(total / limit);
            const offset = (page - 1) * limit;
            const paginatedData = items.slice(offset, offset + Number(limit));

            return successResponse(res, {
                data: paginatedData,
                summary,
                pagination: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    totalPages
                }
            }, 'Product sales report fetched successfully');
        } catch (error) { next(error); }
    },

    // 3. Current Stock Value
    getStockValue: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;

            const stocks = await Stock.findAll({
                where: { organization_id },
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
                where: { organization_id },
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
                variant_id: s.variant_id,
                product_id: s.product_id,
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

            const organization = await db.Organization.findByPk(organization_id);
            const shopifyEnabled = organization?.shopify_enabled;

            // 1. Revenue (Sales) grouped by source
            const salesData = await Sale.findAll({
                where: {
                    organization_id,
                    status: 'completed',
                    ...dateFilter,
                    ...branchFilter
                },
                attributes: [
                    'source',
                    [Sequelize.fn('SUM', Sequelize.col('payable_amount')), 'revenue']
                ],
                group: ['source'],
                raw: true
            });
            const sales = salesData.reduce((sum, s) => sum + Number(s.revenue), 0);

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
                        attributes: ['source']
                    },
                    { model: ProductVariant, as: 'variant', attributes: ['cost_price'] }
                ]
            });

            let cogs = 0;
            const cogsBySource = { pos: 0, shopify: 0 };
            soldItems.forEach(item => {
                const itemCogs = Number(item.quantity) * Number(item.variant?.cost_price || 0);
                cogs += itemCogs;
                const source = item.sale?.source || 'pos';
                cogsBySource[source] = (cogsBySource[source] || 0) + itemCogs;
            });

            // 4. Sales Returns
            const returns = await db.SaleReturn.findAll({
                where: {
                    organization_id,
                    status: 'completed',
                    ...dateFilter,
                    ...branchFilter
                },
                include: [
                    { model: db.Sale, as: 'sale', attributes: ['source'] },
                    { model: db.SaleReturnItem, as: 'items', include: [{ model: db.ProductVariant, as: 'variant', attributes: ['cost_price'] }] }
                ]
            });

            let totalReturns = 0;
            let returnCogs = 0;
            const returnsBySource = { pos: 0, shopify: 0 };
            const returnCogsBySource = { pos: 0, shopify: 0 };

            returns.forEach(r => {
                const rAmount = Number(r.total_amount);
                totalReturns += rAmount;
                const source = r.sale?.source || 'pos';
                returnsBySource[source] = (returnsBySource[source] || 0) + rAmount;

                const rCogs = r.items.reduce((iSum, item) => iSum + (Number(item.quantity) * Number(item.variant?.cost_price || 0)), 0);
                returnCogs += rCogs;
                returnCogsBySource[source] = (returnCogsBySource[source] || 0) + rCogs;
            });

            const revenue = (sales || 0) - totalReturns;
            const adjustedCogs = cogs - returnCogs;
            const totalExpenses = expenses || 0;
            const grossProfit = revenue - adjustedCogs;
            const netProfit = grossProfit - totalExpenses;

            let sourceBreakdown = null;
            if (shopifyEnabled) {
                const rawPosRev = Number(salesData.find(s => s.source !== 'shopify')?.revenue || 0);
                const rawShopifyRev = Number(salesData.find(s => s.source === 'shopify')?.revenue || 0);
                
                const posRevenue = rawPosRev - returnsBySource.pos;
                const shopifyRevenue = rawShopifyRev - returnsBySource.shopify;
                
                const posCogs = cogsBySource.pos - returnCogsBySource.pos;
                const shopifyCogs = cogsBySource.shopify - returnCogsBySource.shopify;

                sourceBreakdown = {
                    pos: {
                        revenue: posRevenue,
                        cogs: posCogs,
                        grossProfit: posRevenue - posCogs
                    },
                    shopify: {
                        revenue: shopifyRevenue,
                        cogs: shopifyCogs,
                        grossProfit: shopifyRevenue - shopifyCogs
                    }
                };
            }

            return successResponse(res, {
                revenue,
                cogs: adjustedCogs,
                returns: totalReturns,
                grossProfit,
                expenses: totalExpenses,
                netProfit,
                margin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
                sourceBreakdown

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
            const { start_date, end_date, branch_id, user_id, page, size } = req.query;
            const organization_id = req.user.organization_id;
            const { limit, offset } = getPagination(page, size);

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

            const { count, rows: returns } = await SaleReturn.findAndCountAll({
                where: whereClause,
                include: [
                    { model: Customer, as: 'customer', attributes: ['name'] },
                    { model: Sale, as: 'sale', attributes: ['invoice_number'] },
                    { model: User, as: 'cashier', attributes: ['name'] },
                    {
                        model: SaleReturnItem,
                        as: 'items',
                        include: [{ model: Product, as: 'product', attributes: ['name'] }]
                    }
                ],
                order: [['return_date', 'DESC']],
                limit,
                offset
            });

            // Calculate Metrics for Report
            const totalReturns = count;
            const totalReturnAmount = returns.reduce((sum, r) => sum + parseFloat(r.total_amount || 0), 0);
            const totalRefundAmount = returns.reduce((sum, r) => sum + parseFloat(r.refund_amount || 0), 0);
            const uniqueCustomers = new Set(returns.map(r => r.customer_id)).size;

            return paginatedResponse(res, returns, {
                total: count,
                page: parseInt(page) || 1,
                limit,
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
            const { type, start_date, end_date, branch_id, page, size } = req.query; // type: 'main' or 'sub'
            const organization_id = req.user.organization_id;
            const { limit, offset } = getPagination(page, size);

            const dateFilter = {};
            if (start_date && end_date) {
                dateFilter.created_at = {
                    [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')]
                };
            }

            if (branch_id && branch_id !== 'all') {
                dateFilter.branch_id = branch_id;
            }

            const isMain = type === 'main';
            const categoryModel = isMain ? 'main_category' : 'sub_category';

            const categorySales = await db.SaleItem.findAndCountAll({
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
                order: [[Sequelize.literal('total_revenue'), 'DESC']],
                limit,
                offset,
                subQuery: false,
                distinct: true
            });

            // Calculate grand total revenue for percentage share
            const totalResult = await db.SaleItem.findAll({
                include: [
                    {
                        model: db.Sale,
                        as: 'sale',
                        where: { organization_id, status: 'completed', ...dateFilter },
                        attributes: []
                    }
                ],
                attributes: [
                    [Sequelize.fn('SUM', Sequelize.col('SaleItem.total_amount')), 'grand_total_revenue']
                ],
                raw: true
            });

            const grandTotalRevenue = totalResult[0]?.grand_total_revenue || 0;

            return paginatedResponse(res, categorySales.rows, {
                total: categorySales.count.length, // findAndCountAll with group returns array of counts
                page: parseInt(page) || 1,
                limit,
                grandTotalRevenue
            }, 'Category sales report fetched successfully');
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

    // 12. Loyalty Report
    getLoyaltyReport: async (req, res, next) => {
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

            if (start_date && end_date) {
                whereClause.created_at = {
                    [Op.between]: [
                        new Date(start_date + 'T00:00:00'),
                        new Date(end_date + 'T23:59:59')
                    ]
                };
            }

            // 1. Transactional Data (Earned vs Redeemed)
            const sales = await Sale.findAll({
                where: whereClause,
                attributes: ['invoice_number', 'earned_points', 'redeemed_points', 'payable_amount', 'created_at'],
                include: [{ model: Customer, as: 'customer', attributes: ['name', 'phone'] }],
                order: [['created_at', 'DESC']]
            });

            // 2. Customer Balances
            const topCustomers = await Customer.findAll({
                where: { organization_id, loyalty_points: { [Op.gt]: 0 } },
                attributes: ['name', 'phone', 'loyalty_points'],
                order: [['loyalty_points', 'DESC']],
                limit: 20
            });

            // 3. Summary Stats
            const summary = {
                totalEarned: sales.reduce((sum, s) => sum + (s.earned_points || 0), 0),
                totalRedeemed: sales.reduce((sum, s) => sum + (s.redeemed_points || 0), 0),
                activeCustomers: await Customer.count({ where: { organization_id, loyalty_points: { [Op.gt]: 0 } } }),
                totalOutstanding: await Customer.sum('loyalty_points', { where: { organization_id } }) || 0
            };

            return successResponse(res, {
                transactions: sales.filter(s => s.earned_points > 0 || s.redeemed_points > 0),
                topCustomers,
                summary
            }, 'Loyalty report fetched successfully');

        } catch (error) { next(error); }
    },

    // 13. Sold Item Count
    getSoldItemCount: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id, page, size } = req.query;
            const organization_id = req.user.organization_id;
            const { limit, offset } = getPagination(page, size);

            const dateFilter = {};
            if (start_date && end_date) {
                dateFilter.created_at = {
                    [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')]
                };
            }

            const saleWhere = {
                organization_id,
                status: 'completed',
                ...dateFilter
            };

            if (branch_id && branch_id !== 'all') {
                saleWhere.branch_id = branch_id;
            }

            const items = await db.SaleItem.findAndCountAll({
                include: [
                    {
                        model: db.Sale,
                        as: 'sale',
                        where: saleWhere,
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
                order: [[Sequelize.literal('count'), 'DESC']],
                limit,
                offset,
                subQuery: false,
                distinct: true
            });

            // Calculate total quantity sold for summary card
            const totalQtyResult = await db.SaleItem.findAll({
                include: [
                    {
                        model: db.Sale,
                        as: 'sale',
                        where: saleWhere,
                        attributes: []
                    }
                ],
                attributes: [
                    [Sequelize.fn('SUM', Sequelize.col('quantity')), 'total_quantity']
                ],
                raw: true
            });

            const totalQuantity = totalQtyResult[0]?.total_quantity || 0;

            return paginatedResponse(res, items.rows, {
                total: items.count.length, // Grouping causes count to be an array
                page: parseInt(page) || 1,
                limit,
                totalQuantity
            }, 'Sold item count report fetched successfully');
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
            const { 
                branch_id, 
                main_category_id, 
                sub_category_id, 
                page = 1, 
                size = 20, 
                search, 
                status,
                batch_number,
                expiry_start,
                expiry_end,
                received_start,
                received_end
            } = req.query;

            const { limit, offset } = getPagination(page, size);

            const where = { organization_id };
            if (branch_id && branch_id !== 'all') where.branch_id = branch_id;

            if (search) {
                where[Op.or] = [
                    { '$product.name$': { [Op.like]: `%${search}%` } },
                    { '$product.code$': { [Op.like]: `%${search}%` } },
                    { '$variant.sku$': { [Op.like]: `%${search}%` } }
                ];
            }

            // Status Filtering
            if (status === 'out') {
                where.quantity = { [Op.lte]: 0 };
            } else if (status === 'low') {
                where[Op.and] = [
                    { quantity: { [Op.gt]: 0 } },
                    { quantity: { [Op.lte]: Sequelize.col('variant.low_stock_threshold') } }
                ];
            }

            const productWhere = {};
            if (main_category_id && main_category_id !== 'all') productWhere.main_category_id = main_category_id;
            if (sub_category_id && sub_category_id !== 'all') productWhere.sub_category_id = sub_category_id;

            // Batch filter logic
            const batchFilterWhere = { organization_id };
            if (batch_number) batchFilterWhere.batch_number = { [Op.like]: `%${batch_number}%` };
            if (expiry_start && expiry_end) {
                batchFilterWhere.expiry_date = { [Op.between]: [new Date(expiry_start + 'T00:00:00'), new Date(expiry_end + 'T23:59:59')] };
            } else if (expiry_start) {
                batchFilterWhere.expiry_date = { [Op.gte]: new Date(expiry_start + 'T00:00:00') };
            } else if (expiry_end) {
                batchFilterWhere.expiry_date = { [Op.lte]: new Date(expiry_end + 'T23:59:59') };
            }

            if (received_start && received_end) {
                batchFilterWhere.purchase_date = { [Op.between]: [new Date(received_start + 'T00:00:00'), new Date(received_end + 'T23:59:59')] };
            } else if (received_start) {
                batchFilterWhere.purchase_date = { [Op.gte]: new Date(received_start + 'T00:00:00') };
            } else if (received_end) {
                batchFilterWhere.purchase_date = { [Op.lte]: new Date(received_end + 'T23:59:59') };
            }

            const hasBatchFilters = Object.keys(batchFilterWhere).length > 1;

            const stocks = await db.Stock.findAndCountAll({
                where,
                include: [
                    {
                        model: db.Product,
                        as: 'product',
                        where: Object.keys(productWhere).length > 0 ? productWhere : undefined,
                        attributes: ['name', 'code'],
                        include: [
                            { model: db.MainCategory, as: 'main_category', attributes: ['name'] }
                        ]
                    },
                    { 
                        model: db.ProductVariant, 
                        as: 'variant', 
                        attributes: ['name', 'sku', 'cost_price', 'price', 'low_stock_threshold'] 
                    },
                    {
                        model: db.Branch,
                        as: 'branch',
                        attributes: ['name']
                    },
                    {
                        model: db.ProductBatch,
                        as: 'batches',
                        required: hasBatchFilters,
                        attributes: ['batch_number', 'expiry_date', 'quantity', 'cost_price', 'selling_price', 'mrp_price'],
                        where: {
                            ...batchFilterWhere,
                            // Crucial: Only return batches for THIS specific stock row's branch/variant
                            branch_id: { [Op.eq]: Sequelize.col('Stock.branch_id') },
                            [Op.and]: [
                                Sequelize.literal('`batches`.`product_variant_id` = `Stock`.`product_variant_id` OR (`batches`.`product_variant_id` IS NULL AND `Stock`.`product_variant_id` IS NULL)')
                            ]
                        }
                    }
                ],
                limit,
                offset,
                distinct: true,
                subQuery: false,
                order: [[{ model: db.Product, as: 'product' }, 'name', 'ASC']]
            });

            // Calculate Global Stats for the top cards (only if first page or specifically requested)
            const statsWhere = { organization_id };
            if (branch_id && branch_id !== 'all') statsWhere.branch_id = branch_id;

            const totalItems = await db.Stock.count({ where: statsWhere });
            const totalQty = await db.Stock.sum('quantity', { where: statsWhere });
            
            const allStocks = await db.Stock.findAll({ 
                where: statsWhere, 
                attributes: ['quantity'],
                include: [{ model: db.ProductVariant, as: 'variant', attributes: ['low_stock_threshold'] }]
            });

            const lowStockCount = allStocks.filter(s => {
                const threshold = Number(s.variant?.low_stock_threshold || 10);
                return Number(s.quantity) > 0 && Number(s.quantity) <= threshold;
            }).length;

            const outOfStockCount = allStocks.filter(s => Number(s.quantity) <= 0).length;

            return res.status(200).json({
                status: 'success',
                message: 'Stock summary fetched successfully',
                data: {
                    data: stocks.rows,
                    pagination: {
                        total: stocks.count,
                        page: parseInt(page),
                        limit,
                        pages: Math.ceil(stocks.count / limit),
                        stats: {
                            totalItems,
                            totalQty: totalQty || 0,
                            lowStock: lowStockCount,
                            outOfStock: outOfStockCount
                        }
                    }
                }
            });
        } catch (error) { next(error); }
    },

    // 16. Supplier Profitability (Profit generated from goods bought from specific suppliers)
    getSupplierProfit: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            const { start_date, end_date, branch_id, supplier_id, page = 1, size = 10 } = req.query;
            const limit = parseInt(size);

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
                if (!supplier) return; // Skip if no supplier (though products usually have one)

                const supplierId = supplier.id;
                const supplierName = supplier.name;

                if (!profitBySupplier[supplierId]) {
                    profitBySupplier[supplierId] = {
                        supplier_name: supplierName,
                        sold: 0,
                        totalRevenue: 0,
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

                profitBySupplier[supplierId].sold += qty;
                profitBySupplier[supplierId].totalRevenue += totalAmount; // This is the net revenue for the supplier
                profitBySupplier[supplierId].discount += lineDiscount;
                profitBySupplier[supplierId].cost += cost;
                profitBySupplier[supplierId].profit += (totalAmount - cost);
            });

            const allResults = Object.values(profitBySupplier).map(stats => ({
                ...stats,
                margin: stats.totalRevenue > 0 ? (stats.profit / stats.totalRevenue) * 100 : 0
            })).sort((a, b) => b.profit - a.profit);

            // Summary for the whole set
            const summaryData = allResults.reduce((acc, curr) => ({
                totalRevenue: acc.totalRevenue + curr.totalRevenue,
                totalProfit: acc.totalProfit + curr.profit,
                activeSuppliers: acc.activeSuppliers + 1
            }), { totalRevenue: 0, totalProfit: 0, activeSuppliers: 0 });

            summaryData.topSupplier = allResults.length > 0 ? allResults[0] : null;

            // Pagination
            const total = allResults.length;
            const totalPages = Math.ceil(total / limit);
            const offset = (page - 1) * limit;
            const paginatedData = allResults.slice(offset, offset + limit);

            return successResponse(res, {
                data: paginatedData,
                summary: summaryData,
                pagination: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    totalPages
                }
            }, 'Supplier profit report fetched successfully');
        } catch (error) { next(error); }
    },

    // 17. Non-Stock Sales Summary
    getNonStockSales: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id, page, size } = req.query;
            const organization_id = req.user.organization_id;
            const { limit, offset } = getPagination(page, size);

            const dateFilter = {};
            if (start_date && end_date) {
                dateFilter.created_at = {
                    [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')]
                };
            }

            const saleWhere = {
                organization_id,
                status: 'completed',
                ...dateFilter
            };

            if (branch_id && branch_id !== 'all') {
                saleWhere.branch_id = branch_id;
            }

            const items = await db.SaleItem.findAndCountAll({
                include: [
                    {
                        model: db.Sale,
                        as: 'sale',
                        where: saleWhere,
                        attributes: ['invoice_number', 'created_at']
                    },
                    {
                        model: db.Product,
                        as: 'product',
                        required: true,
                        attributes: ['name', 'code']
                    }
                ],
                order: [['created_at', 'DESC']],
                limit,
                offset,
                subQuery: false,
                distinct: true
            });

            // Calculate total revenue for summary
            const totalRevenueResult = await db.SaleItem.findAll({
                include: [
                    {
                        model: db.Sale,
                        as: 'sale',
                        where: saleWhere,
                        attributes: []
                    },
                    {
                        model: db.Product,
                        as: 'product',
                        required: true,
                        attributes: []
                    }
                ],
                attributes: [
                    [Sequelize.fn('SUM', Sequelize.col('SaleItem.total_amount')), 'total_revenue']
                ],
                raw: true
            });

            const grandTotalRevenue = totalRevenueResult[0]?.total_revenue || 0;

            const totalPages = Math.ceil(items.count / limit);

            return successResponse(res, {
                data: items.rows,
                pagination: {
                    total: items.count,
                    page: parseInt(page) || 1,
                    limit,
                    totalPages,
                    grandTotalRevenue
                }
            }, 'Non-stock sales report fetched successfully');
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
    getCardReconciliation: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id } = req.query;
            const organization_id = req.user.organization_id;

            const saleWhere = {
                organization_id,
                status: 'completed'
            };

            if (branch_id && branch_id !== 'all') {
                saleWhere.branch_id = branch_id;
            }

            if (start_date && end_date) {
                saleWhere.created_at = {
                    [Op.between]: [
                        new Date(start_date + 'T00:00:00'),
                        new Date(end_date + 'T23:59:59')
                    ]
                };
            }

            const sales = await Sale.findAll({
                where: saleWhere,
                attributes: ['invoice_number', 'total_amount', 'tax_amount', 'payable_amount', 'created_at', 'payment_method'],
                include: [
                    { model: Branch, as: 'branch', attributes: ['name'] },
                    { 
                        model: db.SalePayment, 
                        as: 'payments',
                        where: { payment_method: 'Card' }, // Filter sales that HAVE card payments
                        required: true // INNER JOIN effectively
                    }
                ],
                order: [['created_at', 'DESC']]
            });

            const summary = {
                totalSales: sales.reduce((sum, s) => {
                    // We only sum the CARD portion for this report
                    const cardPortion = s.payments.reduce((pSum, p) => pSum + Number(p.amount), 0);
                    return sum + cardPortion;
                }, 0),
                count: sales.length,
                discrepancyCount: 0
            };

            return successResponse(res, { details: sales, summary }, 'Card reconciliation report fetched successfully');
        } catch (error) { next(error); }
    },

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
                where: { organization_id },
                include: [
                    {
                        model: ProductVariant,
                        as: 'variant',
                        attributes: ['low_stock_threshold']
                    }
                ],
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

            // 2. Pending Invoices Stats
            const totalActiveInvoices = await Sale.count({
                where: { organization_id, status: { [Op.ne]: 'cancelled' } }
            });

            // 3. Low Stock Stats
            const totalStockItems = stocks.length;

            // 4. Customer Comparison
            const lastMonthCustomersStart = new Date(thisMonthStart);
            lastMonthCustomersStart.setMonth(lastMonthCustomersStart.getMonth() - 1);
            
            const lastMonthCustomers = await Customer.count({
                where: {
                    organization_id,
                    created_at: { [Op.between]: [lastMonthCustomersStart, thisMonthStart] }
                }
            });

            const customerTrend = calcTrend(newCustomers, lastMonthCustomers);

            return successResponse(res, {
                todayRevenue: {
                    value: todayRevenue,
                    ...revenueTrend
                },
                pendingInvoices: {
                    value: pendingInvoices,
                    trend: pendingInvoices > 0 ? 'up' : 'stable',
                    change: totalActiveInvoices > 0 
                        ? `${((pendingInvoices / totalActiveInvoices) * 100).toFixed(0)}%` 
                        : '0%'
                },
                lowStockCount: {
                    value: lowStockCount,
                    trend: lowStockCount > 0 ? 'up' : 'down',
                    change: totalStockItems > 0
                        ? `${((lowStockCount / totalStockItems) * 100).toFixed(1)}%`
                        : '0%'
                },
                expiringCount: {
                    value: await db.ProductBatch.count({
                        where: {
                            organization_id,
                            quantity: { [Op.gt]: 0 },
                            expiration_status: { [Op.in]: ['expired', 'critical', 'warning'] }
                        }
                    }),
                    trend: 'stable',
                    change: 'Alerts'
                },
                newCustomers: {
                    value: newCustomers,
                    ...customerTrend
                }
            }, 'Dashboard summary fetched');
        } catch (error) { next(error); }
    },

    getDashboardCharts: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            const branch_id = req.user.branch_id;

            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            weekAgo.setHours(0, 0, 0, 0);

            const filter = { organization_id, status: 'completed' };
            if (branch_id) {
                filter.branch_id = branch_id;
            }

            // 1. Daily Revenue (Last 7 Days)
            const dailyRevenue = await Sale.findAll({
                where: {
                    ...filter,
                    created_at: { [Op.gte]: weekAgo }
                },
                attributes: [
                    [Sequelize.fn('DATE', Sequelize.col('created_at')), 'date'],
                    [Sequelize.fn('SUM', Sequelize.col('payable_amount')), 'revenue']
                ],
                group: [Sequelize.fn('DATE', Sequelize.col('created_at'))],
                order: [[Sequelize.fn('DATE', Sequelize.col('created_at')), 'ASC']],
                raw: true
            });

            // 2. Category Distribution (Top 5)
            const categoryRevenue = await SaleItem.findAll({
                include: [
                    {
                        model: Sale,
                        as: 'sale',
                        where: filter,
                        attributes: []
                    },
                    {
                        model: Product,
                        as: 'product',
                        attributes: [],
                        include: [{ model: db.MainCategory, as: 'main_category', attributes: ['name'] }]
                    }
                ],
                attributes: [
                    [Sequelize.col('product->main_category.name'), 'name'],
                    [Sequelize.fn('SUM', Sequelize.col('SaleItem.total_amount')), 'value']
                ],
                group: [Sequelize.col('product->main_category.id'), Sequelize.col('product->main_category.name')],
                order: [[Sequelize.literal('value'), 'DESC']],
                limit: 5,
                raw: true
            });

            return successResponse(res, {
                revenueHistory: dailyRevenue.map(r => ({
                    date: new Date(r.date).toLocaleDateString('en-US', { weekday: 'short' }),
                    revenue: Number(r.revenue)
                })),
                categoryMix: categoryRevenue.map(c => ({
                    name: c.name || 'Uncategorized',
                    value: Number(c.value)
                }))
            }, 'Dashboard charts data fetched successfully');
        } catch (error) { next(error); }
    },

    // 19. Shift History
    getShiftHistory: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id, user_id } = req.query;
            const organization_id = req.user.organization_id;

            const where = { organization_id };
            if (branch_id && branch_id !== 'all') where.branch_id = branch_id;
            if (user_id && user_id !== 'all') where.user_id = user_id;
            
            if (start_date && end_date) {
                where.opening_time = {
                    [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')]
                };
            }

            const shifts = await db.Shift.findAll({
                where,
                include: [
                    { model: db.User, as: 'cashier', attributes: ['name'] },
                    { model: db.Branch, as: 'branch', attributes: ['name'] }
                ],
                order: [['opening_time', 'DESC']]
            });

            return successResponse(res, shifts, 'Shift history fetched successfully');
        } catch (error) { next(error); }
    },

    // 20. Shift Detailed Report (Z-Read)
    getShiftReport: async (req, res, next) => {
        try {
            const { id } = req.params;
            const organization_id = req.user.organization_id;

            const shift = await db.Shift.findOne({
                where: { id, organization_id },
                include: [
                    { model: db.User, as: 'cashier', attributes: ['name', 'email'] },
                    { model: db.Branch, as: 'branch', attributes: ['name'] },
                    { model: db.ShiftTransaction, as: 'transactions' },
                    { 
                        model: db.Sale, 
                        as: 'sales',
                        where: { status: 'completed' },
                        required: false,
                        include: [{ model: db.SalePayment, as: 'payments' }]
                    }
                ]
            });

            if (!shift) return errorResponse(res, 'Shift not found', 404);

            // Aggregate Sales Stats
            const stats = {
                totalSales: 0,
                totalTax: 0,
                totalDiscount: 0,
                totalPaid: 0,
                transactionCount: shift.sales?.length || 0
            };

            const paymentBreakdown = {};

            if (shift.sales) {
                for (const sale of shift.sales) {
                    stats.totalSales += Number(sale.payable_amount);
                    stats.totalTax += Number(sale.tax_amount);
                    stats.totalDiscount += Number(sale.discount_amount);
                    stats.totalPaid += Number(sale.paid_amount);

                    if (sale.payments && sale.payments.length > 0) {
                        for (const pmt of sale.payments) {
                            const method = pmt.payment_method || 'Other';
                            paymentBreakdown[method] = (paymentBreakdown[method] || 0) + Number(pmt.amount);
                        }
                    } else {
                        const method = sale.payment_method || 'Other';
                        paymentBreakdown[method] = (paymentBreakdown[method] || 0) + Number(sale.paid_amount);
                    }
                }
            }

            return successResponse(res, {
                shift: {
                    id: shift.id,
                    status: shift.status,
                    opening_time: shift.opening_time,
                    closing_time: shift.closing_time,
                    opening_cash: Number(shift.opening_cash),
                    closing_cash: Number(shift.closing_cash),
                    expected_cash: Number(shift.expected_cash),
                    variance: Number(shift.variance),
                    cashier: shift.cashier,
                    branch: shift.branch,
                    transactions: shift.transactions
                },
                stats,
                paymentBreakdown
            }, 'Shift detailed report fetched');
        } catch (error) { next(error); }
    },
    
    // 21. Payment Register (Suppliers & Expenses)
    getPaymentRegister: async (req, res, next) => {
        try {
            const { start_date, end_date, type, branch_id } = req.query; // type: supplier, expense, all
            const organization_id = req.user.organization_id;

            const dateFilter = {};
            if (start_date && end_date) {
                dateFilter.created_at = {
                    [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')]
                };
            }

            const results = [];

            // 1. Supplier Payments
            if (!type || type === 'all' || type === 'supplier') {
                const supplierPayments = await db.SupplierPayment.findAll({
                    where: { organization_id, ...dateFilter },
                    include: [
                        { model: db.Supplier, as: 'supplier', attributes: ['name'] },
                        { model: db.User, as: 'cashier', attributes: ['name'] },
                        { model: db.SupplierPaymentMethod, as: 'methods' }
                    ]
                });

                supplierPayments.forEach(p => {
                    results.push({
                        id: p.id,
                        voucher_number: p.voucher_number,
                        date: p.payment_date,
                        payee: p.supplier?.name,
                        type: 'Supplier Settlement',
                        total_amount: p.total_amount,
                        status: 'completed',
                        methods: p.methods.map(m => ({
                            method: m.payment_method,
                            amount: m.amount,
                            account: m.account_id
                        }))
                    });
                });
            }

            // 2. Expenses
            if (!type || type === 'all' || type === 'expense') {
                const expenseDateFilter = {};
                if (start_date && end_date) {
                    expenseDateFilter.expense_date = {
                        [Op.between]: [new Date(start_date), new Date(end_date)]
                    };
                }

                const expenses = await db.Expense.findAll({
                    where: { organization_id, ...expenseDateFilter },
                    include: [
                        { model: db.User, as: 'cashier', attributes: ['name'] },
                        { model: db.ExpensePaymentMethod, as: 'payments' }
                    ]
                });

                expenses.forEach(e => {
                    results.push({
                        id: e.id,
                        voucher_number: e.id.substring(0, 8).toUpperCase(),
                        date: e.expense_date,
                        payee: e.payee || 'Other',
                        type: `Expense (${e.category})`,
                        total_amount: e.amount,
                        status: 'completed',
                        methods: e.payments.map(m => ({
                            method: m.payment_method,
                            amount: m.amount
                        }))
                    });
                });
            }

            // Sort by date DESC
            results.sort((a, b) => new Date(b.date) - new Date(a.date));

            return successResponse(res, results, 'Payment register fetched successfully');
        } catch (error) { next(error); }
    },

    // 22. Expiring Products Report
    getExpiringProducts: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            const { branch_id, status } = req.query;

            const where = { 
                organization_id,
                quantity: { [Op.gt]: 0 },
                expiration_status: status && status !== 'all' ? status : { [Op.in]: ['expired', 'critical', 'warning'] }
            };

            if (branch_id && branch_id !== 'all') {
                where.branch_id = branch_id;
            }

            const batches = await db.ProductBatch.findAll({
                where,
                include: [
                    {
                        model: db.Product,
                        as: 'product',
                        attributes: ['name', 'code', 'image']
                    },
                    {
                        model: db.ProductVariant,
                        as: 'variant',
                        attributes: ['name', 'sku']
                    },
                    {
                        model: db.Branch,
                        as: 'branch',
                        attributes: ['name']
                    }
                ],
                order: [['expiry_date', 'ASC']]
            });

            return successResponse(res, batches, 'Expiring products report fetched successfully');
        } catch (error) { next(error); }
    },

    // 23. Inventory Insights
    getInventoryInsights: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            const { branch_id } = req.query;

            const stockWhere = { organization_id };
            if (branch_id && branch_id !== 'all') stockWhere.branch_id = branch_id;

            // 1. Stock Aging & Valuation
            const stocks = await db.Stock.findAll({
                where: stockWhere,
                include: [
                    { model: db.Product, as: 'product', attributes: ['name'] },
                    { model: db.ProductVariant, as: 'variant', attributes: ['name', 'cost_price', 'price'] }
                ]
            });

            const now = new Date();
            const agingDistribution = {
                '0-30_days': 0,
                '31-60_days': 0,
                '61-90_days': 0,
                '90+_days': 0
            };

            let totalStockValue = 0;
            let totalPotentialRevenue = 0;

            stocks.forEach(s => {
                const ageInDays = Math.floor((now - new Date(s.updated_at)) / (1000 * 60 * 60 * 24));
                const qty = Number(s.quantity);
                const cost = Number(s.variant?.cost_price || 0);
                const price = Number(s.variant?.price || 0);

                totalStockValue += (qty * cost);
                totalPotentialRevenue += (qty * price);

                if (ageInDays <= 30) agingDistribution['0-30_days'] += (qty * cost);
                else if (ageInDays <= 60) agingDistribution['31-60_days'] += (qty * cost);
                else if (ageInDays <= 90) agingDistribution['61-90_days'] += (qty * cost);
                else agingDistribution['90+_days'] += (qty * cost);
            });

            // 2. Performance Metrics (Last 30 Days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const saleWhere = { 
                organization_id, 
                status: 'completed',
                created_at: { [Op.gte]: thirtyDaysAgo }
            };
            if (branch_id && branch_id !== 'all') saleWhere.branch_id = branch_id;

            const saleItems = await db.SaleItem.findAll({
                include: [
                    { 
                        model: db.Sale, 
                        as: 'sale', 
                        where: saleWhere,
                        attributes: []
                    },
                    { model: db.ProductVariant, as: 'variant', attributes: ['cost_price', 'name'] },
                    { model: db.Product, as: 'product', attributes: ['name', 'image'] }
                ]
            });

            const performanceByVariant = {};

            saleItems.forEach(item => {
                const vid = item.variant_id;
                if (!performanceByVariant[vid]) {
                    performanceByVariant[vid] = {
                        name: `${item.product?.name} (${item.variant?.name})`,
                        image: item.product?.image,
                        soldQty: 0,
                        revenue: 0,
                        cogs: 0,
                        profit: 0
                    };
                }
                const qty = Number(item.quantity);
                const revenue = Number(item.total_amount);
                const cogs = Number(item.variant?.cost_price || 0) * qty;

                performanceByVariant[vid].soldQty += qty;
                performanceByVariant[vid].revenue += revenue;
                performanceByVariant[vid].cogs += cogs;
                performanceByVariant[vid].profit += (revenue - cogs);
            });

            const topPerformers = Object.values(performanceByVariant)
                .map(p => ({
                    ...p,
                    roi: p.cogs > 0 ? (p.profit / p.cogs) * 100 : 0
                }))
                .sort((a, b) => b.profit - a.profit)
                .slice(0, 10);

            const monthlyCogs = Object.values(performanceByVariant).reduce((acc, p) => acc + p.cogs, 0);
            const inventoryTurnover = totalStockValue > 0 ? (monthlyCogs / totalStockValue) : 0;

            return successResponse(res, {
                summary: {
                    totalStockValue,
                    totalPotentialRevenue,
                    potentialProfit: totalPotentialRevenue - totalStockValue,
                    inventoryTurnover: inventoryTurnover.toFixed(2),
                    monthlyCogs
                },
                agingDistribution,
                topPerformers
            }, 'Stock reports fetched successfully');
        } catch (error) { next(error); }
    },

    // 25. Production Summary Report
    getProductionSummary: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id } = req.query;
            const organization_id = req.user.organization_id;

            const whereClause = { organization_id };
            if (branch_id && branch_id !== 'all') {
                whereClause.branch_id = branch_id;
            }

            if (start_date && end_date) {
                whereClause.end_date = {
                    [Op.between]: [
                        new Date(start_date + 'T00:00:00'),
                        new Date(end_date + 'T23:59:59')
                    ]
                };
            }

            const productionOrders = await db.ProductionOrder.findAll({
                where: { ...whereClause, status: 'completed' },
                include: [
                    { model: Product, as: 'product', attributes: ['name', 'code', 'image'] },
                    { model: ProductVariant, as: 'variant', attributes: ['name', 'sku'] },
                    { model: Branch, as: 'branch', attributes: ['name'] },
                    { 
                        model: db.ProductionOrderItem, 
                        as: 'items',
                        include: [{ model: Product, as: 'raw_material', attributes: ['name'] }]
                    }
                ],
                order: [['end_date', 'DESC']]
            });

            const summary = {
                totalBatches: productionOrders.length,
                totalProduced: productionOrders.reduce((sum, po) => sum + Number(po.quantity_produced), 0),
                totalPlanned: productionOrders.reduce((sum, po) => sum + Number(po.quantity_planned), 0),
                totalCost: productionOrders.reduce((sum, po) => sum + Number(po.total_cost), 0),
            };

            summary.efficiency = summary.totalPlanned > 0 ? (summary.totalProduced / summary.totalPlanned) * 100 : 0;

            return successResponse(res, {
                details: productionOrders,
                summary
            }, 'Production summary report fetched successfully');

        } catch (error) { next(error); }
    },

    getRawMaterialUsage: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id } = req.query;
            const organization_id = req.user.organization_id;

            const whereClause = {
                organization_id,
            };

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

            const usage = await db.ProductionRawMaterial.findAll({
                where: whereClause,
                attributes: [
                    'raw_material_id',
                    'raw_material_variant_id',
                    [Sequelize.fn('SUM', Sequelize.col('quantity_used')), 'total_consumed'],
                    [Sequelize.fn('SUM', Sequelize.col('total_cost')), 'total_cost'],
                ],
                include: [
                    { model: db.Product, as: 'raw_material', attributes: ['name', 'code'] },
                    { model: db.ProductVariant, as: 'raw_material_variant', attributes: ['name'] }
                ],
                group: ['raw_material_id', 'raw_material_variant_id', 'raw_material.id', 'raw_material_variant.id'],
                order: [[Sequelize.literal('total_consumed'), 'DESC']]
            });

            return successResponse(res, usage, 'Raw material usage report fetched');
        } catch (error) {
            next(error);
        }
    },

    getDistributionReport: async (req, res, next) => {
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
                    { 
                        model: db.Distributor, 
                        as: 'distributor', 
                        required: true,
                        attributes: ['name', 'phone'] 
                    },
                    { model: db.Branch, as: 'branch', attributes: ['name'] }
                ],
                order: [['created_at', 'DESC']]
            });

            const summary = {
                totalDistributed: sales.reduce((sum, s) => sum + Number(s.payable_amount), 0),
                totalShipments: sales.length,
                uniqueDistributors: new Set(sales.map(s => s.distributor_id)).size
            };

            return successResponse(res, { summary, transactions: sales }, 'Distribution report fetched successfully');
        } catch (error) {
            next(error);
        }
    },

    // 26. Advanced Stock Transactions (Image 1)
    getStockTransactions: async (req, res, next) => {
        try {
            const { 
                start_date, end_date, 
                product_id, brand_id, main_category_id, 
                user_id, transaction_type 
            } = req.query;
            const organization_id = req.user.organization_id;

            const where = { organization_id };
            if (start_date && end_date) {
                where.created_at = { [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')] };
            }
            if (product_id && product_id !== 'all') where.product_id = product_id;
            if (user_id && user_id !== 'all') where.user_id = user_id;
            if (transaction_type && transaction_type !== 'all') where.type = transaction_type;

            const productWhere = {};
            if (brand_id && brand_id !== 'all') productWhere.brand_id = brand_id;
            if (main_category_id && main_category_id !== 'all') productWhere.main_category_id = main_category_id;

            const adjustments = await db.StockAdjustment.findAll({
                where,
                include: [
                    { 
                        model: db.Product, as: 'product', 
                        where: Object.keys(productWhere).length > 0 ? productWhere : undefined,
                        attributes: ['name', 'code', 'brand_id', 'main_category_id'],
                        include: [
                            { model: db.Brand, as: 'brand', attributes: ['name'] },
                            { model: db.MainCategory, as: 'main_category', attributes: ['name'] }
                        ]
                    },
                    { model: db.ProductVariant, as: 'variant', attributes: ['name', 'sku', 'price', 'cost_price'] },
                    { model: db.User, as: 'adjusted_by_user', attributes: ['name'] },
                    { model: db.Branch, as: 'branch', attributes: ['name'] }
                ],
                order: [['created_at', 'DESC']]
            });

            const result = adjustments.map(adj => ({
                id: adj.id,
                date: adj.created_at,
                item_code: adj.variant?.sku || adj.product?.code,
                item_name: adj.product?.name + (adj.variant?.name ? ` (${adj.variant.name})` : ''),
                sale_price: Number(adj.variant?.price || 0),
                cost_price: Number(adj.variant?.cost_price || 0),
                quantity: Number(adj.quantity),
                type: adj.type,
                reason: adj.reason,
                user: adj.adjusted_by_user?.name,
                branch: adj.branch?.name,
                category: adj.product?.main_category?.name,
                brand: adj.product?.brand?.name,
                batch_number: adj.batch_number // If available
            }));

            return successResponse(res, result, 'Stock transactions fetched successfully');
        } catch (error) { next(error); }
    },

    // 27. Advanced Stock Report — Summary / Batches / Expire
    getAdvancedStockReport: async (req, res, next) => {
        try {
            const {
                report_type = 'summary',   // 'summary' | 'batches' | 'expire'
                start_date, end_date,
                product_id, supplier_id, main_category_id, brand_id,
                stock_from, stock_to,
                batch_number
            } = req.query;
            const organization_id = req.user.organization_id;

            // ── Product-level filters (always scoped to this org) ──────────────
            const productWhere = { organization_id };
            if (product_id        && product_id        !== 'all') productWhere.id               = product_id;
            if (brand_id          && brand_id          !== 'all') productWhere.brand_id          = brand_id;
            if (main_category_id  && main_category_id  !== 'all') productWhere.main_category_id  = main_category_id;
            if (supplier_id       && supplier_id       !== 'all') productWhere.supplier_id       = supplier_id;

            // Shared product include — required:true = INNER JOIN so filters apply
            const productInclude = {
                model: db.Product, as: 'product',
                where: productWhere,
                required: true,
                attributes: ['id', 'name', 'code'],
                include: [
                    { model: db.Brand,        as: 'brand',         attributes: ['name'], required: false },
                    { model: db.MainCategory, as: 'main_category', attributes: ['name'], required: false },
                    { model: db.Supplier,     as: 'supplier',      attributes: ['name'], required: false }
                ]
            };

            const sfNum = parseFloat(stock_from);
            const stNum = parseFloat(stock_to);

            // ── BATCHES / EXPIRE ───────────────────────────────────────────────
            if (report_type === 'batches' || report_type === 'expire') {
                const batchWhere = { organization_id };

                if (report_type === 'expire') {
                    if (start_date && end_date) {
                        batchWhere.expiry_date = {
                            [Op.between]: [
                                new Date(start_date + 'T00:00:00'),
                                new Date(end_date   + 'T23:59:59')
                            ]
                        };
                    } else {
                        // Default: show items expiring within the next 90 days (+ already expired)
                        const ninetyDaysOut = new Date();
                        ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);
                        ninetyDaysOut.setHours(23, 59, 59, 999);
                        batchWhere.expiry_date = { [Op.lte]: ninetyDaysOut };
                    }
                }

                if (!isNaN(sfNum) && !isNaN(stNum)) {
                    batchWhere.quantity = { [Op.between]: [sfNum, stNum] };
                }

                if (batch_number) {
                    batchWhere.batch_number = { [Op.like]: `%${batch_number}%` };
                }

                const batches = await db.ProductBatch.findAll({
                    where: batchWhere,
                    include: [
                        productInclude,
                        {
                            model: db.ProductVariant, as: 'variant',
                            attributes: ['name', 'sku', 'price', 'cost_price'],
                            required: false
                        },
                        {
                            model: db.Branch, as: 'branch',
                            attributes: ['name'],
                            required: false
                        }
                    ],
                    order: report_type === 'expire'
                        ? [['expiry_date', 'ASC']]
                        : [['created_at', 'DESC']]
                });

                const result = batches.map(b => {
                    const salePrice = Number(b.selling_price  || b.variant?.price      || 0);
                    const costPrice = Number(b.cost_price     || b.variant?.cost_price || 0);
                    const qty       = Number(b.quantity       || 0);
                    return {
                        id:          b.id,
                        item_code:   b.variant?.sku    || b.product?.code  || null,
                        item_name:   (b.product?.name  || '') + (b.variant?.name ? ` (${b.variant.name})` : ''),
                        sale_price:  salePrice,
                        cost_price:  costPrice,
                        quantity:    qty,
                        batch_no:    b.batch_number    || null,
                        expiry_date: b.expiry_date     || null,
                        supplier:    b.product?.supplier?.name      || null,
                        category:    b.product?.main_category?.name || null,
                        brand:       b.product?.brand?.name         || null,
                        branch:      b.branch?.name                 || null,
                        total_value: qty * salePrice,
                        net_value:   qty * costPrice
                    };
                });

                return successResponse(res, result, `Stock ${report_type} report fetched successfully`);
            }

            // ── SUMMARY (current stock levels) ────────────────────────────────
            const stockWhere = { organization_id };
            if (!isNaN(sfNum) && !isNaN(stNum)) {
                stockWhere.quantity = { [Op.between]: [sfNum, stNum] };
            }

            const stocks = await db.Stock.findAll({
                where: stockWhere,
                include: [
                    productInclude,
                    {
                        model: db.ProductVariant, as: 'variant',
                        attributes: ['name', 'sku', 'price', 'cost_price'],
                        required: false
                    },
                    {
                        model: db.Branch, as: 'branch',
                        attributes: ['name'],
                        required: false
                    }
                ],
                order: [['updated_at', 'DESC']]
            });

            const result = stocks.map(s => {
                const salePrice = Number(s.variant?.price      || 0);
                const costPrice = Number(s.variant?.cost_price || 0);
                const qty       = Number(s.quantity            || 0);
                return {
                    id:          s.id,
                    item_code:   s.variant?.sku   || s.product?.code  || null,
                    item_name:   (s.product?.name || '') + (s.variant?.name ? ` (${s.variant.name})` : ''),
                    sale_price:  salePrice,
                    cost_price:  costPrice,
                    quantity:    qty,
                    batch_no:    null,
                    expiry_date: null,
                    supplier:    s.product?.supplier?.name      || null,
                    category:    s.product?.main_category?.name || null,
                    brand:       s.product?.brand?.name         || null,
                    branch:      s.branch?.name                 || null,
                    total_value: qty * salePrice,
                    net_value:   qty * costPrice
                };
            });

            return successResponse(res, result, 'Stock summary report fetched successfully');

        } catch (error) { next(error); }
    },


    // 28. Advanced Sales Report (Image 3)
    getAdvancedSalesReport: async (req, res, next) => {
        try {
            const { 
                report_type, // 'summary', 'items', 'refund', 'cancel', 'invoices', 'invoices-cancel'
                start_date, end_date,
                product_id, supplier_id, brand_id, customer_id, main_category_id, user_id,
                payment_cash, payment_card, payment_credit,
                invoice_from, invoice_to
            } = req.query;
            const organization_id = req.user.organization_id;

            const saleWhere = { organization_id };
            if (start_date && end_date) {
                saleWhere.created_at = { [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')] };
            }
            if (customer_id && customer_id !== 'all') saleWhere.customer_id = customer_id;
            if (user_id && user_id !== 'all') saleWhere.user_id = user_id;
            
            // Status based on report_type
            if (report_type === 'refund') saleWhere.status = 'refunded';
            else if (report_type === 'cancel') saleWhere.status = 'cancelled';
            else saleWhere.status = 'completed';

            // Payment Types
            const paymentMethods = [];
            if (payment_cash === 'true') paymentMethods.push('Cash');
            if (payment_card === 'true') paymentMethods.push('Card');
            if (payment_credit === 'true') saleWhere.payment_status = { [Op.in]: ['unpaid', 'partially_paid'] };

            const productWhere = {};
            if (product_id && product_id !== 'all') productWhere.id = product_id;
            if (brand_id && brand_id !== 'all') productWhere.brand_id = brand_id;
            if (main_category_id && main_category_id !== 'all') productWhere.main_category_id = main_category_id;
            if (supplier_id && supplier_id !== 'all') productWhere.supplier_id = supplier_id;

            if (report_type === 'items' || report_type === 'summary') {
                const saleItems = await db.SaleItem.findAll({
                    include: [
                        { 
                            model: db.Sale, as: 'sale', 
                            where: saleWhere,
                            include: [
                                { model: db.Customer, as: 'customer', attributes: ['name'] },
                                { model: db.User, as: 'cashier', attributes: ['name'] },
                                { model: db.SalePayment, as: 'payments' }
                            ]
                        },
                        { 
                            model: db.Product, as: 'product', 
                            where: Object.keys(productWhere).length > 0 ? productWhere : undefined,
                            include: [
                                { model: db.Brand, as: 'brand', attributes: ['name'] },
                                { model: db.MainCategory, as: 'main_category', attributes: ['name'] },
                                { model: db.Supplier, as: 'supplier', attributes: ['name'] }
                            ]
                        },
                        { model: db.ProductVariant, as: 'variant', attributes: ['name', 'sku', 'cost_price'] }
                    ]
                });

                const result = saleItems.map(item => ({
                    id: item.id,
                    invoice_no: item.sale?.invoice_number,
                    date: item.sale?.created_at,
                    item_code: item.variant?.sku || item.product?.code,
                    item_name: item.product?.name + (item.variant?.name ? ` (${item.variant.name})` : ''),
                    unit_price: Number(item.unit_price),
                    quantity: Number(item.quantity),
                    discount: Number(item.discount_amount || 0),
                    total: Number(item.total_amount),
                    cost_price: Number(item.variant?.cost_price || 0),
                    category: item.product?.main_category?.name,
                    brand: item.product?.brand?.name,
                    supplier: item.product?.supplier?.name,
                    customer: item.sale?.customer?.name || 'Walk-in',
                    cashier: item.sale?.cashier?.name,
                    netsale: Number(item.total_amount) // Simplification
                }));

                return successResponse(res, result, 'Advanced sales report (items) fetched');
            } else {
                // Invoice level
                const sales = await db.Sale.findAll({
                    where: saleWhere,
                    include: [
                        { model: db.Customer, as: 'customer', attributes: ['name'] },
                        { model: db.User, as: 'cashier', attributes: ['name'] },
                        { model: db.SalePayment, as: 'payments' }
                    ]
                });

                const result = sales.map(s => ({
                    id: s.id,
                    invoice_no: s.invoice_number,
                    date: s.created_at,
                    customer: s.customer?.name || 'Walk-in',
                    total: Number(s.payable_amount),
                    discount: Number(s.discount_amount),
                    cashier: s.cashier?.name,
                    payment_status: s.payment_status,
                    paid_amount: Number(s.paid_amount)
                }));

                return successResponse(res, result, 'Advanced sales report (invoices) fetched');
            }
        } catch (error) { next(error); }
    },
    // 29. Batch-wise Daily Sales Audit
    getBatchWiseSalesReport: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id, supplier_id, category_id } = req.query;
            const organization_id = req.user.organization_id;

            const saleWhere = { organization_id, status: 'completed' };
            if (start_date && end_date) {
                saleWhere.created_at = { [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')] };
            }

            const itemInclude = [
                {
                    model: db.Sale, as: 'sale',
                    where: saleWhere,
                    attributes: ['created_at', 'invoice_number'],
                    include: [{ model: db.Branch, as: 'branch', attributes: ['name'] }]
                },
                {
                    model: db.Product, as: 'product',
                    attributes: ['name', 'code'],
                    include: [
                        { model: db.MainCategory, as: 'main_category', attributes: ['name'] },
                        { model: db.Supplier, as: 'supplier', attributes: ['name'] }
                    ]
                },
                { model: db.ProductVariant, as: 'variant', attributes: ['name', 'sku'] },
                { model: db.ProductBatch, as: 'batch', attributes: ['batch_number', 'cost_price', 'selling_price'] }
            ];

            // Apply additional filters if needed
            if (branch_id && branch_id !== 'all') saleWhere.branch_id = branch_id;
            
            const productWhere = {};
            if (category_id && category_id !== 'all') productWhere.main_category_id = category_id;
            if (supplier_id && supplier_id !== 'all') productWhere.supplier_id = supplier_id;
            
            if (Object.keys(productWhere).length > 0) {
                itemInclude[1].where = productWhere;
            }

            const saleItems = await db.SaleItem.findAll({
                include: itemInclude,
                order: [[{ model: db.Sale, as: 'sale' }, 'created_at', 'DESC']]
            });

            const groupedResult = [];
            const groupMap = new Map();

            for (const item of saleItems) {
                const invoiceNum = item.sale?.invoice_number || 'N/A';
                const batchNum = item.batch?.batch_number || 'N/A';
                const key = `${invoiceNum}_${batchNum}`;

                const qty = parseFloat(item.quantity);
                const cost = parseFloat(item.batch?.cost_price || item.variant?.cost_price || 0);
                const totalSale = parseFloat(item.total_amount);
                const totalCost = qty * cost;

                if (!groupMap.has(key)) {
                    const g = {
                        id: item.id,
                        date: item.sale?.created_at,
                        invoice: invoiceNum,
                        branch: item.sale?.branch?.name,
                        products: new Set(),
                        categories: new Set(),
                        suppliers: new Set(),
                        batch: batchNum,
                        quantity: 0,
                        total_cost: 0,
                        total_sale: 0,
                        profit: 0
                    };
                    groupMap.set(key, g);
                    groupedResult.push(g);
                }

                const g = groupMap.get(key);
                if (item.product?.name) g.products.add(item.product.name);
                if (item.product?.main_category?.name) g.categories.add(item.product.main_category.name);
                if (item.product?.supplier?.name) g.suppliers.add(item.product.supplier.name);
                
                g.quantity += qty;
                g.total_cost += totalCost;
                g.total_sale += totalSale;
                g.profit += (totalSale - totalCost);
            }

            const result = groupedResult.map(g => {
                const productsArr = Array.from(g.products);
                return {
                    ...g,
                    product: productsArr.length > 2 ? `${productsArr.slice(0, 2).join(', ')} (+${productsArr.length - 2})` : productsArr.join(', '),
                    variant: productsArr.length > 1 ? 'Multiple Products' : 'Standard',
                    sku: productsArr.length > 1 ? 'Multiple' : 'N/A',
                    category: Array.from(g.categories).join(', '),
                    supplier: Array.from(g.suppliers).join(', '),
                    unit_cost: g.quantity > 0 ? g.total_cost / g.quantity : 0,
                    unit_price: g.quantity > 0 ? g.total_sale / g.quantity : 0
                };
            });

            return successResponse(res, result, 'Batch-wise sales audit fetched');
        } catch (error) { next(error); }
    },
    getUniqueBatches: async (req, res, next) => {
        try {
            const batches = await db.ProductBatch.findAll({
                where: { organization_id: req.user.organization_id },
                attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('batch_number')), 'batch_number']],
                order: [['batch_number', 'ASC']],
                raw: true
            });

            return res.status(200).json({
                status: 'success',
                data: batches.map(b => b.batch_number)
            });
        } catch (error) { next(error); }
    },
    getPurchaseHistoryReport: async (req, res, next) => {
        try {
            const { start_date, end_date, branch_id, supplier_id, status, search, page = 1, limit = 10 } = req.query;
            const organization_id = req.user.organization_id;

            const whereClause = { organization_id };

            if (branch_id && branch_id !== 'all') {
                whereClause.branch_id = branch_id;
            }

            if (supplier_id && supplier_id !== 'all') {
                whereClause.supplier_id = supplier_id;
            }

            if (status && status !== 'all') {
                whereClause.status = status;
            }

            if (start_date && end_date) {
                whereClause.order_date = {
                    [Op.between]: [
                        new Date(start_date + 'T00:00:00'),
                        new Date(end_date + 'T23:59:59')
                    ]
                };
            }

            if (search) {
                whereClause.po_number = { [Op.like]: `%${search}%` };
            }

            const { count, rows: purchaseOrders } = await PurchaseOrder.findAndCountAll({
                where: whereClause,
                include: [
                    { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'phone', 'email', 'code', 'address'] },
                    { model: Branch, as: 'branch', attributes: ['name'] },
                    { model: User, as: 'created_by_user', attributes: ['name'] },
                    {
                        model: db.PurchaseOrderItem,
                        as: 'items',
                        include: [
                            { model: Product, as: 'product', attributes: ['name', 'code'] },
                            { model: ProductVariant, as: 'variant', attributes: ['name', 'sku'] }
                        ]
                    }
                ],
                order: [['order_date', 'DESC']],
                limit: Number(limit),
                offset: (Number(page) - 1) * Number(limit)
            });

            const allMatchingPOs = await PurchaseOrder.findAll({
                where: whereClause,
                attributes: ['total_amount', 'status']
            });

            const stats = {
                totalPurchases: allMatchingPOs.reduce((sum, po) => sum + Number(po.total_amount || 0), 0),
                totalOrdersCount: allMatchingPOs.length,
                statusBreakdown: allMatchingPOs.reduce((acc, po) => {
                    acc[po.status] = (acc[po.status] || 0) + 1;
                    return acc;
                }, {})
            };

            return successResponse(res, {
                data: purchaseOrders,
                stats,
                pagination: {
                    total: count,
                    page: Number(page),
                    limit: Number(limit),
                    totalPages: Math.ceil(count / limit)
                }
            }, 'Purchase history report fetched successfully');

        } catch (error) {
            next(error);
        }
    }
};

module.exports = reportController;
