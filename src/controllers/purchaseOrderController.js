const { PurchaseOrder, PurchaseOrderItem, Supplier, Branch, User, Product, ProductVariant, GRN, AuditLog, PurchaseReturn } = require('../models');
const { format } = require('date-fns');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const { sendEmail } = require('../utils/mailer');

const getAllPurchaseOrders = async (req, res, next) => {
    try {
        const { page, size, status, supplier_id } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = { organization_id: req.user.organization_id };
        if (status) where.status = status;
        if (supplier_id) where.supplier_id = supplier_id;

        const pos = await PurchaseOrder.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                { model: Supplier, as: 'supplier' },
                { model: Branch, as: 'branch' },
                { model: User, as: 'created_by_user' }
            ],
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, pos.rows, {
            total: pos.count,
            page: parseInt(page) || 1,
            limit
        }, 'Purchase orders fetched successfully');
    } catch (error) { next(error); }
};

const getPurchaseOrderById = async (req, res, next) => {
    try {
        const po = await PurchaseOrder.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id },
            include: [
                { model: Supplier, as: 'supplier' },
                { model: Branch, as: 'branch' },
                { model: User, as: 'created_by_user' },
                { model: GRN, as: 'grns' },
                { model: PurchaseReturn, as: 'returns' },
                {
                    model: PurchaseOrderItem, as: 'items',
                    include: [
                        { model: Product, as: 'product' },
                        { model: ProductVariant, as: 'variant' }
                    ]
                }
            ]
        });

        if (!po) return errorResponse(res, 'Purchase Order not found', 404);

        // Fetch Timeline from AuditLog
        const logs = await AuditLog.findAll({
            where: {
                organization_id: req.user.organization_id,
                entity_type: 'PurchaseOrder',
                entity_id: po.id
            },
            include: [{ model: User, as: 'user', attributes: ['name'] }],
            order: [['created_at', 'DESC'], ['id', 'DESC']]
        });

        const timeline = logs.map(log => ({
            title: log.description || log.action,
            by: log.user?.name || 'System',
            date: format(new Date(log.created_at), "MMM dd, yyyy HH:mm")
        }));

        // Check if there is an explicit CREATE log
        const hasCreateLog = logs.some(log => log.action === 'CREATE');

        if (!hasCreateLog) {
            timeline.push({
                title: "Purchase Order Created",
                by: po.created_by_user?.name || "System",
                date: format(new Date(po.created_at), "MMM dd, yyyy HH:mm")
            });
        }

        const poData = po.toJSON();
        poData.timeline = timeline;

        return successResponse(res, poData, 'Purchase Order fetched');
    } catch (error) { next(error); }
};

const createPurchaseOrder = async (req, res, next) => {
    const { items, ...poData } = req.body;
    try {
        // Auto-generate PO number if not provided
        if (!poData.po_number) {
            const date = new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const random = Math.floor(1000 + Math.random() * 9000);
            poData.po_number = `PO-${year}${month}${day}-${random}`;
        }

        const po = await PurchaseOrder.create({
            ...poData,
            status: poData.status || 'pending',
            organization_id: poData.organization_id || req.user.organization_id,
            branch_id: poData.branch_id || (req.user.branches && req.user.branches.length > 0 ? req.user.branches[0].id : null),
            user_id: req.user.id,
            total_amount: 0 // Initialize as 0, will update after processing items
        });

        if (items && items.length > 0) {
            let totalAmount = 0;
            const itemsToCreate = [];

            for (const item of items) {
                let variantId = item.variant_id || item.product_variant_id || item.productId;
                let productId = item.product_id;

                let variant = null;
                let product = null;

                // 1. Try to resolve variant
                if (variantId) {
                    variant = await ProductVariant.findByPk(variantId);
                }

                // 2. If no variant, try lookup as Product or resolve default variant
                if (!variant) {
                    const lookupId = variantId || productId;
                    if (lookupId) {
                        // Check if it's a Product ID
                        product = await Product.findByPk(lookupId);
                        if (product) {
                            // Try to find the first variant of this product if it exists
                            variant = await ProductVariant.findOne({ where: { product_id: product.id } });
                        }
                    }
                } else {
                    // If variant found, we definitely have the product
                    product = await Product.findByPk(variant.product_id);
                }

                if (!product && !variant) {
                    console.error(`Item could not be resolved (no product or variant):`, item);
                    continue;
                }

                const resolvedProductId = product ? product.id : variant.product_id;
                const resolvedVariantId = variant ? variant.id : null;

                const qty = Number(item.quantity_ordered || item.quantity) || 0;
                // Cost priority: payload > variant > product
                const cost = Number(item.unit_cost || item.unitCost) ||
                    Number(variant?.cost_price) ||
                    Number(product?.cost_price) || 0;

                const itemTotal = qty * cost;
                totalAmount += itemTotal;

                itemsToCreate.push({
                    purchase_order_id: po.id,
                    product_id: resolvedProductId,
                    product_variant_id: resolvedVariantId,
                    quantity: qty,
                    unit_cost: cost,
                    total_amount: itemTotal
                });
            }

            if (itemsToCreate.length > 0) {
                await PurchaseOrderItem.bulkCreate(itemsToCreate);
                // Final update for total amount
                await po.update({ total_amount: totalAmount });
            }
        }

        // Add Audit Log for creation
        await AuditLog.create({
            organization_id: po.organization_id,
            user_id: req.user.id,
            action: 'CREATE',
            entity_type: 'PurchaseOrder',
            entity_id: po.id,
            description: `Purchase Order ${po.po_number} created.`
        });

        const createdPo = await PurchaseOrder.findByPk(po.id, {
            include: [{ model: PurchaseOrderItem, as: 'items' }]
        });

        return successResponse(res, createdPo, 'Purchase Order created successfully', 201);
    } catch (error) { next(error); }
};

const updatePurchaseOrder = async (req, res, next) => {
    try {
        const po = await PurchaseOrder.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!po) return errorResponse(res, 'Purchase Order not found', 404);

        if (po.status !== 'pending') {
            return errorResponse(res, 'Only pending orders can be updated', 400);
        }

        await po.update(req.body);

        // Add Audit Log
        await AuditLog.create({
            organization_id: po.organization_id,
            user_id: req.user.id,
            action: 'UPDATE',
            entity_type: 'PurchaseOrder',
            entity_id: po.id,
            description: `Purchase Order ${po.po_number} updated.`
        });

        return successResponse(res, po, 'Purchase Order updated successfully');
    } catch (error) { next(error); }
};

const deletePurchaseOrder = async (req, res, next) => {
    try {
        const po = await PurchaseOrder.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!po) return errorResponse(res, 'Purchase Order not found', 404);

        if (po.status !== 'pending') {
            return errorResponse(res, 'Only pending orders can be deleted', 400);
        }

        await po.destroy();
        return successResponse(res, null, 'Purchase Order deleted');
    } catch (error) { next(error); }
};

const approvePurchaseOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const po = await PurchaseOrder.findByPk(id);

        if (!po) {
            return errorResponse(res, 'Purchase Order not found', 404);
        }

        if (po.status !== 'pending') {
            return errorResponse(res, `Purchase Order cannot be approved from status: ${po.status}`, 400);
        }

        await po.update({ status: 'ordered' });

        // Add Audit Log
        await AuditLog.create({
            organization_id: po.organization_id,
            user_id: req.user.id,
            action: 'UPDATE',
            entity_type: 'PurchaseOrder',
            entity_id: po.id,
            description: `Purchase Order ${po.po_number} approved and ordered.`
        });

        return successResponse(res, po, 'Purchase Order approved successfully');
    } catch (error) { next(error); }
};

const generatePOPDF = async (req, res, next) => {
    try {
        const { id } = req.params;
        const po = await PurchaseOrder.findByPk(id, {
            include: [
                { model: Supplier, as: 'supplier' },
                { model: Branch, as: 'branch' },
                { model: User, as: 'created_by_user' },
                {
                    model: PurchaseOrderItem,
                    as: 'items',
                    include: [
                        { model: Product, as: 'product' },
                        { model: ProductVariant, as: 'variant' }
                    ]
                }
            ]
        });

        if (!po) {
            return errorResponse(res, 'Purchase Order not found', 404);
        }

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        let filename = `PO-${po.po_number}.pdf`;

        res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);

        // Header
        doc.fontSize(20).text('PURCHASE ORDER', { align: 'center' });
        doc.moveDown();

        // Info Grid
        doc.fontSize(10);
        const startY = doc.y;
        doc.text(`PO Number: ${po.po_number}`, 50, startY);
        doc.text(`Date: ${new Date(po.order_date).toLocaleDateString()}`, 50, startY + 15);
        doc.text(`Status: ${po.status.toUpperCase()}`, 50, startY + 30);

        doc.text('SHIP TO:', 350, startY, { underline: true });
        doc.text(po.branch?.name || 'N/A', 350, startY + 15);
        doc.text(po.branch?.address || '', 350, startY + 30);

        doc.moveDown(4);

        // Supplier Info
        doc.text('SUPPLIER:', { underline: true });
        doc.text(po.supplier?.name || 'N/A');
        doc.text(po.supplier?.email || '');
        doc.moveDown();

        // Items Table
        const tableTop = doc.y + 20;
        doc.font('Helvetica-Bold');
        doc.text('Item / Variant', 50, tableTop);
        doc.text('Quantity', 300, tableTop, { width: 50, align: 'right' });
        doc.text('Unit Cost', 370, tableTop, { width: 80, align: 'right' });
        doc.text('Total', 470, tableTop, { width: 80, align: 'right' });

        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        doc.font('Helvetica');
        let currentY = tableTop + 25;

        if (po.items) {
            po.items.forEach(item => {
                const productName = item.product?.name || 'Unknown';
                const variantName = item.variant?.name ? ` (${item.variant.name})` : '';

                doc.text(`${productName}${variantName}`, 50, currentY, { width: 230 });
                doc.text(item.quantity.toString(), 300, currentY, { width: 50, align: 'right' });
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
        doc.text(`GRAND TOTAL: LKR ${Number(po.total_amount).toFixed(2)}`, { align: 'right' });

        doc.end();

    } catch (error) { next(error); }
};

const cancelPurchaseOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const po = await PurchaseOrder.findOne({
            where: { id: id, organization_id: req.user.organization_id }
        });

        if (!po) return errorResponse(res, 'Purchase Order not found', 404);

        if (['received', 'cancelled'].includes(po.status)) {
            return errorResponse(res, `Cannot cancel order that is already ${po.status}`, 400);
        }

        await po.update({ status: 'cancelled' });

        // Add Audit Log
        await AuditLog.create({
            organization_id: po.organization_id,
            user_id: req.user.id,
            action: 'CANCEL',
            entity_type: 'PurchaseOrder',
            entity_id: po.id,
            description: `Purchase Order ${po.po_number || '#' + po.id} was cancelled.`
        });

        return successResponse(res, po, 'Purchase Order cancelled successfully');
    } catch (error) { next(error); }
};

const emailPurchaseOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const po = await PurchaseOrder.findOne({
            where: { id: id, organization_id: req.user.organization_id },
            include: [
                { model: Supplier, as: 'supplier' },
                { model: Branch, as: 'branch' },
                {
                    model: PurchaseOrderItem, as: 'items',
                    include: [{ model: Product, as: 'product' }, { model: ProductVariant, as: 'variant' }]
                }
            ]
        });

        if (!po) return errorResponse(res, 'Purchase Order not found', 404);
        if (!po.supplier || !po.supplier.email) {
            return errorResponse(res, 'Supplier does not have a registered email address', 400);
        }

        const itemsHtml = po.items.map(item => `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.product?.name || item.name}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">LKR ${Number(item.unit_cost).toFixed(2)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">LKR ${Number(item.total_amount).toFixed(2)}</td>
            </tr>
        `).join('');

        const emailHtml = `
            <h2>Purchase Order: #${po.po_number}</h2>
            <p><strong>Date:</strong> ${format(new Date(po.order_date), 'MMM dd, yyyy')}</p>
            <p><strong>Supplier:</strong> ${po.supplier.name}</p>
            <p><strong>Ship To:</strong> ${po.branch?.name || 'Main Warehouse'}</p>
            <hr />
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th style="padding: 8px; text-align: left;">Item Description</th>
                        <th style="padding: 8px; text-align: center;">Qty</th>
                        <th style="padding: 8px; text-align: right;">Unit Price</th>
                        <th style="padding: 8px; text-align: right;">Extension</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="padding: 8px; text-align: right; font-weight: bold;">Grand Total:</td>
                        <td style="padding: 8px; text-align: right; font-weight: bold;">LKR ${Number(po.total_amount).toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
            <p><strong>Notes:</strong> ${po.notes || 'N/A'}</p>
            <p>Please acknowledge the receipt of this order.</p>
        `;

        await sendEmail({
            to: po.supplier.email,
            subject: `PURCHASE ORDER #${po.po_number || po.id} - ${process.env.APP_NAME || 'POS System'}`,
            html: emailHtml
        });

        // Add Audit Log
        await AuditLog.create({
            organization_id: po.organization_id,
            user_id: req.user.id,
            action: 'EMAIL',
            entity_type: 'PurchaseOrder',
            entity_id: po.id,
            description: `Purchase Order ${po.po_number} emailed to ${po.supplier.email}.`
        });

        return successResponse(res, null, `Purchase Order dispatching initiated to ${po.supplier.email}`);
    } catch (error) { next(error); }
};

module.exports = {
    getAllPurchaseOrders,
    getPurchaseOrderById,
    createPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    approvePurchaseOrder,
    generatePOPDF,
    cancelPurchaseOrder,
    emailPurchaseOrder
};
