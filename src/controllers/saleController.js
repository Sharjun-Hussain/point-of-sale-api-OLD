const db = require('../models');
const { Sale, SaleItem, SalePayment, Product, ProductVariant, Stock, ProductBatch, Transaction, Account, Customer, Branch, User, SaleEmployee, Cheque, Organization, Distributor, Recipe, RecipeItem } = db;
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
        const { 
            page, size, status, customer_id, distributor_id, branch_id, 
            start_date, end_date, search,
            supplier_id, main_category_id, sub_category_id, brand_id, product_id 
        } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = { organization_id: req.user.organization_id };
        if (status) where.status = status;
        if (customer_id) where.customer_id = customer_id;
        if (distributor_id) where.distributor_id = distributor_id;
        if (branch_id) where.branch_id = branch_id;

        // Date Range Filter
        if (start_date && end_date) {
            where.created_at = {
                [Op.between]: [
                    new Date(start_date + 'T00:00:00.000Z'),
                    new Date(end_date + 'T23:59:59.999Z')
                ]
            };
        }

        // Search Filter (Invoice #)
        if (search) {
            where.invoice_number = { [Op.like]: `%${search}%` };
        }

        // Item-level filters
        const itemWhere = {};
        const productWhere = {};
        let productFilterActive = false;

        if (supplier_id && supplier_id !== 'all') {
            productWhere.supplier_id = supplier_id;
            productFilterActive = true;
        }
        if (main_category_id && main_category_id !== 'all') {
            productWhere.main_category_id = main_category_id;
            productFilterActive = true;
        }
        if (sub_category_id && sub_category_id !== 'all') {
            productWhere.sub_category_id = sub_category_id;
            productFilterActive = true;
        }
        if (brand_id && brand_id !== 'all') {
            productWhere.brand_id = brand_id;
            productFilterActive = true;
        }
        if (product_id && product_id !== 'all') {
            productWhere.id = product_id;
            productFilterActive = true;
        }

        const sales = await Sale.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                { model: Customer, as: 'customer', attributes: ['name', 'phone'] },
                { model: Distributor, as: 'distributor', attributes: ['name', 'phone', 'email', 'address', 'company_name'] },
                { model: Branch, as: 'branch', attributes: ['name'] },
                { model: User, as: 'cashier', attributes: ['name'] },
                { model: User, as: 'sellers', attributes: ['name', 'id'], through: { attributes: [] } },
                { model: db.DiningTable, as: 'table', attributes: ['table_number'] },
                {
                    model: SaleItem,
                    as: 'items',
                    required: productFilterActive, // Filter sales by these items
                    include: [
                        { 
                            model: Product, 
                            as: 'product', 
                            attributes: ['name', 'image', 'main_category_id', 'sub_category_id', 'supplier_id', 'brand_id'],
                            where: productFilterActive ? productWhere : undefined,
                            required: productFilterActive
                        },
                        { model: ProductVariant, as: 'variant', attributes: ['name', 'image', 'barcode', 'sku'] }
                    ]
                },
                { model: SalePayment, as: 'payments' }
            ],
            distinct: true, 
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
                { model: Distributor, as: 'distributor' },
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
                        { model: ProductVariant, as: 'variant', attributes: ['name', 'sku', 'barcode'] }
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
            distributor_id,
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
            shift_id,
            redeemed_points: payload_redeemed_points,
            payable_amount: payload_payable_amount,
            dining_type,
            dining_table_id,
            waiter_id
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

        // Fetch settings (Prioritize branch-specific over organization default)
        const taxSetting = await db.Setting.findOne({
            where: {
                organization_id,
                category: 'general',
                [db.Sequelize.Op.or]: [
                    { branch_id: branch_id },
                    { branch_id: null }
                ]
            },
            order: [
                [db.Sequelize.literal('branch_id IS NOT NULL'), 'DESC'],
                ['created_at', 'DESC']
            ],
            transaction: t
        });
        let settings = taxSetting?.settings_data;
        if (typeof settings === 'string') {
            try { settings = JSON.parse(settings); } catch (e) { settings = {}; }
        }

        const finance = settings?.finance || {};
        // Robust check for enableTax (handle string "false" and missing field)
        const enableTax = finance.enableTax === true || (finance.enableTax !== false && finance.enableTax !== 'false' && finance.enableTax !== undefined);
        const rawTaxRate = finance.taxRate;
        const taxRate = (enableTax && rawTaxRate !== undefined && rawTaxRate !== null && rawTaxRate !== '') ? parseFloat(rawTaxRate) / 100 : 0;

        // Fetch Organization and Loyalty Settings
        const [organization, loyaltySetting] = await Promise.all([
            Organization.findByPk(organization_id, { transaction: t }),
            db.Setting.findOne({
                where: { organization_id, category: 'loyalty' },
                transaction: t
            })
        ]);

        let loyaltySettings = loyaltySetting?.settings_data || {};
        if (typeof loyaltySettings === 'string') {
            try { loyaltySettings = JSON.parse(loyaltySettings); } catch (e) { loyaltySettings = {}; }
        }

        const isLoyaltyEnabled = organization?.loyalty_enabled === true;
        const pointsPerCurrency = parseFloat(loyaltySettings.points_per_currency || 1);
        const redemptionRate = parseFloat(loyaltySettings.redemption_rate || 0.01); // 1 point = 0.01 currency
        const minRedemptionPoints = parseInt(loyaltySettings.min_redemption_points || 0);

        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}${month}${day}`;

        // Get the last invoice number for this branch/org today to generate sequential numbers
        const lastSale = await db.Sale.findOne({
            where: {
                organization_id,
                branch_id,
                invoice_number: { [db.Sequelize.Op.like]: `INV-${dateString}-%` }
            },
            order: [['created_at', 'DESC']],
            transaction: t
        });

        let nextNumber = 1;
        if (lastSale) {
            const parts = lastSale.invoice_number.split('-');
            const lastNum = parseInt(parts[parts.length - 1]);
            if (!isNaN(lastNum)) nextNumber = lastNum + 1;
        }
        const invoice_number = `INV-${dateString}-${String(nextNumber).padStart(4, '0')}`;

        let calculated_total_amount = 0;
        let calculated_total_discount = 0;
        let calculated_total_tax = 0;
        const processedItems = [];

        // Fetch all products/variants involved
        console.log(`[Debug] createSale: Starting for Org=${organization_id}, User=${user_id}, Items Count=${items.length}`);
        
        for (const item of items) {
            const { product_id, product_variant_id, product_batch_id, quantity: raw_quantity, discount_amount: claimed_discount, manual_discount, cooking_notes } = item;
            const quantity = parseFloat(raw_quantity || 0);

            if (!product_id || quantity <= 0) continue;

            const product = await Product.findOne({ 
                where: { id: product_id, organization_id }, 
                transaction: t 
            });
            if (!product) {
                console.error(`[Error] createSale: Product NOT FOUND. ID=${product_id}, Org=${organization_id}`);
                await t.rollback();
                return errorResponse(res, `Product not found: ${product_id}. Ensure your POS is synced with the correct organization.`, 400);
            }
            console.log(`[Debug] createSale: Found Product=${product.name} (ID=${product.id})`);

            let unit_price = 0;
            let mrp_price = 0;
            const is_wholesale = payload_is_wholesale === true || payload_is_wholesale === 1 || payload_is_wholesale === 'true';
            let active_variant_id = product_variant_id;
            let active_batch_id = product_batch_id;

            // If a specific batch is provided, try to get price from it
            if (active_batch_id) {
                const batch = await ProductBatch.findOne({
                    where: { id: active_batch_id, organization_id, branch_id },
                    transaction: t
                });
                if (batch) {
                    unit_price = parseFloat((is_wholesale ? batch.wholesale_price : batch.selling_price) || 0);
                    mrp_price = parseFloat(batch.mrp_price || 0);
                    if (!active_variant_id) active_variant_id = batch.product_variant_id;
                }
            }

            // Fallback to variant price if batch price not found or not provided
            if (unit_price === 0) {
                if (active_variant_id) {
                    const variant = await ProductVariant.findOne({ 
                        where: { id: active_variant_id, product_id, organization_id }, 
                        transaction: t 
                    });
                    if (!variant) {
                        await t.rollback();
                        return errorResponse(res, `Variant not found: ${active_variant_id}`, 400);
                    }
                    unit_price = parseFloat((is_wholesale ? variant.wholesale_price : variant.price) || 0);
                    if (mrp_price === 0) mrp_price = parseFloat(variant.mrp_price || 0);
                } else {
                    // Fallback to default variant if no variant specified
                    const defaultVariant = await ProductVariant.findOne({
                        where: { product_id, is_default: true, organization_id },
                        transaction: t
                    });
                    if (defaultVariant) {
                        unit_price = parseFloat((is_wholesale ? defaultVariant.wholesale_price : defaultVariant.price) || 0);
                        if (mrp_price === 0) mrp_price = parseFloat(defaultVariant.mrp_price || 0);
                        active_variant_id = defaultVariant.id;
                    } else {
                        // Last resort: product level
                        unit_price = parseFloat((is_wholesale ? product.wholesale_price : product.price) || 0);
                    }
                }
            }

            // Calculate Item Totals
            const gross_amount = unit_price * quantity;
            const item_discount = parseFloat(claimed_discount || 0);

            const taxable_amount = gross_amount - item_discount;
            const item_tax = taxable_amount * taxRate; 

            calculated_total_amount += gross_amount;
            calculated_total_discount += item_discount;
            calculated_total_tax += item_tax;

            processedItems.push({
                product_id,
                product_variant_id: active_variant_id,
                product_batch_id: active_batch_id,
                quantity,
                unit_price,
                mrp_price,
                discount_amount: item_discount,
                manual_discount: parseFloat(manual_discount || 0),
                tax_amount: item_tax,
                total_amount: taxable_amount + item_tax,
                cooking_notes: cooking_notes || null
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

        // --- LOYALTY REDEMPTION ---
        let redeemedPoints = 0;
        let redemptionDiscount = 0;

        if (isLoyaltyEnabled && customer_id && payload_redeemed_points > 0) {
            const customer = await Customer.findByPk(customer_id, { transaction: t });
            if (customer) {
                redeemedPoints = Math.min(parseInt(payload_redeemed_points), customer.loyalty_points);
                if (redeemedPoints >= minRedemptionPoints) {
                    redemptionDiscount = redeemedPoints * redemptionRate;
                    final_payable_amount -= redemptionDiscount;
                } else {
                    redeemedPoints = 0;
                    redemptionDiscount = 0;
                }
            }
        }

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

        // Rule: Guest/Walk-in must pay in full (SKIP for drafts & e-commerce source orders & manufacturing dispatches)
        // We use the frontend's provided payable_amount if available to avoid tax/rounding mismatches
        const effective_payable_amount = (parseFloat(payload_payable_amount) || final_payable_amount);
        
        const isManufacturer = organization && (organization.business_type?.toLowerCase() === 'manufacturing' || organization.business_type?.toLowerCase() === 'manufacturer');

        if (!isManufacturer && payload_status !== 'draft' && req.body.source !== 'ecommerce' && !customer_id && !distributor_id && total_paid < effective_payable_amount) {
            if ((effective_payable_amount - total_paid) > 1.0) {
                console.warn(`[createSale] 400 Error: Guest must pay in full. Provided Total: ${payload_payable_amount}, Calculated: ${final_payable_amount}, Paid: ${total_paid}`);
                await t.rollback();
                return errorResponse(res, `Walk-in (Guest) customers must pay in full. Total: ${effective_payable_amount.toFixed(2)}, Paid: ${total_paid.toFixed(2)}, Missing: ${(effective_payable_amount - total_paid).toFixed(2)}`, 400);
            }
        }

        // Rule: Credit Limit Validation for Customers OR Distributors (SKIP for e-commerce source orders)
        if (payload_status !== 'draft' && req.body.source !== 'ecommerce' && (customer_id || distributor_id) && total_paid < effective_payable_amount) {
            const newCreditAmount = effective_payable_amount - total_paid;
            
            if (customer_id) {
                const customer = await db.Customer.findByPk(customer_id, { transaction: t });
                if (customer && customer.credit_limit > 0) {
                    const currentBalance = await accountingService.getCustomerBalance(organization_id, customer_id, t);
                    if ((currentBalance + newCreditAmount) > parseFloat(customer.credit_limit)) {
                        console.warn(`[createSale] 400 Error: Credit limit exceeded for customer ${customer_id}. Balance: ${currentBalance}, Limit: ${customer.credit_limit}`);
                        await t.rollback();
                        return errorResponse(res, `Credit limit exceeded. Current Balance: ${currentBalance.toFixed(2)}, Limit: ${parseFloat(customer.credit_limit).toFixed(2)}`, 400);
                    }
                }
            } else if (distributor_id) {
                const distributor = await Distributor.findByPk(distributor_id, { transaction: t });
                if (distributor && distributor.credit_limit > 0) {
                    const currentBalance = await accountingService.getDistributorBalance(organization_id, distributor_id, t);
                    if ((currentBalance + newCreditAmount) > parseFloat(distributor.credit_limit)) {
                        await t.rollback();
                        return errorResponse(res, `Wholesale credit limit exceeded. Current Balance: ${currentBalance.toFixed(2)}, Limit: ${parseFloat(distributor.credit_limit).toFixed(2)}`, 400);
                    }
                }
            }
        }

        // Determine Status
        let payment_status = 'unpaid';
        if (total_paid >= final_payable_amount) {
            payment_status = 'paid';
        } else if (total_paid > 0) {
            payment_status = 'partially_paid';
        }


        // --- 4. CREATE SALE RECORD ---
        const sale = await Sale.create({
            organization_id,
            branch_id,
            customer_id: customer_id || null,
            distributor_id: distributor_id || null,
            user_id,
            invoice_number,
            total_amount: final_total_amount,
            discount_amount: final_discount_amount,
            tax_amount: final_tax_amount,
            payable_amount: final_payable_amount,
            paid_amount: total_paid,
            payment_status,
            payment_method: processedPayments.length === 1 ? processedPayments[0].payment_method : 'split',
            source: req.body.source || 'pos',
            status: payload_status || 'completed',
            notes,
            is_wholesale: !!payload_is_wholesale,
            shift_id: shift_id || null,
            earned_points: 0, // Will update below
            redeemed_points: redeemedPoints,
            dining_type: dining_type || 'takeaway',
            dining_table_id: dining_table_id || null,
            kot_status: req.body.send_to_kitchen === false ? null : (dining_type === 'dine_in' ? 'sent_to_kitchen' : 'pending'),
            waiter_id: waiter_id || null
        }, { transaction: t });

        // Lock or Free dining table based on sale status
        if (dining_type === 'dine_in' && dining_table_id) {
            const table = await db.DiningTable.findByPk(dining_table_id, { transaction: t });
            if (table) {
                if (payload_status === 'completed') {
                    await table.update({
                        status: 'free',
                        current_sale_id: null
                    }, { transaction: t });
                } else {
                    await table.update({
                        status: 'occupied',
                        current_sale_id: sale.id
                    }, { transaction: t });
                }
            }
        }

        // Calculate Earned Points (based on final payable amount BEFORE adjustment/redemption? No, usually on amount paid or total payable)
        // Let's use final_payable_amount + redemptionDiscount (pre-redemption)
        let earnedPoints = 0;
        if (isLoyaltyEnabled && customer_id && sale.status === 'completed') {
            const baseAmountForPoints = final_payable_amount + redemptionDiscount;
            earnedPoints = Math.floor(baseAmountForPoints * pointsPerCurrency);
            await sale.update({ earned_points: earnedPoints }, { transaction: t });
            
            // Update Customer Points
            const customer = await Customer.findByPk(customer_id, { transaction: t });
            if (customer) {
                await customer.update({
                    loyalty_points: customer.loyalty_points + earnedPoints - redeemedPoints
                }, { transaction: t });
            }
        }

        // --- 5. CREATE ITEMS & PAYMENTS ---
        // If not completed, create items as they are. 
        // If completed, we'll create them during the stock update loop (Step 8) to link actual batches.
        if (sale.status !== 'completed') {
            for (const pItem of processedItems) {
                await SaleItem.create({
                    sale_id: sale.id,
                    organization_id,
                    ...pItem
                }, { transaction: t });
            }
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
                payee_payor_name: payee_payor_name || 
                                  (sale.customer_id ? (await Customer.findOne({ where: { id: sale.customer_id, organization_id }, transaction: t })).name : 
                                  (sale.distributor_id ? (await Distributor.findOne({ where: { id: sale.distributor_id, organization_id }, transaction: t })).name : 'Guest')),
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
            // Group items to handle duplicates for stock deduction
            const stockUpdates = processedItems.reduce((acc, current) => {
                // Key includes batch ID if present to ensure specific batch deduction
                const key = `${current.product_id}_${current.product_variant_id || 'null'}_${current.product_batch_id || 'null'}`;
                if (!acc[key]) {
                    acc[key] = { ...current };
                } else {
                    acc[key].quantity += current.quantity;
                }
                return acc;
            }, {});

            for (const key in stockUpdates) {
                const pItem = stockUpdates[key];
                
                // --- BACKFLUSHING (MTO) CHECK ---
                const recipeWhere = { product_id: pItem.product_id, organization_id, is_active: true };
                if (pItem.product_variant_id) recipeWhere.product_variant_id = pItem.product_variant_id;
                
                const recipe = await Recipe.findOne({
                    where: recipeWhere,
                    include: [{ model: RecipeItem, as: 'items' }],
                    transaction: t
                });

                if (recipe && recipe.items && recipe.items.length > 0) {
                    // 1. Create SaleItem for finished product
                    await SaleItem.create({
                        sale_id: sale.id,
                        organization_id,
                        ...pItem,
                        product_batch_id: null,
                        quantity: pItem.quantity,
                        discount_amount: pItem.discount_amount,
                        manual_discount: pItem.manual_discount,
                        tax_amount: pItem.tax_amount,
                        total_amount: pItem.total_amount
                    }, { transaction: t });

                    // 2. Deduct Raw Materials from Stock
                    for (const rItem of recipe.items) {
                        const rawQtyToDeduct = (parseFloat(rItem.quantity) / parseFloat(recipe.batch_size)) * parseFloat(pItem.quantity);
                        
                        const rmStockWhere = { 
                            branch_id, 
                            product_id: rItem.raw_material_id,
                            product_variant_id: rItem.raw_material_variant_id || null
                        };
                        const [rmStock] = await Stock.findOrCreate({
                            where: rmStockWhere,
                            defaults: { ...rmStockWhere, organization_id, quantity: 0 },
                            transaction: t
                        });
                        await rmStock.decrement('quantity', { by: rawQtyToDeduct, transaction: t });

                        let remainingRMDeduction = rawQtyToDeduct;
                        if (remainingRMDeduction > 0) {
                            const rmBatches = await ProductBatch.findAll({
                                where: {
                                    organization_id,
                                    branch_id,
                                    product_id: rItem.raw_material_id,
                                    product_variant_id: rItem.raw_material_variant_id || null,
                                    quantity: { [Op.gt]: 0 }
                                },
                                order: [['expiry_date', 'ASC'], ['created_at', 'ASC']],
                                transaction: t
                            });

                            for (const batch of rmBatches) {
                                if (remainingRMDeduction <= 0) break;
                                const available = parseFloat(batch.quantity);
                                const deduction = Math.min(available, remainingRMDeduction);
                                await batch.decrement('quantity', { by: deduction, transaction: t });
                                remainingRMDeduction -= deduction;
                            }
                        }
                    }
                    continue; // Skip standard deduction
                }

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

                // B. Update Batches
                let qtyToDeduct = parseFloat(pItem.quantity);
                const originalQuantity = qtyToDeduct;
                const deductions = [];

                // If a specific batch is provided, deduct from it first
                if (pItem.product_batch_id) {
                    const specificBatch = await ProductBatch.findOne({
                        where: { id: pItem.product_batch_id, organization_id, branch_id },
                        transaction: t
                    });
                    if (specificBatch) {
                        const available = parseFloat(specificBatch.quantity);
                        const deduction = Math.min(available, qtyToDeduct);
                        await specificBatch.decrement('quantity', { by: deduction, transaction: t });
                        qtyToDeduct -= deduction;
                        deductions.push({ batch_id: pItem.product_batch_id, quantity: deduction });
                    }
                }

                // If there's still quantity to deduct, use FIFO
                if (qtyToDeduct > 0) {
                    const batches = await ProductBatch.findAll({
                        where: {
                            organization_id,
                            branch_id,
                            product_id: pItem.product_id,
                            product_variant_id: pItem.product_variant_id || null,
                            quantity: { [Op.gt]: 0 },
                            ...(pItem.product_batch_id ? { id: { [Op.ne]: pItem.product_batch_id } } : {})
                        },
                        order: [
                            ['expiry_date', 'ASC'], 
                            ['created_at', 'ASC']   
                        ],
                        transaction: t
                    });

                    for (const batch of batches) {
                        if (qtyToDeduct <= 0) break;

                        const available = parseFloat(batch.quantity);
                        const deduction = Math.min(available, qtyToDeduct);

                        await batch.decrement('quantity', { by: deduction, transaction: t });
                        qtyToDeduct -= deduction;
                        deductions.push({ batch_id: batch.id, quantity: deduction });
                    }
                }

                // If still qtyToDeduct > 0 (oversale), record with the original batch (if any) or NULL
                if (qtyToDeduct > 0) {
                    deductions.push({ batch_id: pItem.product_batch_id || null, quantity: qtyToDeduct });
                }

                // Now create SaleItem records for each deduction (splits items by batch for audit)
                for (const d of deductions) {
                    const ratio = originalQuantity > 0 ? d.quantity / originalQuantity : 1;
                    await SaleItem.create({
                        sale_id: sale.id,
                        organization_id,
                        ...pItem,
                        product_batch_id: d.batch_id,
                        quantity: d.quantity,
                        discount_amount: Number((pItem.discount_amount * ratio).toFixed(2)),
                        manual_discount: Number(((pItem.manual_discount || 0) * ratio).toFixed(2)),
                        tax_amount: Number((pItem.tax_amount * ratio).toFixed(2)),
                        total_amount: Number((pItem.total_amount * ratio).toFixed(2))
                    }, { transaction: t });
                }
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
            const ledgerPrefix = sale.source === 'ecommerce' ? '[E-Commerce] ' : '';
            await accountingService.recordTransaction({
                organization_id,
                branch_id,
                account_id: revenueAccount.id,
                customer_id: customer_id || null,
                distributor_id: distributor_id || null,
                amount: final_payable_amount,
                type: 'credit',
                reference_type: 'Sale',
                reference_id: sale.id,
                transaction_date: date,
                description: `${ledgerPrefix}Sales Revenue from Invoice ${invoice_number}`
            }, t);

            // B. Debit Payments (Multi-method support) -> Increase Asset
            let remaining_payable = final_payable_amount;
            for (const pmt of processedPayments) {
                if (pmt.amount <= 0 || remaining_payable <= 0) continue;

                // Cap the recorded payment at the remaining payable amount (handle change/overpayment)
                const amount_to_ledger = Math.min(pmt.amount, remaining_payable);
                remaining_payable -= amount_to_ledger;

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
                    distributor_id: distributor_id || null,
                    amount: amount_to_ledger,
                    type: 'debit',
                    reference_type: 'Sale',
                    reference_id: sale.id,
                    transaction_date: date,
                    description: `${ledgerPrefix}${pmt.payment_method.toUpperCase()} payment for Invoice ${invoice_number}`
                }, t);
            }

            // C. Debit AR (Remaining) -> Increase Asset
            const remaining = final_payable_amount - total_paid;
            if (remaining > 0 && (customer_id || distributor_id)) {
                await accountingService.recordTransaction({
                    organization_id,
                    branch_id,
                    account_id: arAccount.id,
                    customer_id: customer_id || null,
                    distributor_id: distributor_id || null,
                    amount: remaining,
                    type: 'debit',
                    reference_type: 'Sale',
                    reference_id: sale.id,
                    transaction_date: date,
                    description: `${ledgerPrefix}Accounts Receivable for Invoice ${invoice_number}`
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
                { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone', 'email', 'address'] },
                { model: Distributor, as: 'distributor', attributes: ['id', 'name', 'phone', 'email', 'address', 'company_name'] },
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

        // --- 10. TRIGGER ALERTS & NOTIFICATIONS ---
        if (sale.status === 'completed') {
            // High Sales Alert
            checkHighSalesAlert(createdSale).catch(err => console.error('[ALERTS] High sales trigger failed:', err));
            
            // Order SMS Notification
            if (customer_id) {
                const textLkService = require('../services/textLkService');
                const googleDriveService = require('../services/googleDriveService');
                const { generateInvoiceBuffer } = require('../services/invoiceGenerator');
                const { decrypt } = require('../utils/security');
                
                db.Setting.findOne({
                    where: { organization_id, category: 'textlk_crm', branch_id: null }
                }).then(async (setting) => {
                    if (setting) {
                        const config = typeof setting.settings_data === 'string' ? JSON.parse(setting.settings_data) : setting.settings_data;
                        if (config.enableOrderSms && createdSale.customer?.phone) {
                            let invoiceLink = '';
                            if (config.enableInvoiceAttachment && config.googleDriveRefreshToken) {
                                try {
                                    const pdfBuffer = await generateInvoiceBuffer(createdSale, organization);
                                    const driveResponse = await googleDriveService.uploadPdf(
                                        decrypt(config.googleDriveRefreshToken),
                                        pdfBuffer,
                                        `Invoice_${createdSale.invoice_number}.pdf`
                                    );
                                    invoiceLink = driveResponse.webViewLink;
                                } catch (e) {
                                    console.error('[SMS] Failed to upload invoice to Drive:', e);
                                }
                            }

                            const message = config.orderSmsTemplate
                                .replace(/{customer_name}/g, createdSale.customer.name || '')
                                .replace(/{invoice_number}/g, createdSale.invoice_number || '')
                                .replace(/{total_amount}/g, parseFloat(createdSale.payable_amount).toFixed(2))
                                .replace(/{invoice_link}/g, invoiceLink);

                            try {
                                await textLkService.sendSms(organization_id, {
                                    recipient: createdSale.customer.phone,
                                    message: message
                                });
                            } catch (e) {
                                console.error('[SMS] Failed to send order SMS:', e);
                            }
                        }
                    }
                }).catch(err => console.error('[SMS] Failed to fetch settings:', err));
            }

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

        // --- 11. TRIGGER SHOPIFY & CUSTOM E-COMMERCE SYNC ---
        if (sale.status === 'completed') {
            const shopifyService = require('../services/shopifyService');
            const customEcommerceService = require('../services/customEcommerceService');
            // Run in background to avoid blocking response
            (async () => {
                try {
                    for (const pItem of processedItems) {
                        let sku = null;
                        if (pItem.product_variant_id) {
                            const variant = await ProductVariant.findByPk(pItem.product_variant_id);
                            sku = variant?.sku || variant?.barcode;
                        } else {
                            const product = await Product.findByPk(pItem.product_id);
                            sku = product?.code || product?.barcode;
                        }

                        if (sku) {
                            await shopifyService.syncInventory(organization_id, sku, -pItem.quantity);
                            await customEcommerceService.syncInventory(organization_id, sku, -pItem.quantity);
                        }
                    }
                } catch (err) {
                    console.error('[SYNC] Background sync trigger failed:', err);
                }
            })();
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

        // Release Table if linked
        if (sale.dining_table_id) {
            const table = await db.DiningTable.findByPk(sale.dining_table_id);
            if (table && table.current_sale_id === sale.id) {
                await table.update({
                    status: 'free',
                    current_sale_id: null
                });
            }
        }

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

/**
 * Settle Dining Table Order (Checkout & Free Table)
 */
const settleTableSale = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { id } = req.params;
        const { payments, payment_method, paid_amount, status, shift_id } = req.body;
        const organization_id = req.user.organization_id;

        const sale = await Sale.findOne({
            where: { id, organization_id },
            include: [{ model: SaleItem, as: 'items' }],
            transaction: t
        });

        if (!sale) {
            await t.rollback();
            return errorResponse(res, 'Order not found', 404);
        }

        // Process payments
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
        } else {
            const amount = parseFloat(paid_amount || sale.payable_amount);
            processedPayments = [{
                payment_method: payment_method || 'cash',
                amount: amount,
                transaction_reference: null,
                notes: null
            }];
            total_paid = amount;
        }

        let payment_status = 'unpaid';
        if (total_paid >= parseFloat(sale.payable_amount)) {
            payment_status = 'paid';
        } else if (total_paid > 0) {
            payment_status = 'partially_paid';
        }

        // Update sale status and payments
        await sale.update({
            status: status || 'completed',
            paid_amount: total_paid,
            payment_status,
            payment_method: processedPayments.length === 1 ? processedPayments[0].payment_method : 'split',
            shift_id: shift_id || sale.shift_id
        }, { transaction: t });

        // Save payments
        for (const pmt of processedPayments) {
            await SalePayment.create({
                sale_id: sale.id,
                organization_id,
                ...pmt
            }, { transaction: t });
        }

        // Deduct stocks using FIFO or Backflush Recipes
        for (const item of sale.items) {
            const qtyToDeduct = parseFloat(item.quantity);

            // --- BACKFLUSHING (MTO) CHECK ---
            const recipeWhere = { product_id: item.product_id, organization_id, is_active: true };
            if (item.product_variant_id) recipeWhere.product_variant_id = item.product_variant_id;
            
            const recipe = await Recipe.findOne({
                where: recipeWhere,
                include: [{ model: RecipeItem, as: 'items' }],
                transaction: t
            });

            if (recipe && recipe.items && recipe.items.length > 0) {
                // Deduct Raw Materials from Stock
                for (const rItem of recipe.items) {
                    const rawQtyToDeduct = (parseFloat(rItem.quantity) / parseFloat(recipe.batch_size)) * qtyToDeduct;
                    
                    const rmStockWhere = { 
                        branch_id: sale.branch_id, 
                        product_id: rItem.raw_material_id,
                        product_variant_id: rItem.raw_material_variant_id || null
                    };
                    const [rmStock] = await Stock.findOrCreate({
                        where: rmStockWhere,
                        defaults: { ...rmStockWhere, organization_id, quantity: 0 },
                        transaction: t
                    });
                    await rmStock.decrement('quantity', { by: rawQtyToDeduct, transaction: t });

                    let remainingRMDeduction = rawQtyToDeduct;
                    if (remainingRMDeduction > 0) {
                        const rmBatches = await ProductBatch.findAll({
                            where: {
                                organization_id,
                                branch_id: sale.branch_id,
                                product_id: rItem.raw_material_id,
                                product_variant_id: rItem.raw_material_variant_id || null,
                                quantity: { [Op.gt]: 0 }
                            },
                            order: [['expiry_date', 'ASC'], ['created_at', 'ASC']],
                            transaction: t
                        });

                        for (const batch of rmBatches) {
                            if (remainingRMDeduction <= 0) break;
                            const available = parseFloat(batch.quantity);
                            const deduction = Math.min(available, remainingRMDeduction);
                            await batch.decrement('quantity', { by: deduction, transaction: t });
                            remainingRMDeduction -= deduction;
                        }
                    }
                }
                continue; // Skip standard deduction
            }

            // Decrement global stock
            const stock = await Stock.findOne({
                where: {
                    branch_id: sale.branch_id,
                    product_id: item.product_id,
                    product_variant_id: item.product_variant_id || null
                },
                transaction: t
            });
            if (stock) {
                await stock.decrement('quantity', { by: qtyToDeduct, transaction: t });
            }

            // Decrement batch stock via FIFO
            const batches = await ProductBatch.findAll({
                where: {
                    organization_id,
                    branch_id: sale.branch_id,
                    product_id: item.product_id,
                    product_variant_id: item.product_variant_id || null,
                    quantity: { [Op.gt]: 0 }
                },
                order: [
                    ['expiry_date', 'ASC'],
                    ['created_at', 'ASC']
                ],
                transaction: t
            });

            let remainingDeduction = qtyToDeduct;
            for (const batch of batches) {
                if (remainingDeduction <= 0) break;
                const available = parseFloat(batch.quantity);
                const deduction = Math.min(available, remainingDeduction);
                await batch.decrement('quantity', { by: deduction, transaction: t });
                remainingDeduction -= deduction;
            }
        }

        // Release Table if linked
        if (sale.dining_table_id) {
            const table = await db.DiningTable.findByPk(sale.dining_table_id, { transaction: t });
            if (table) {
                await table.update({
                    status: 'free',
                    current_sale_id: null
                }, { transaction: t });
            }
        }

        await t.commit();

        const settledSale = await Sale.findOne({
            where: { id: sale.id },
            include: [{ model: SaleItem, as: 'items' }, { model: SalePayment, as: 'payments' }]
        });

        return successResponse(res, settledSale, 'Restaurant table order settled and freed successfully');
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

/**
 * Append/Update Items on a Table Order (Adding new courses)
 */
const updateActiveTableSale = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { id } = req.params;
        const { items } = req.body; // New items array to append
        const organization_id = req.user.organization_id;

        const sale = await Sale.findOne({
            where: { id, organization_id },
            include: [{ model: SaleItem, as: 'items' }],
            transaction: t
        });

        if (!sale) {
            await t.rollback();
            return errorResponse(res, 'Active table order not found', 404);
        }

        let addedAmount = 0;
        let addedTax = 0;
        let addedDiscount = 0;

        // Process each new item and create it
        for (const item of items) {
            const { product_id, product_variant_id, quantity, unit_price, mrp_price, discount_amount, tax_amount, cooking_notes } = item;
            
            const total = (parseFloat(unit_price) * parseFloat(quantity)) - parseFloat(discount_amount || 0) + parseFloat(tax_amount || 0);

            await SaleItem.create({
                sale_id: sale.id,
                organization_id,
                product_id,
                product_variant_id: product_variant_id || null,
                quantity,
                unit_price,
                mrp_price: mrp_price || unit_price,
                discount_amount: discount_amount || 0,
                tax_amount: tax_amount || 0,
                total_amount: total,
                cooking_notes: cooking_notes || null,
                cooking_status: 'pending'
            }, { transaction: t });

            addedAmount += parseFloat(unit_price) * parseFloat(quantity);
            addedDiscount += parseFloat(discount_amount || 0);
            addedTax += parseFloat(tax_amount || 0);
        }

        // Update the header sale amounts
        const newTotal = parseFloat(sale.total_amount) + addedAmount;
        const newDiscount = parseFloat(sale.discount_amount) + addedDiscount;
        const newTax = parseFloat(sale.tax_amount) + addedTax;
        const newPayable = (newTotal - newDiscount) + newTax;

        await sale.update({
            total_amount: newTotal,
            discount_amount: newDiscount,
            tax_amount: newTax,
            payable_amount: newPayable,
            kot_status: 'sent_to_kitchen' // Sent new items to kitchen!
        }, { transaction: t });

        await t.commit();

        const updatedSale = await Sale.findOne({
            where: { id: sale.id },
            include: [
                {
                    model: SaleItem,
                    as: 'items',
                    include: [{ model: Product, as: 'product', attributes: ['name'] }]
                }
            ]
        });

        return successResponse(res, updatedSale, 'Table order items updated and sent to kitchen successfully');
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

module.exports = {
    getAllSales,
    getSaleById,
    createSale,
    deleteSale,
    settleTableSale,
    updateActiveTableSale
};
