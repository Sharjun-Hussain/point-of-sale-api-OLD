const db = require('../models');
const { Sale, SaleItem, SalePayment, Product, ProductVariant, Stock, ProductBatch, Transaction, Account, Customer, Branch, User, SaleEmployee, Cheque } = db;
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const auditService = require('../services/auditService');
const accountingService = require('../services/accountingService');
const { checkLowStockAlert, checkHighSalesAlert } = require('../utils/alertManager');
const { Sequelize, Op } = require('sequelize');

/**
 * Get All Sales
 */
const getAllSales = async (req, res, next) => {
    try {
        const { page, size, status, customer_id, branch_id } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = { organization_id: req.user.organization_id };
        if (status) where.status = status;
        if (customer_id) where.customer_id = customer_id;
        if (branch_id) where.branch_id = branch_id;

        const sales = await Sale.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                { model: Customer, as: 'customer', attributes: ['name', 'phone'] },
                { model: Branch, as: 'branch', attributes: ['name'] },
                { model: User, as: 'cashier', attributes: ['name'] },
                { model: User, as: 'sellers', attributes: ['name', 'id'], through: { attributes: [] } },
                {
                    model: SaleItem,
                    as: 'items',
                    include: [
                        { model: Product, as: 'product', attributes: ['name', 'image'] },
                        { model: ProductVariant, as: 'variant', attributes: ['name', 'image'] }
                    ]
                },
                { model: SalePayment, as: 'payments' }
            ],
            distinct: true, // Important for correct count with includes
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, sales.rows, {
            total: sales.count,
            page: parseInt(page) || 1,
            limit
        }, 'Sales fetched successfully');
    } catch (error) { next(error); }
};

/**
 * Get Sale By ID
 */
const getSaleById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const sale = await Sale.findOne({
            where: { id, organization_id: req.user.organization_id },
            include: [
                { model: Customer, as: 'customer' },
                { model: Branch, as: 'branch' },
                { model: User, as: 'cashier' },
                {
                    model: User,
                    as: 'sellers',
                    attributes: ['id', 'name', 'email', 'profile_image'],
                    through: { attributes: ['contribution_percentage'] }
                },
                {
                    model: SaleItem,
                    as: 'items',
                    include: [
                        { model: Product, as: 'product', attributes: ['name', 'code'] },
                        { model: ProductVariant, as: 'variant', attributes: ['name', 'sku'] }
                    ]
                },
                { model: SalePayment, as: 'payments' }
            ]
        });

        if (!sale) return errorResponse(res, 'Sale not found', 404);
        return successResponse(res, sale, 'Sale fetched successfully');
    } catch (error) { next(error); }
};

/**
 * Create Sale
 */
const createSale = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const {
            customer_id,
            branch_id: payload_branch_id,
            items, // Array of { product_id, product_variant_id, quantity, discount_amount }
            payments, // Array of { payment_method, amount, transaction_reference, notes }
            payment_method: legacy_method,
            paid_amount: legacy_paid_amount,
            notes,
            adjustment,
            status: payload_status,
            seller_ids,
            cheque_details,
            is_wholesale: payload_is_wholesale,
            shift_id
        } = req.body;

        const organization_id = req.user.organization_id;
        let branch_id = payload_branch_id || req.user.branch_id;

        // If branch_id is still missing, try to get it from assigned branches
        if (!branch_id && req.user.branches && req.user.branches.length > 0) {
            branch_id = req.user.branches[0].id;
        }

        if (!branch_id) {
            await t.rollback();
            return errorResponse(res, 'Branch ID is required but could not be determined for this user', 400);
        }

        const user_id = req.user.id;

        if (!items || items.length === 0) {
            await t.rollback();
            return errorResponse(res, 'No items provided', 400);
        }

        // --- 1. PREPARE & RECALCULATE TOTALS (Security Fix) ---
        // Fetch tax rate from settings
        const taxSetting = await db.Setting.findOne({
            where: { organization_id, category: 'general' },
            transaction: t
        });
        const rawTaxRate = taxSetting?.settings_data?.finance?.taxRate;
        const taxRate = (rawTaxRate !== undefined && rawTaxRate !== null && rawTaxRate !== '') ? parseFloat(rawTaxRate) / 100 : 0;

        let calculated_total_amount = 0;
        let calculated_total_discount = 0;
        let calculated_total_tax = 0;
        const processedItems = [];

        // Fetch all products/variants involved
        for (const item of items) {
            const { product_id, product_variant_id, quantity, discount_amount: claimed_discount } = item;

            if (!product_id || !quantity) continue;

            const product = await Product.findOne({ 
                where: { id: product_id, organization_id }, 
                transaction: t 
            });
            if (!product) {
                await t.rollback();
                return errorResponse(res, `Product not found: ${product_id}`, 400);
            }

            let unit_price = 0;
            const is_wholesale = payload_is_wholesale === true || payload_is_wholesale === 1 || payload_is_wholesale === 'true';

            if (product_variant_id) {
                const variant = await ProductVariant.findOne({ 
                    where: { id: product_variant_id, product_id, organization_id }, 
                    transaction: t 
                });
                if (!variant) {
                    await t.rollback();
                    return errorResponse(res, `Variant not found: ${product_variant_id}`, 400);
                }
                unit_price = parseFloat((is_wholesale ? variant.wholesale_price : variant.price) || 0);
            } else {
                unit_price = parseFloat((is_wholesale ? product.wholesale_price : product.price) || 0);
            }

            // Calculate Item Totals
            const gross_amount = unit_price * quantity;
            const item_discount = parseFloat(claimed_discount || 0);
            // Note: In strict mode, we should validate discount limits here.

            const taxable_amount = gross_amount - item_discount;
            const item_tax = taxable_amount * taxRate; // Dynamic tax rate from settings

            calculated_total_amount += gross_amount;
            calculated_total_discount += item_discount;
            calculated_total_tax += item_tax;

            processedItems.push({
                product_id,
                product_variant_id,
                quantity,
                unit_price,
                discount_amount: item_discount,
                tax_amount: item_tax,
                total_amount: taxable_amount + item_tax // Net for this line
            });
        }

        // Finalize Headers
        const final_total_amount = calculated_total_amount; // Gross
        const final_discount_amount = calculated_total_discount;
        const final_tax_amount = calculated_total_tax;

        let final_payable_amount = (final_total_amount - final_discount_amount) + final_tax_amount;

        // Apply global adjustment if any
        const safe_adjustment = parseFloat(adjustment || 0);
        final_payable_amount += safe_adjustment;

        // --- 2. VALIDATE PAYMENTS (Split Payments Integration) ---
        let processedPayments = [];
        let total_paid = 0;

        if (payments && Array.isArray(payments) && payments.length > 0) {
            processedPayments = payments.map(p => ({
                payment_method: p.payment_method || 'cash',
                amount: parseFloat(p.amount || 0),
                transaction_reference: p.transaction_reference || null,
                notes: p.notes || null
            }));
            total_paid = processedPayments.reduce((sum, p) => sum + p.amount, 0);
        } else if (legacy_method || legacy_paid_amount) {
            // Backward compatibility
            const amount = parseFloat(legacy_paid_amount || 0);
            processedPayments = [{
                payment_method: legacy_method || 'cash',
                amount: amount,
                transaction_reference: null,
                notes: null
            }];
            total_paid = amount;
        }

        // Rule: Guest/Walk-in must pay in full (SKIP for drafts)
        if (payload_status !== 'draft' && !customer_id && total_paid < final_payable_amount) {
            if ((final_payable_amount - total_paid) > 1.0) {
                await t.rollback();
                return errorResponse(res, 'Walk-in (Guest) customers must pay in full.', 400);
            }
        }

        // Determine Status
        let payment_status = 'unpaid';
        if (total_paid >= final_payable_amount) {
            payment_status = 'paid';
        } else if (total_paid > 0) {
            payment_status = 'partially_paid';
        }

        // --- 3. GENERATE INVOICE NUMBER ---
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const random = Math.floor(1000 + Math.random() * 9000); // Consider sequence later
        const invoice_number = `INV-${year}${month}${day}-${random}`;

        // --- 4. CREATE SALE RECORD ---
        const sale = await Sale.create({
            organization_id,
            branch_id,
            customer_id: customer_id || null,
            user_id,
            invoice_number,
            total_amount: final_total_amount,
            discount_amount: final_discount_amount,
            tax_amount: final_tax_amount,
            payable_amount: final_payable_amount,
            paid_amount: total_paid,
            payment_status,
            payment_method: processedPayments.length === 1 ? processedPayments[0].payment_method : 'split',
            status: payload_status || 'completed',
            notes,
            is_wholesale: !!payload_is_wholesale,
            shift_id: shift_id || null
        }, { transaction: t });

        // --- 5. CREATE ITEMS & PAYMENTS ---
        for (const pItem of processedItems) {
            await SaleItem.create({
                sale_id: sale.id,
                ...pItem
            }, { transaction: t });
        }

        for (const pmt of processedPayments) {
            await SalePayment.create({
                sale_id: sale.id,
                organization_id,
                ...pmt
            }, { transaction: t });
        }

        // --- 6. HANDLE CHEQUE (Legacy Logic - ideally moved to Payment loops) ---
        if (processedPayments.some(p => p.payment_method === 'cheque') && cheque_details) {
            const { bank_name, cheque_number, cheque_date, payee_payor_name } = cheque_details;
            const chequePayment = processedPayments.find(p => p.payment_method === 'cheque');
            await Cheque.create({
                organization_id,
                branch_id,
                type: 'receivable',
                bank_name,
                cheque_number,
                cheque_date,
                amount: chequePayment.amount,
                received_issued_date: new Date(),
                status: 'pending',
                payee_payor_name: payee_payor_name || (sale.customer_id ? (await Customer.findOne({ where: { id: sale.customer_id, organization_id }, transaction: t })).name : 'Guest'),
                reference_type: 'sale',
                reference_id: sale.id
            }, { transaction: t });
        }

        // --- 7. HANDLE SELLERS ---
        if (seller_ids && Array.isArray(seller_ids) && seller_ids.length > 0) {
            for (const seller_id of seller_ids) {
                await SaleEmployee.create({
                    sale_id: sale.id,
                    user_id: seller_id,
                    contribution_percentage: 100
                }, { transaction: t });
            }
        } else {
            await SaleEmployee.create({
                sale_id: sale.id,
                user_id: req.user.id,
                contribution_percentage: 100
            }, { transaction: t });
        }

        // --- 8. STOCK & BATCH UPDATE ---
        if (sale.status === 'completed') {
            // Group items to handle duplicates and prevent race conditions within the same sale
            const stockUpdates = processedItems.reduce((acc, current) => {
                const key = `${current.product_id}_${current.product_variant_id || 'null'}`;
                if (!acc[key]) {
                    acc[key] = { ...current };
                } else {
                    acc[key].quantity += current.quantity;
                }
                return acc;
            }, {});

            for (const key in stockUpdates) {
                const pItem = stockUpdates[key];
                
                // A. Update Global Stock (Atomic)
                const stockWhere = { 
                    branch_id, 
                    product_id: pItem.product_id,
                    product_variant_id: pItem.product_variant_id || null
                };

                const [stock, created] = await Stock.findOrCreate({
                    where: stockWhere,
                    defaults: { 
                        ...stockWhere, 
                        organization_id, 
                        quantity: 0 
                    },
                    transaction: t
                });

                await stock.decrement('quantity', { by: pItem.quantity, transaction: t });

                // B. Update Batches (FIFO - First Expiring First Out)
                // Fetch batches with quantity > 0, ordered by expiry (asc) or creation (asc)
                const batches = await ProductBatch.findAll({
                    where: {
                        organization_id,
                        branch_id,
                        product_id: pItem.product_id,
                        product_variant_id: pItem.product_variant_id || null,
                        quantity: { [Op.gt]: 0 }
                    },
                    order: [
                        ['expiry_date', 'ASC'], // Nulls might come last or first depending on DB, usually we want earliest expiry
                        ['created_at', 'ASC']   // Fallback to FIFO
                    ],
                    transaction: t
                });

                let qtyToDeduct = parseFloat(pItem.quantity);

                for (const batch of batches) {
                    if (qtyToDeduct <= 0) break;

                    const available = parseFloat(batch.quantity);
                    const deduction = Math.min(available, qtyToDeduct);

                    await batch.decrement('quantity', { by: deduction, transaction: t });
                    qtyToDeduct -= deduction;
                }

                // Note: If qtyToDeduct > 0 here, it means we sold more than we have in batches.
                // We allow this to happen (Global Stock goes negative) without blocking the sale,
                // as cleaning up messy batch data is separate from blocking operations.
            }
        }

        // --- 9. ACCOUNTING & LEDGER (Consistency Fix via AccountingService) ---
        if (sale.status === 'completed') {
            // Find Accounts
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

            const [revenueAccount] = await Account.findOrCreate({
                where: { organization_id, code: '4000' },
                defaults: { name: 'Sales Revenue', type: 'revenue' },
                transaction: t
            });

            const [chequesInHandAccount] = await Account.findOrCreate({
                where: { organization_id, code: '1050' },
                defaults: { name: 'Cheques in Hand', type: 'asset' },
                transaction: t
            });

            // A. Credit Revenue (Increase Revenue)
            await accountingService.recordTransaction({
                organization_id,
                branch_id,
                account_id: revenueAccount.id,
                customer_id: customer_id || null,
                amount: final_payable_amount,
                type: 'credit',
                reference_type: 'Sale',
                reference_id: sale.id,
                transaction_date: date,
                description: `Sales Revenue from Invoice ${invoice_number}`
            }, t);

            // B. Debit Payments (Multi-method support) -> Increase Asset
            for (const pmt of processedPayments) {
                if (pmt.amount <= 0) continue;

                // Map payment methods to accounts
                let accountCode = '1000'; // Default Cash
                let accountName = 'Cash';

                if (pmt.payment_method === 'bank_transfer' || pmt.payment_method === 'card') {
                    accountCode = '1010';
                    accountName = 'Bank/Card';
                } else if (pmt.payment_method === 'cheque') {
                    accountCode = '1050';
                    accountName = 'Cheques in Hand';
                }

                const [pmtAccount] = await Account.findOrCreate({
                    where: { organization_id, code: accountCode },
                    defaults: { name: accountName, type: 'asset' },
                    transaction: t
                });

                await accountingService.recordTransaction({
                    organization_id,
                    branch_id,
                    account_id: pmtAccount.id,
                    customer_id: customer_id || null,
                    amount: pmt.amount,
                    type: 'debit',
                    reference_type: 'Sale',
                    reference_id: sale.id,
                    transaction_date: date,
                    description: `${pmt.payment_method.toUpperCase()} payment for Invoice ${invoice_number}`
                }, t);
            }

            // C. Debit AR (Remaining) -> Increase Asset
            const remaining = final_payable_amount - total_paid;
            if (remaining > 0 && customer_id) {
                await accountingService.recordTransaction({
                    organization_id,
                    branch_id,
                    account_id: arAccount.id,
                    customer_id: customer_id,
                    amount: remaining,
                    type: 'debit',
                    reference_type: 'Sale',
                    reference_id: sale.id,
                    transaction_date: date,
                    description: `Accounts Receivable for Invoice ${invoice_number}`
                }, t);
            }
        }

        await t.commit();

        // 7. Fetch full sale with details for response
        const createdSale = await Sale.findOne({
            where: { id: sale.id, organization_id },
            include: [
                { model: User, as: 'sellers', attributes: ['id', 'name', 'email'] },
                { model: User, as: 'cashier', attributes: ['id', 'name'] },
                { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
                {
                    model: SaleItem,
                    as: 'items',
                    include: [
                        { model: Product, as: 'product', attributes: ['name', 'image'] },
                        { model: ProductVariant, as: 'variant', attributes: ['name', 'image'] }
                    ]
                }
            ]
        });

        // Log sale creation
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            req.user.organization_id,
            req.user.id,
            'Sale',
            sale.id,
            {
                invoice_number: sale.invoice_number,
                status: sale.status,
                total_amount: sale.total_amount,
                payable_amount: sale.payable_amount,
                paid_amount: sale.paid_amount,
                payment_method: sale.payment_method,
                payments: processedPayments,
                items_count: items.length,
                sellers: seller_ids || [req.user.id]
            },
            ipAddress,
            userAgent,
            {
                customer_id,
                branch_id: sale.branch_id
            }
        );

        // --- 10. TRIGGER ALERTS ---
        if (sale.status === 'completed') {
            // High Sales Alert
            checkHighSalesAlert(createdSale).catch(err => console.error('[ALERTS] High sales trigger failed:', err));
            
            // Low Stock Alerts (per item)
            for (const pItem of processedItems) {
                const stockWhere = { organization_id, branch_id, product_id: pItem.product_id };
                stockWhere.product_variant_id = pItem.product_variant_id || null;
                
                // Fetch current stock after decrement
                Stock.findOne({ where: stockWhere }).then(stock => {
                    if (stock) {
                        checkLowStockAlert(organization_id, branch_id, pItem.product_id, pItem.product_variant_id, stock.quantity);
                    }
                }).catch(err => console.error('[ALERTS] Low stock check failed:', err));
            }
        }

        return successResponse(res, createdSale, 'Sale created successfully', 201);

    } catch (error) {
        await t.rollback();
        next(error);
    }
};

/**
 * Delete Sale
 */
const deleteSale = async (req, res, next) => {
    try {
        const { id } = req.params;
        const sale = await Sale.findOne({
            where: { id, organization_id: req.user.organization_id }
        });

        if (!sale) return errorResponse(res, 'Sale not found', 404);

        // Optional: Only allow deleting drafts?
        // if (sale.status !== 'draft') return errorResponse(res, 'Only draft sales can be deleted', 400);

        // Log sale deletion
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logDelete(
            req.user.organization_id,
            req.user.id,
            'Sale',
            sale.id,
            {
                invoice_number: sale.invoice_number,
                status: sale.status,
                total_amount: sale.total_amount,
                payable_amount: sale.payable_amount
            },
            ipAddress,
            userAgent
        );

        await sale.destroy();
        return successResponse(res, null, 'Sale deleted successfully');
    } catch (error) { next(error); }
};

module.exports = {
    getAllSales,
    getSaleById,
    createSale,
    deleteSale
};
