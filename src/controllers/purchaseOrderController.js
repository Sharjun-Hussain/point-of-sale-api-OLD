const { PurchaseOrder, PurchaseOrderItem, Supplier, Branch, User, Product, ProductVariant, GRN, AuditLog, PurchaseReturn, Attachment, Organization, Setting } = require('../models');
const { format } = require('date-fns');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const { sendEmail, sendEmailWithSettings } = require('../utils/mailer');
const path = require('path');
const fs = require('fs');

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
                },
                { model: Attachment, as: 'attachments' }
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
    try {
        let bodyContent = req.body;
        // Parse data from multipart/form-data if necessary
        if (req.body.data && typeof req.body.data === 'string') {
            try {
                bodyContent = JSON.parse(req.body.data);
            } catch (pErr) {
                console.error("JSON Parse Error:", pErr);
            }
        }

        const { items, ...poData } = bodyContent;
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

                const organization_id = req.user.organization_id;

                // 1. Try to resolve variant
                if (variantId) {
                    variant = await ProductVariant.findOne({ where: { id: variantId, organization_id } });
                }

                // 2. If no variant, try lookup as Product or resolve default variant
                if (!variant) {
                    const lookupId = variantId || productId;
                    if (lookupId) {
                        // Check if it's a Product ID
                        product = await Product.findOne({ where: { id: lookupId, organization_id } });
                        if (product) {
                            // Try to find the first variant of this product if it exists
                            variant = await ProductVariant.findOne({ where: { product_id: product.id, organization_id } });
                        }
                    }
                } else {
                    // If variant found, we definitely have the product
                    product = await Product.findOne({ where: { id: variant.product_id, organization_id } });
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
                    organization_id,
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

        // Handle File Attachments if provided in multipart
        if (req.files && req.files.length > 0) {
            const attachmentPromises = req.files.map(file => {
                return Attachment.create({
                    organization_id: po.organization_id,
                    entity_type: 'PurchaseOrder',
                    entity_id: po.id,
                    file_path: file.path,
                    file_name: file.originalname,
                    file_size: file.size,
                    file_type: file.mimetype
                });
            });
            await Promise.all(attachmentPromises);
        } else if (req.file) {
            // Handle single file upload if only one was sent
            await Attachment.create({
                organization_id: po.organization_id,
                entity_type: 'PurchaseOrder',
                entity_id: po.id,
                file_path: req.file.path,
                file_name: req.file.originalname,
                file_size: req.file.size,
                file_type: req.file.mimetype
            });
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

        const createdPo = await PurchaseOrder.findOne({
            where: { id: po.id, organization_id: req.user.organization_id },
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
        const po = await PurchaseOrder.findOne({
            where: { id, organization_id: req.user.organization_id }
        });

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
        const po = await PurchaseOrder.findOne({
            where: { id, organization_id: req.user.organization_id },
            include: [
                { model: Organization, as: 'organization' },
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

        // Fetch Report Settings for dynamic styling
        const reportSetting = await Setting.findOne({
            where: { organization_id: req.user.organization_id, category: 'report' }
        });
        const reportSettings = reportSetting ? reportSetting.settings_data : {
            primaryColor: '#10b981',
            logoHeight: 40,
            showLogo: true,
            headerTitle: 'Business Intelligence Report',
            showAddress: true,
            showContact: true,
            showGeneratedDate: true,
            showPrintedBy: true,
            showPageNumbers: true,
            showConfidentialTag: true,
            footerText: "Thank you for your business. This is a computer generated document."
        };

        const doc = new PDFDocument({
            margin: 30,
            size: 'A4',
            info: { Title: `Purchase Order ${po.po_number}` }
        });
        let filename = `PO-${po.po_number}.pdf`;

        res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);
        buildPODoc(doc, po, reportSettings);
        doc.end();

    } catch (error) { next(error); }
};
/**
 * Shared helper to build the PO PDF document structure
 * This layout is synchronized with the frontend 'PurchaseOrderTemplate' and respects settings
 */
const buildPODoc = (doc, po, settings) => {
    // --- DESIGN TOKENS (Matching provided CSS) ---
    const themeColor = settings.primaryColor || '#12b886';
    const textMain = '#1f2937';
    const textMuted = '#6b7280';
    const textLight = '#9ca3af';
    const borderColor = '#e5e7eb';
    const bgDark = '#0f172a';

    const margin = 30; // ~10mm as requested
    const rightMargin = 565; // ~595 - 30
    const contentWidth = 535;

    // --- HEADER ---
    // Logo & Branding
    let headerY = 40;
    let logoWidth = 40;
    let hasLogo = false;

    if (po.organization?.logo) {
        const logoPath = path.join(process.cwd(), po.organization.logo);
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, margin, headerY, { height: 40 });
            hasLogo = true;
            // Approximate width to offset text, or just use a fixed offset
            logoWidth = 45;
        }
    }

    if (!hasLogo) {
        // Fallback Logo Box
        doc.rect(margin, headerY, 40, 40).fill(bgDark);
        doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text(po.organization?.name?.[0] || 'I', margin + 13, headerY + 11);
    }

    // Brand Text
    doc.fillColor(bgDark).fontSize(20).font('Helvetica-Bold').text(po.organization?.name?.toUpperCase() || 'INZEEDO', margin + 52, headerY + 5);
    doc.fillColor(textMuted).fontSize(10).font('Helvetica').text(settings.headerTitle || 'BUSINESS INTELLIGENCE REPORT', margin + 52, headerY + 26, { characterSpacing: 0.5 });

    // Doc Title
    doc.fillColor('#374151').fontSize(24).font('Helvetica-Bold').text('Purchase Order', margin, headerY + 65);
    doc.fillColor(textMuted).fontSize(13).font('Helvetica').text('Official Procurement Document', margin, headerY + 92);

    // Company Address
    doc.fillColor(textMuted).fontSize(11).font('Helvetica');
    doc.text(po.organization?.address || 'No 1, Main Street, Colombo', margin, headerY + 115);
    doc.text(`${po.organization?.phone || '0112233445'}    ${po.organization?.email || 'admin@emipos.com'}`, margin, headerY + 132);

    // Meta Data (Top Right)

    const valueWidth = 150;
    const labelWidth = 100;
    const valueX = rightMargin - valueWidth;
    const metaX = valueX - labelWidth - 5;
    let metaRowY = headerY + 5;

    const drawMetaRow = (label, value, y) => {
        doc.fillColor(textMuted).fontSize(9).font('Helvetica-Bold').text(label, metaX, y, { width: labelWidth, align: 'right' });
        doc.fillColor(textMain).fontSize(9).font('Helvetica').text(String(value), valueX, y, { width: valueWidth, align: 'right' });
    };

    if (settings.showGeneratedDate) {
        drawMetaRow('Date Generated:', format(new Date(), "dd MMM yyyy, HH:mm a"), metaRowY);
        metaRowY += 15;
    }
    drawMetaRow('PO #:', po.po_number, metaRowY);
    metaRowY += 15;
    drawMetaRow('Date:', format(new Date(po.order_date), "MMM dd, yyyy"), metaRowY);
    metaRowY += 15;
    drawMetaRow('Expected:', po.expected_delivery_date ? format(new Date(po.expected_delivery_date), "MMM dd, yyyy") : 'N/A', metaRowY);

    // Confidential Badge
    if (settings.showConfidentialTag) {
        const badgeX = rightMargin - 75;
        const badgeY = metaRowY + 18;
        doc.rect(badgeX, badgeY, 75, 18).lineWidth(1).stroke('#f87171');
        doc.fillColor('#ef4444').fontSize(9).font('Helvetica-Bold').text('CONFIDENTIAL', badgeX, badgeY + 5, { width: 75, align: 'center' });
    }

    // --- ACCENT DIVIDER ---
    doc.rect(margin, 205, contentWidth, 3).fill(themeColor);

    // --- PARTIES SECTION ---
    const partiesY = 235;
    const colWidth = contentWidth * 0.45;

    // Vendor
    doc.fillColor(textMuted).fontSize(11).font('Helvetica-Bold').text('VENDOR', margin, partiesY);
    doc.moveTo(margin, partiesY + 14).lineTo(margin + colWidth, partiesY + 14).strokeColor(borderColor).lineWidth(1).stroke();

    doc.fillColor(textMain).fontSize(13).font('Helvetica-Bold').text(po.supplier?.name || 'N/A', margin, partiesY + 22);
    doc.fontSize(11).font('Helvetica').text('Attn:', margin, partiesY + 40);
    doc.text(po.supplier?.address || '', margin, partiesY + 56, { width: colWidth });
    doc.text(po.supplier?.email || '', margin, partiesY + 88);
    doc.text(po.supplier?.phone || '', margin, partiesY + 104);

    // Ship To
    const shipX = margin + contentWidth * 0.55;
    doc.fillColor(textMuted).fontSize(11).font('Helvetica-Bold').text('SHIP TO', shipX, partiesY);
    doc.moveTo(shipX, partiesY + 14).lineTo(shipX + colWidth, partiesY + 14).strokeColor(borderColor).lineWidth(1).stroke();

    doc.fillColor(textMain).fontSize(13).font('Helvetica-Bold').text(po.branch?.name || 'Central Branch', shipX, partiesY + 22);
    doc.fontSize(11).font('Helvetica');
    doc.text(po.branch?.address || 'Colombo 01', shipX, partiesY + 40, { width: colWidth });
    doc.text('Attn: Receiving Department', shipX, partiesY + 72);

    // --- ITEMS TABLE ---
    const tableTop = 380;

    // Table Header
    doc.rect(margin, tableTop, contentWidth, 30).fill(themeColor);
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
    doc.text('#', margin, tableTop + 10, { width: 20, align: 'center' });
    doc.text('ITEM DESCRIPTION', margin + 25, tableTop + 10, { width: 200 });
    doc.text('QTY', margin + 235, tableTop + 10, { width: 60, align: 'right' });
    doc.text('UNIT PRICE', margin + 305, tableTop + 10, { width: 90, align: 'right' });
    doc.text('TOTAL', margin + 415, tableTop + 10, { width: 120, align: 'right' });

    let currentY = tableTop + 30;
    doc.font('Helvetica');
    doc.fontSize(11);

    const formatCurrency = (num) => {
        return 'Rs. ' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    if (po.items) {
        po.items.forEach((item, index) => {
            const rowHeight = 50;
            // Page break logic
            if (currentY + rowHeight > 750) {
                doc.addPage();
                currentY = 40;
            }

            doc.fillColor(textMuted).text(String(index + 1), margin, currentY + 12, { width: 20, align: 'center' });

            doc.fillColor(textMain).font('Helvetica-Bold').text(item.product?.name || 'Unknown Item', margin + 25, currentY + 12);
            doc.fillColor(textLight).fontSize(10).font('Helvetica').text(`SKU: ${item.variant?.sku || item.product?.code || 'N/A'}`, margin + 25, currentY + 28, { width: 200 });

            doc.fontSize(11).fillColor(textMain);
            doc.text(item.quantity.toString(), margin + 235, currentY + 12, { width: 60, align: 'right' });
            doc.text(formatCurrency(item.unit_cost), margin + 305, currentY + 12, { width: 100, align: 'right' });
            doc.font('Helvetica-Bold').text(formatCurrency(item.total_amount), margin + 415, currentY + 12, { width: 120, align: 'right' });

            currentY += rowHeight;
            doc.moveTo(margin, currentY).lineTo(margin + contentWidth, currentY).strokeColor(borderColor).lineWidth(1).stroke();
        });
    }

    // --- BOTTOM SECTION ---
    let bottomY = currentY + 20;
    if (bottomY > 650) {
        doc.addPage();
        bottomY = 40;
    }

    // Terms & Notes
    doc.fillColor(textMuted).fontSize(11).font('Helvetica-Bold').text('TERMS & NOTES', margin, bottomY);
    doc.rect(margin, bottomY + 15, colWidth, 60).fill('#f8fafc');
    doc.rect(margin, bottomY + 15, colWidth, 60).lineWidth(1).stroke('#cbd5e1');
    doc.fillColor(textMuted).fontSize(11).font('Helvetica-Oblique').text(po.notes || 'Standard payment terms apply. Please include PO number on all invoices.', margin + 12, bottomY + 28, { width: colWidth - 24 });

    // Totals
    const totalX = margin + contentWidth * 0.6;
    const totalW = contentWidth * 0.4;
    doc.fillColor(textMuted).fontSize(11).font('Helvetica');

    doc.text('Subtotal:', totalX, bottomY + 15);
    doc.fillColor(textMain).font('Helvetica-Bold').text(formatCurrency(po.total_amount), totalX, bottomY + 15, { width: totalW, align: 'right' });

    doc.text('Tax / VAT:', totalX, bottomY + 33);
    doc.fillColor(textMain).font('Helvetica').text(formatCurrency(0), totalX, bottomY + 33, { width: totalW, align: 'right' });

    doc.moveTo(totalX, bottomY + 52).lineTo(totalX + totalW, bottomY + 52).strokeColor(textMain).lineWidth(2).stroke();

    doc.fillColor(textMain).fontSize(14).font('Helvetica-Bold').text('Total:', totalX, bottomY + 65);
    doc.text(formatCurrency(po.total_amount), totalX, bottomY + 65, { width: totalW, align: 'right' });

    // Signature
    const sigY = bottomY + 160;
    doc.moveTo(totalX + 20, sigY).lineTo(totalX + totalW, sigY).strokeColor(textMuted).lineWidth(1).stroke();
    doc.fillColor(textMuted).fontSize(10).font('Helvetica-Bold').text('AUTHORIZED SIGNATURE', totalX + 20, sigY + 8, { width: totalW - 20, align: 'center' });

    // --- FOOTER ---
    const pageFooterY = 800;
    const footerFontSize = 9;
    doc.fillColor(textLight).fontSize(footerFontSize).font('Helvetica');

    // Left: Printed By
    doc.text('Printed by Authorized User', margin, pageFooterY, { width: 150, align: 'left' });

    // Center: Disclaimer
    doc.text('This is a computer generated document. From Inzeedo POS', margin + 150, pageFooterY, { width: 245, align: 'center' });

    // Right: Page Number
    doc.text('Page 1 of 1', margin + 385, pageFooterY, { width: 150, align: 'right' });
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
                { model: Organization, as: 'organization' },
                { model: Supplier, as: 'supplier' },
                { model: Branch, as: 'branch' },
                {
                    model: PurchaseOrderItem, as: 'items',
                    include: [{ model: Product, as: 'product' }, { model: ProductVariant, as: 'variant' }]
                }
            ]
        });

        // Fetch Report Settings for dynamic styling
        const reportSetting = await Setting.findOne({
            where: { organization_id: req.user.organization_id, category: 'report' }
        });
        const reportSettings = reportSetting ? reportSetting.settings_data : {
            primaryColor: '#10b981',
            logoHeight: 40,
            showLogo: true,
            headerTitle: 'Business Intelligence Report',
            showAddress: true,
            showContact: true,
            showGeneratedDate: true,
            showPrintedBy: true,
            showPageNumbers: true,
            showConfidentialTag: true,
            footerText: "Thank you for your business. This is a computer generated document."
        };

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
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
                <h2 style="color: ${reportSettings.primaryColor || '#10b981'}; border-bottom: 2px solid ${reportSettings.primaryColor || '#10b981'}; padding-bottom: 10px;">Purchase Order: ${po.po_number}</h2>
                <p>Hello <strong>${po.supplier.name}</strong>,</p>
                <p>Please find the attached Purchase Order (<strong>${po.po_number}</strong>) generated on ${new Date(po.order_date).toLocaleDateString()}.</p>
                
                <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; color: #666;">Order Summary</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: ${reportSettings.primaryColor || '#10b981'}; color: white;">
                                <th style="padding: 8px; text-align: left;">Item</th>
                                <th style="padding: 8px; text-align: center;">Qty</th>
                                <th style="padding: 8px; text-align: right;">Unit Price</th>
                                <th style="padding: 8px; text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" style="padding: 10px; text-align: right; font-weight: bold;">Grand Total:</td>
                                <td style="padding: 10px; text-align: right; font-weight: bold; color: ${reportSettings.primaryColor || '#10b981'};">LKR ${Number(po.total_amount).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <p style="font-size: 13px; color: #666;">If you have any questions regarding this protocol, please contact our procurement department directly.</p>
                
                <div style="margin-top: 30px; border-top: 1px solid #eee; pt-15px; font-size: 11px; color: #999;">
                    <p>${po.organization?.name || 'Inzeedo POS'} | ${po.organization?.phone || ''} | ${po.organization?.email || ''}</p>
                    <p style="font-style: italic;">${reportSettings.footerText || ''}</p>
                </div>
            </div>
        `;

        // Generate PDF Buffer for attachment
        const pdfBuffer = await new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 30, size: 'A4' });
            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            buildPODoc(doc, po, reportSettings);
            doc.end();
        });

        await sendEmailWithSettings({
            to: po.supplier.email,
            subject: `PURCHASE ORDER #${po.po_number || po.id} - ${po.organization?.name || 'Procurement'}`,
            html: emailHtml,
            attachments: [
                {
                    filename: `PO-${po.po_number || po.id}.pdf`,
                    content: pdfBuffer
                }
            ]
        }, po.organization_id);

        // Add Audit Log
        await AuditLog.create({
            organization_id: po.organization_id,
            user_id: req.user.id,
            action: 'EMAIL',
            entity_type: 'PurchaseOrder',
            entity_id: po.id,
            description: `Purchase Order ${po.po_number} emailed to supplier ${po.supplier.name}.`
        });

        return successResponse(res, null, 'Purchase Order emailed successfully');
    } catch (error) { next(error); }
};

const uploadPOAttachment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const po = await PurchaseOrder.findOne({
            where: { id, organization_id: req.user.organization_id }
        });

        if (!po) return errorResponse(res, 'Purchase Order not found', 404);

        if (!req.file && (!req.files || req.files.length === 0)) {
            return errorResponse(res, 'No files uploaded', 400);
        }

        const files = req.files || [req.file];
        const attachments = [];

        for (const file of files) {
            const attachment = await Attachment.create({
                organization_id: req.user.organization_id,
                entity_type: 'PurchaseOrder',
                entity_id: po.id,
                file_path: file.path,
                file_name: file.originalname,
                file_size: file.size,
                file_type: file.mimetype
            });
            attachments.push(attachment);
        }

        return successResponse(res, attachments, 'Attachments uploaded successfully', 201);
    } catch (error) { next(error); }
};

const deletePOAttachment = async (req, res, next) => {
    try {
        const { id, attachmentId } = req.params;
        const attachment = await Attachment.findOne({
            where: {
                id: attachmentId,
                entity_id: id,
                entity_type: 'PurchaseOrder',
                organization_id: req.user.organization_id
            }
        });

        if (!attachment) return errorResponse(res, 'Attachment not found', 404);

        // Delete file from filesystem
        const fs = require('fs');
        const path = require('path');
        const fullPath = path.join(process.cwd(), attachment.file_path);

        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }

        await attachment.destroy();
        return successResponse(res, null, 'Attachment deleted successfully');
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
    emailPurchaseOrder,
    uploadPOAttachment,
    deletePOAttachment
};
