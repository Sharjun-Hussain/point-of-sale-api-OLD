const db = require('../models');
const { Supplier, Transaction, Account, GRN, GRNItem, Product, ProductVariant, ProductBatch, Cheque } = db;
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Sequelize } = require('sequelize');
const { format } = require('date-fns');
const auditService = require('../services/auditService');
const accountingService = require('../services/accountingService');

/**
 * Supplier Controller
 */
const getAllSuppliers = async (req, res, next) => {
    try {
        const { page, size, name } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = {};
        if (name) {
            where.name = { [Sequelize.Op.like]: `%${name}%` };
        }

        const suppliers = await Supplier.findAndCountAll({
            where: { ...where, organization_id: req.user.organization_id },
            limit,
            offset,
            order: [['name', 'ASC']]
        });

        return paginatedResponse(res, suppliers.rows, {
            total: suppliers.count,
            page: parseInt(page) || 1,
            limit
        }, 'Suppliers fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Supplier Ledger
 */
const getSupplierLedger = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { from_date, to_date } = req.query;

        const supplier = await Supplier.findOne({
            where: { id, organization_id: req.user.organization_id }
        });
        if (!supplier) {
            return errorResponse(res, 'Supplier not found', 404);
        }

        // Get the AP Account
        const apAccount = await Account.findOne({
            where: {
                organization_id: req.user.organization_id,
                code: '2100' // Accounts Payable
            }
        });

        if (!apAccount) {
            return errorResponse(res, 'Accounts Payable account not found. Please set up your chart of accounts.', 500);
        }

        // Build where clause for AP transactions only
        const where = {
            supplier_id: id,
            account_id: apAccount.id  // CRITICAL FIX: Only AP transactions
        };
        if (from_date && to_date) {
            where.transaction_date = {
                [Sequelize.Op.between]: [new Date(from_date), new Date(to_date)]
            };
        }

        const transactions = await Transaction.findAll({
            where,
            include: [{ model: Account, as: 'account' }],
            order: [['transaction_date', 'ASC']]
        });

        // Calculate running balance (what we owe supplier)
        let balance = 0;
        const ledger = transactions.map(t => {
            if (t.type === 'credit') { // GRN or charge - we owe MORE
                balance += parseFloat(t.amount);
            } else { // Payment - we owe LESS
                balance -= parseFloat(t.amount);
            }
            return {
                ...t.toJSON(),
                balance
            };
        });

        return successResponse(res, {
            supplier,
            ledger,
            current_balance: balance
        }, 'Supplier ledger fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Create GRN (Goods Received Note)
 */
const createGRN = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        // Parse data from multipart/form-data if necessary
        let bodyContent = req.body;
        if (req.body.data && typeof req.body.data === 'string') {
            try {
                bodyContent = JSON.parse(req.body.data);
            } catch (pErr) {
                console.error("JSON Parse Error:", pErr);
            }
        }

        let {
            supplier_id, purchase_order_id, grn_number,
            items, remarks, total_amount, grn_date, invoice_number
        } = bodyContent;

        const notes = remarks || bodyContent.notes;
        const received_date = grn_date || bodyContent.received_date || new Date();

        const organization_id = req.user.organization_id;
        const branch_id = bodyContent.branch_id || req.user.branch_id;
        const user_id = req.user.id;

        if (!branch_id) {
            return errorResponse(res, 'Branch ID is required', 400);
        }

        // Auto-generate GRN number if not provided
        if (!grn_number) {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const count = await GRN.count({ where: { organization_id } });
            grn_number = `GRN-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;
        }

        // Calculate total_amount if not provided
        if (!total_amount) {
            total_amount = items.reduce((acc, item) => {
                const qty = parseFloat(item.quantity_received || item.received_qty || item.receivedQty || 0);
                const cost = parseFloat(item.unit_cost || item.unitCost || 0);
                return acc + (qty * cost);
            }, 0);
        }

        const grn = await GRN.create({
            supplier_id,
            branch_id,
            organization_id,
            purchase_order_id,
            user_id,
            grn_number,
            total_amount,
            notes,
            invoice_number,
            invoice_file: req.file ? req.file.path : null,
            received_date
        }, { transaction: t });

        for (const item of items) {
            const qtyReceived = parseFloat(item.quantity_received || item.received_qty || item.receivedQty || 0);
            const freeQty = parseFloat(item.free_qty || item.freeQty || 0);
            const unitCost = parseFloat(item.unit_cost || item.unitCost || 0);
            const sellingPrice = parseFloat(item.selling_price || item.sellingPrice || unitCost * 1.25);
            const wholesalePrice = parseFloat(item.wholesale_price || item.wholesalePrice || 0);
            const itemTotal = qtyReceived * unitCost;

            // Handle auto-generation of batch number if missing (Purchase Date Based)
            let effectiveBatchNumber = item.batch_number || item.batchNumber;
            if (!effectiveBatchNumber) {
                const datePart = new Date(received_date).toISOString().slice(0, 10).replace(/-/g, '');
                const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
                effectiveBatchNumber = `BN-${datePart}-${randomPart}`;
            }

            // 1. Create/Update Product Batch (Find by number, expiry, and price to support pricing-based batches)
            const [batch, createdBatch] = await db.ProductBatch.findOrCreate({
                where: {
                    organization_id,
                    branch_id,
                    product_id: item.product_id || item.productId,
                    product_variant_id: item.product_variant_id || item.productVariantId || null,
                    batch_number: effectiveBatchNumber,
                    expiry_date: item.expiry_date || item.expiryDate || null,
                    cost_price: unitCost,
                    selling_price: sellingPrice,
                    wholesale_price: wholesalePrice
                },
                defaults: {
                    quantity: 0,
                    purchase_date: received_date
                },
                transaction: t
            });

            // Total increment includes free quantity
            await batch.increment('quantity', { by: qtyReceived + freeQty, transaction: t });

            // 2. Create GRN Item linked to Batch
            await db.GRNItem.create({
                grn_id: grn.id,
                product_id: item.product_id || item.productId,
                product_variant_id: item.product_variant_id || item.productVariantId || null,
                product_batch_id: batch.id,
                quantity_ordered: item.quantity_ordered || item.ordered_qty || item.orderedQty || 0,
                quantity_received: qtyReceived,
                free_quantity: freeQty,
                unit_cost: unitCost,
                total_amount: itemTotal,
                expiry_date: item.expiry_date || item.expiryDate || null,
                batch_number: effectiveBatchNumber
            }, { transaction: t });

            // 3. Update Global Stock (Cumulative)
            const [stock, createdStock] = await db.Stock.findOrCreate({
                where: {
                    organization_id,
                    branch_id,
                    product_id: item.product_id || item.productId,
                    product_variant_id: item.product_variant_id || item.productVariantId || null
                },
                defaults: { quantity: 0 },
                transaction: t
            });
            await stock.increment('quantity', { by: qtyReceived + freeQty, transaction: t });

            // 4. Update master price if this is the latest batch
            if (item.product_variant_id || item.productVariantId) {
                await db.ProductVariant.update(
                    { cost_price: unitCost, price: sellingPrice, wholesale_price: wholesalePrice },
                    { where: { id: item.product_variant_id || item.productVariantId, organization_id }, transaction: t }
                );
            } else {
                await db.Product.update(
                    { cost_price: unitCost, price: sellingPrice, wholesale_price: wholesalePrice },
                    { where: { id: item.product_id || item.productId, organization_id }, transaction: t }
                );
            }

            // 5. Update Purchase Order Item if linked
            if (purchase_order_id) {
                const poItem = await db.PurchaseOrderItem.findOne({
                    where: {
                        organization_id,
                        purchase_order_id,
                        product_id: item.product_id || item.productId,
                        product_variant_id: item.product_variant_id || item.productVariantId || null
                    },
                    transaction: t
                });
                if (poItem) {
                    await poItem.increment('quantity_received', { by: qtyReceived, transaction: t });
                }
            }
        }

        // Create Transaction for Ledger
        const [apAccount] = await Account.findOrCreate({
            where: {
                organization_id,
                code: '2100', // Accounts Payable
            },
            defaults: {
                name: 'Accounts Payable',
                type: 'liability'
            },
            transaction: t
        });

        // 1. Credit AP (Increase Liability)
        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: apAccount.id,
            supplier_id,
            amount: total_amount,
            type: 'credit', // Increasing liability
            reference_type: 'GRN',
            reference_id: grn.id,
            transaction_date: received_date || new Date(),
            description: `Goods Received: ${grn_number} (Ref: ${invoice_number || 'N/A'})`
        }, t);

        // 2. Debit Inventory (Increase Asset)
        const [inventoryAccount] = await Account.findOrCreate({
            where: { organization_id, code: '1200' },
            defaults: { name: 'Inventory Asset', type: 'asset' },
            transaction: t
        });

        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: inventoryAccount.id,
            amount: total_amount,
            type: 'debit', // Increase Asset
            reference_type: 'GRN',
            reference_id: grn.id,
            transaction_date: received_date || new Date(),
            description: `Inventory Addition: ${grn_number}`
        }, t);

        // Update Purchase Order status if linked
        if (purchase_order_id) {
            const po = await db.PurchaseOrder.findOne({
                where: { id: purchase_order_id, organization_id },
                include: [{ model: db.PurchaseOrderItem, as: 'items' }],
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
                await po.update({ status: newStatus }, { transaction: t });

                // Add Audit Log for timeline
                await db.AuditLog.create({
                    organization_id,
                    user_id,
                    action: 'UPDATE',
                    entity_type: 'PurchaseOrder',
                    entity_id: po.id,
                    description: `Goods Received: ${grn_number}. ${items.length} items received. Status updated to ${newStatus}.`,
                    metadata: { grn_id: grn.id, grn_number, items_count: items.length }
                }, { transaction: t });
            }
        }

        await t.commit();
        return successResponse(res, grn, 'GRN created and stock updated successfully', 201);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

/**
 * Get All GRNs (Paginated & Filtered)
 */
const getGRNList = async (req, res, next) => {
    try {
        const { page, size, supplier_id, branch_id, start_date, end_date } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = { organization_id: req.user.organization_id };
        if (supplier_id) where.supplier_id = supplier_id;
        if (branch_id) where.branch_id = branch_id;
        if (start_date && end_date) {
            where.received_date = {
                [Sequelize.Op.between]: [new Date(start_date), new Date(end_date)]
            };
        }

        const grns = await GRN.findAndCountAll({
            where,
            include: [
                { model: Supplier, as: 'supplier', attributes: ['name', 'email'] },
                { model: db.Branch, as: 'branch', attributes: ['name'] }
            ],
            limit,
            offset,
            order: [['received_date', 'DESC']]
        });

        return paginatedResponse(res, grns.rows, {
            total: grns.count,
            page: parseInt(page) || 1,
            limit
        }, 'GRNs fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Get GRN Details
 */
const getGRNDetail = async (req, res, next) => {
    try {
        const { id } = req.params;
        const grn = await GRN.findOne({
            where: { id, organization_id: req.user.organization_id },
            include: [
                { model: Supplier, as: 'supplier' },
                {
                    model: GRNItem,
                    as: 'items',
                    include: [
                        { model: Product, as: 'product', attributes: ['name'] },
                        { model: ProductVariant, as: 'variant', attributes: ['name'] }
                    ]
                }
            ]
        });

        if (!grn) return errorResponse(res, 'GRN not found', 404);

        return successResponse(res, grn, 'GRN details fetched');
    } catch (error) {
        next(error);
    }
};

const getSupplierById = async (req, res, next) => {
    try {
        const supplier = await Supplier.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!supplier) return errorResponse(res, 'Supplier not found', 404);
        return successResponse(res, supplier, 'Supplier details fetched');
    } catch (error) { next(error); }
};

const createSupplier = async (req, res, next) => {
    try {
        const organization_id = req.user.organization_id;
        const supplier = await Supplier.create({ ...req.body, organization_id });
        return successResponse(res, supplier, 'Supplier created successfully', 201);
    } catch (error) { next(error); }
};

const updateSupplier = async (req, res, next) => {
    try {
        const supplier = await Supplier.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!supplier) return errorResponse(res, 'Supplier not found', 404);
        await supplier.update(req.body);
        return successResponse(res, supplier, 'Supplier updated successfully');
    } catch (error) { next(error); }
};

const deleteSupplier = async (req, res, next) => {
    try {
        const supplier = await Supplier.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!supplier) return errorResponse(res, 'Supplier not found', 404);
        await supplier.destroy();
        return successResponse(res, null, 'Supplier deleted successfully');
    } catch (error) { next(error); }
};

const getActiveSuppliersList = async (req, res, next) => {
    try {
        const suppliers = await Supplier.findAll({
            where: { is_active: true, organization_id: req.user.organization_id },
            order: [['name', 'ASC']]
        });
        return successResponse(res, suppliers, 'Active suppliers list fetched');
    } catch (error) { next(error); }
};

/**
 * Create Supplier Payment (Settlement)
 */
const generateGRNPDF = async (req, res, next) => {
    try {
        const { id } = req.params;
        const grn = await GRN.findOne({
            where: { id, organization_id: req.user.organization_id },
            include: [
                { model: Supplier, as: 'supplier' },
                { model: db.Branch, as: 'branch' },
                { model: db.PurchaseOrder, as: 'purchase_order', attributes: ['po_number'] },
                { model: db.User, as: 'received_by_user' },
                {
                    model: GRNItem,
                    as: 'items',
                    include: [
                        { model: Product, as: 'product' },
                        { model: ProductVariant, as: 'variant' }
                    ]
                }
            ]
        });

        if (!grn) return errorResponse(res, 'GRN not found', 404);

        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const filename = `GRN-${grn.grn_number}.pdf`;

        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // Header
        doc.fontSize(20).text('GOODS RECEIVED NOTE (GRN)', { align: 'center' });
        doc.moveDown();

        // Info Grid
        doc.fontSize(10);
        const startY = doc.y;
        doc.text(`GRN Number: ${grn.grn_number}`, 50, startY);
        doc.text(`Date: ${format(new Date(grn.received_date), "dd MMM yyyy")}`, 50, startY + 15);
        doc.text(`Reference PO: ${grn.purchase_order?.po_number || 'Direct GRN'}`, 50, startY + 30);

        doc.text('RECEIVED AT:', 350, startY, { underline: true });
        doc.text(grn.branch?.name || 'N/A', 350, startY + 15);
        doc.text(grn.branch?.address || '', 350, startY + 30);

        doc.moveDown(4);

        // Supplier Info
        doc.text('SUPPLIER:', { underline: true });
        doc.text(grn.supplier?.name || 'N/A');
        doc.text(grn.supplier?.email || '');
        doc.text(grn.supplier?.phone || '');
        doc.moveDown();

        // Items Table
        const tableTop = doc.y + 20;
        doc.font('Helvetica-Bold');
        doc.text('Item / Variant', 50, tableTop);
        doc.text('Ordered', 250, tableTop, { width: 50, align: 'right' });
        doc.text('Received', 310, tableTop, { width: 50, align: 'right' });
        doc.text('Cost', 370, tableTop, { width: 80, align: 'right' });
        doc.text('Total', 470, tableTop, { width: 80, align: 'right' });

        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        doc.font('Helvetica');
        let currentY = tableTop + 25;

        if (grn.items) {
            grn.items.forEach(item => {
                const productName = item.product?.name || 'Unknown';
                const variantName = item.variant?.name ? ` (${item.variant.name})` : '';

                doc.text(`${productName}${variantName}`, 50, currentY, { width: 190 });
                doc.text((item.quantity_ordered || 0).toString(), 250, currentY, { width: 50, align: 'right' });
                doc.text((item.quantity_received || 0).toString(), 310, currentY, { width: 50, align: 'right' });
                doc.text(Number(item.unit_cost).toFixed(2), 370, currentY, { width: 80, align: 'right' });
                doc.text(Number(item.total_amount).toFixed(2), 470, currentY, { width: 80, align: 'right' });

                currentY += 25;

                if (currentY > 700) {
                    doc.addPage();
                    currentY = 50;
                }
            });
        }

        doc.moveTo(50, currentY + 10).lineTo(550, currentY + 10).stroke();
        doc.moveDown(2);

        doc.font('Helvetica-Bold');
        doc.fontSize(12);
        doc.text(`GRAND TOTAL: LKR ${Number(grn.total_amount).toFixed(2)}`, { align: 'right' });

        doc.moveDown();
        doc.fontSize(10).font('Helvetica');
        doc.text(`Received By: ${grn.received_by_user?.name || 'N/A'}`, { align: 'left' });
        if (grn.notes) {
            doc.moveDown();
            doc.text(`Notes: ${grn.notes}`);
        }

        doc.end();

    } catch (error) { next(error); }
};

const createSupplierPayment = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { id: supplier_id } = req.params;
        const { 
            payments, 
            total_amount: payload_total,
            transaction_date, 
            description, 
            branch_id: payload_branch_id 
        } = req.body;
        
        const organization_id = req.user.organization_id;
        let branch_id = payload_branch_id || req.user.branch_id;

        if (!branch_id) {
            const mainBranch = await db.Branch.findOne({ where: { organization_id, is_main: true } });
            branch_id = mainBranch ? mainBranch.id : (await db.Branch.findOne({ where: { organization_id, is_active: true } }))?.id;
        }

        if (!branch_id) return errorResponse(res, 'Branch ID is required', 400);

        const supplier = await Supplier.findOne({ where: { id: supplier_id, organization_id } });
        if (!supplier) return errorResponse(res, 'Supplier not found', 404);

        const total_to_pay = payload_total || payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        if (total_to_pay <= 0) return errorResponse(res, 'Payment amount must be greater than zero', 400);

        // --- 1. GENERATE PAYABLE VOUCHER NUMBER ---
        const dateStr = format(new Date(), 'yyyyMMdd');
        const count = await db.SupplierPayment.count({ where: { organization_id } });
        const voucher_number = `PV-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;

        // --- 2. CREATE PAYMENT HEADER ---
        const paymentHeader = await db.SupplierPayment.create({
            organization_id,
            branch_id,
            supplier_id,
            voucher_number,
            payment_date: transaction_date || new Date(),
            total_amount: total_to_pay,
            notes: description
        }, { transaction: t });

        // --- 3. ACCOUTING: Get Accounts Payable account ---
        const [apAccount] = await Account.findOrCreate({
            where: { organization_id, code: '2100' },
            defaults: { name: 'Accounts Payable', type: 'liability' },
            transaction: t
        });

        // --- 4. ACCOUTING: Record MASTER DEBIT in AP ---
        const masterDebitTx = await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: apAccount.id,
            supplier_id,
            amount: total_to_pay,
            type: 'debit',
            reference_type: 'SupplierPayment',
            reference_id: paymentHeader.id,
            transaction_date: transaction_date || new Date(),
            description: `Payment Voucher: ${voucher_number} - ${description || 'N/A'}`
        }, t);

        // --- 5. SPLIT METHODS & CREDIT ENTRIES ---
        for (const pmt of payments) {
            const amt = parseFloat(pmt.amount || 0);
            if (amt <= 0) continue;

            const method = pmt.payment_method.toLowerCase();
            
            let accountCode = '1010'; // Default Cash
            let accountName = 'Cash in Hand';
            let accountType = 'asset';

            if (method === 'bank' || method === 'bank_transfer' || method === 'card') {
                accountCode = '1020';
                accountName = 'Bank';
            } else if (method === 'cheque') {
                accountCode = '2110';
                accountName = 'Cheques Payable';
                accountType = 'liability';
            }

            const [paymentAccount] = await Account.findOrCreate({
                where: { organization_id, code: accountCode },
                defaults: { name: accountName, type: accountType },
                transaction: t
            });

            // Ledger Entry (Credit)
            const ledgerCreditTx = await accountingService.recordTransaction({
                organization_id,
                branch_id,
                account_id: paymentAccount.id,
                supplier_id,
                amount: amt,
                type: 'credit',
                reference_type: 'SupplierPayment',
                reference_id: paymentHeader.id,
                transaction_date: transaction_date || new Date(),
                description: `${pmt.notes || `Payment via ${pmt.payment_method}`} | Voucher: ${voucher_number}`
            }, t);

            // Record Breakdown
            await db.SupplierPaymentMethod.create({
                organization_id,
                supplier_payment_id: paymentHeader.id,
                payment_method: method,
                amount: amt,
                reference_number: pmt.reference_number,
                transaction_id: ledgerCreditTx.id,
                notes: pmt.notes
            }, { transaction: t });

            // Handle Cheque
            if (method === 'cheque' && pmt.cheque_details) {
                const { bank_name, cheque_number, cheque_date, payee_payor_name } = pmt.cheque_details;
                await Cheque.create({
                    organization_id,
                    branch_id,
                    type: 'payable',
                    bank_name,
                    cheque_number,
                    cheque_date,
                    amount: amt,
                    received_issued_date: transaction_date || new Date(),
                    status: 'pending',
                    payee_payor_name: payee_payor_name || supplier.name,
                    reference_type: 'SupplierPayment',
                    reference_id: paymentHeader.id
                }, { transaction: t });
            }
        }

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCustom(
            organization_id,
            req.user.id,
            'SUPPLIER_PAYMENT',
            `Voucher ${voucher_number} recorded for ${supplier.name}. Total: ${total_to_pay}`,
            ipAddress,
            userAgent,
            { voucher_number, total_amount: total_to_pay, supplier_id }
        );

        await t.commit();
        return successResponse(res, paymentHeader, `Payment Voucher ${voucher_number} recorded successfully`, 201);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

module.exports = {
    getAllSuppliers,
    getSupplierById,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    getActiveSuppliersList,
    getSupplierLedger,
    createGRN,
    getGRNList,
    getGRNDetail,
    createSupplierPayment,
    generateGRNPDF
};
