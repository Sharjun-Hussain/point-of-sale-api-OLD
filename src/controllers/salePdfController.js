'use strict';

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const db = require('../models');
const { Sale, SaleItem, SalePayment, Product, ProductVariant, Customer, Branch, User, Organization, Setting, Distributor } = db;
const { errorResponse } = require('../utils/responseHandler');

// ─── Design Constants ─────────────────────────────────────────────────────────
const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4 points
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const RIGHT_EDGE = PAGE_WIDTH - MARGIN;

const COLORS = {
    black:      '#0f172a',
    accent:     '#1e293b',
    muted:      '#64748b',
    faint:      '#94a3b8',
    border:     '#e2e8f0',
    bgLight:    '#f8fafc',
    bgDark:     '#0f172a',
    white:      '#ffffff',
    brand:      '#2563eb',
    green:      '#16a34a',
    red:        '#dc2626',
    amber:      '#d97706',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
const fmtStatus = (s) => (s || 'N/A').replace(/_/g, ' ').toUpperCase();

/**
 * Fetch sale with all related data needed for the PDF
 */
const getSaleData = async (saleId, organizationId) => {
    return Sale.findOne({
        where: { id: saleId, organization_id: organizationId },
        include: [
            { model: Customer, as: 'customer' },
            { model: Distributor, as: 'distributor' },
            { model: Branch, as: 'branch' },
            { model: User, as: 'cashier', attributes: ['name', 'email'] },
            {
                model: SaleItem, as: 'items',
                include: [
                    { model: Product, as: 'product', attributes: ['name', 'code'] },
                    { model: ProductVariant, as: 'variant', attributes: ['name', 'sku', 'barcode'] }
                ]
            },
            { model: SalePayment, as: 'payments' }
        ]
    });
};

/**
 * Fetch org receipt settings (businessName, logo, etc.)
 */
const getReceiptSettings = async (organizationId) => {
    const [org, setting] = await Promise.all([
        Organization.findByPk(organizationId),
        Setting.findOne({ where: { organization_id: organizationId, category: 'receipt' } })
    ]);

    let s = {};
    if (setting?.settings_data) {
        s = typeof setting.settings_data === 'string'
            ? JSON.parse(setting.settings_data)
            : setting.settings_data;
    }

    return {
        businessName: s.businessName || org?.name || 'Business',
        businessAddress: s.businessAddress || org?.address || '',
        businessPhone: s.businessPhone || org?.phone || '',
        businessEmail: s.businessEmail || org?.email || '',
        taxId: s.taxId || org?.tax_id || '',
        businessLogo: s.businessLogo || null,
        logoFilePath: org?.logo || null,
        showLogo: s.showLogo !== false, // default to true if undefined, or map exactly if required. Wait, "if that is enable" implies it is a toggle.
        footerText: s.footerText || 'Thank you for your business!',
        refundPolicy: s.refundPolicy || '',
        showRefundPolicy: s.showRefundPolicy || false,
    };
};

// ─── PDF Builder ───────────────────────────────────────────────────────────────
const buildInvoicePdf = (doc, sale, settings, branchCount = 1) => {
    const items = sale.items || [];
    const payments = sale.payments || [];

    // --- Monochrome Styling Colors ---
    const C = {
        primary: '#000000',      // Black for text
        secondary: '#333333',    // Dark gray for subtext
        muted: '#555555',        // Gray for labels
        border: '#cccccc',       // Light gray for borders
        accent: '#000000',       // Black
        bgLight: '#ffffff',      // White
        success: '#000000',      // Black
        white: '#ffffff',
    };

    let curY = MARGIN;

    // ── HEADER ─────────────────────────────────────────────────────────────────
    let logoHeight = 0;
    const companyX = MARGIN;
    
    // Pre-calculate right side bounds to avoid overlaps
    doc.font('Times-Bold').fontSize(36);
    const rawInvoiceWidth = doc.widthOfString('INVOICE', { characterSpacing: 1 });
    const metaBoxW = Math.max(Math.ceil(rawInvoiceWidth), 190);
    const invoiceStartX = RIGHT_EDGE - metaBoxW - 10;
    
    // Set max name width to stop 20px before the INVOICE text starts
    const maxNameW = Math.max(invoiceStartX - companyX - 20, 150);
    
    let bizNameSize = 22;
    doc.font('Times-Bold');
    
    // Dynamically shrink font size if the name is extremely long
    while (bizNameSize > 12) {
        doc.fontSize(bizNameSize);
        if (doc.widthOfString(settings.businessName.toUpperCase()) <= maxNameW) break;
        bizNameSize -= 1;
    }

    doc.fontSize(bizNameSize).fillColor(C.primary)
        .text(settings.businessName.toUpperCase(), companyX, MARGIN, { width: maxNameW });
    
    // Dynamically calculate the Y position of the address based on the actual rendered height of the business name
    let infoY = MARGIN + doc.heightOfString(settings.businessName.toUpperCase(), { width: maxNameW }) + 6;
    
    doc.font('Inter-Regular').fontSize(9).fillColor(C.secondary);
    if (settings.businessAddress) {
        const addressH = doc.heightOfString(settings.businessAddress, { width: CONTENT_WIDTH * 0.45 });
        doc.text(settings.businessAddress, companyX, infoY, { width: CONTENT_WIDTH * 0.45 });
        infoY += addressH + 4;
    }
    if (settings.businessPhone) {
        doc.text(`Tel: ${settings.businessPhone}`, companyX, infoY); infoY += 14;
    }
    if (settings.businessEmail) {
        doc.text(`Email: ${settings.businessEmail}`, companyX, infoY); infoY += 14;
    }
    if (settings.taxId) {
        doc.font('Inter-Bold').fillColor(C.primary)
            .text(`VAT/TIN: ${settings.taxId}`, companyX, infoY); infoY += 14;
    }

    // Right Side: INVOICE & Meta
    doc.font('Times-Bold').fontSize(36).fillColor(C.primary);
    
    // Draw INVOICE right-aligned to match the box perfectly
    doc.text('INVOICE', invoiceStartX, MARGIN, { width: metaBoxW + 10, align: 'right', characterSpacing: 1 });

    const metaY = MARGIN + 48;
    const metaBoxX = RIGHT_EDGE - metaBoxW;
    const metaBoxY = metaY - 8;
    const metaBoxH = 56; // Reduced height since Cashier is removed

    // Draw rounded bounding box for meta info
    doc.roundedRect(metaBoxX, metaBoxY, metaBoxW, metaBoxH, 4)
        .strokeColor(C.border).lineWidth(1).stroke();

    const drawMeta = (label, value, y) => {
        doc.font('Inter-Bold').fontSize(9).fillColor(C.secondary)
            .text(label, metaBoxX + 8, y, { width: 70, align: 'left' });
        doc.font('Inter-Regular').fontSize(9).fillColor(C.primary)
            .text(value || '—', metaBoxX + 78, y, { width: metaBoxW - 86, align: 'right' });
    };

    drawMeta('Invoice No:', sale.invoice_number || 'DRAFT', metaY);
    drawMeta('Date:', fmtDate(sale.created_at), metaY + 16);
    drawMeta('Time:', fmtTime(sale.created_at), metaY + 32);

    const headerBottomY = Math.max(infoY, metaY + 64, MARGIN + logoHeight) + 15;

    // ── ELEGANT DIVIDER ────────────────────────────────────────────────────────
    doc.moveTo(MARGIN, headerBottomY).lineTo(RIGHT_EDGE, headerBottomY)
        .strokeColor(C.border).lineWidth(1).stroke();
    
    // ── BILLED TO / BRANCH ─────────────────────────────────────────────────────
    let billY = headerBottomY + 20;
    const colW = (CONTENT_WIDTH - 40) / 2;
    const customer = sale.customer || sale.distributor;

    // Left: Billed To
    doc.font('Inter-Bold').fontSize(8).fillColor(C.muted)
        .text('BILLED TO', MARGIN, billY, { characterSpacing: 1 });
    
    if (customer) {
        doc.font('Inter-Bold').fontSize(12).fillColor(C.primary)
            .text(customer.name, MARGIN, billY + 16, { width: colW });
        doc.font('Inter-Regular').fontSize(9).fillColor(C.secondary);
        if (customer.phone) doc.text(`Tel: ${customer.phone}`, MARGIN, billY + 32);
        if (customer.email) doc.text(`Email: ${customer.email}`, MARGIN, billY + 45);
        if (customer.address) doc.text(customer.address, MARGIN, billY + 58, { width: colW, ellipsis: true });
    } else {
        doc.font('Inter-Italic').fontSize(10).fillColor(C.muted)
            .text('Walk-in / Guest Customer', MARGIN, billY + 20);
    }

    // Right: Branch Info
    if (branchCount > 1) {
        const branchX = MARGIN + colW + 40;
        doc.font('Inter-Bold').fontSize(8).fillColor(C.muted)
            .text('BRANCH / LOCATION', branchX, billY, { characterSpacing: 1 });
        
        if (sale.branch) {
            doc.font('Inter-Bold').fontSize(12).fillColor(C.primary)
                .text(sale.branch.name, branchX, billY + 16, { width: colW });
            doc.font('Inter-Regular').fontSize(9).fillColor(C.secondary);
            if (sale.branch.address) doc.text(sale.branch.address, branchX, billY + 32, { width: colW });
            if (sale.branch.phone) doc.text(`Tel: ${sale.branch.phone}`, branchX, billY + 45);
        }
    }

    // ── ITEMS TABLE ────────────────────────────────────────────────────────────
    let tableY = billY + 100;

    const cols = [
        { label: '#',           x: MARGIN,           w: 25,   align: 'center' },
        { label: 'ITEM DESCRIPTION', x: MARGIN + 25, w: 220,  align: 'left'   },
        { label: 'QTY',         x: MARGIN + 245,     w: 40,   align: 'center' },
        { label: 'PRICE',       x: MARGIN + 285,     w: 70,   align: 'right'  },
        { label: 'DISCOUNT',    x: MARGIN + 355,     w: 65,   align: 'right'  },
        { label: 'TOTAL',       x: MARGIN + 420,     w: 95,   align: 'right'  },
    ];

    const drawTableHeader = (yPos) => {
        doc.moveTo(MARGIN, yPos).lineTo(RIGHT_EDGE, yPos).strokeColor(C.primary).lineWidth(1).stroke();
        cols.forEach(c => {
            doc.font('Inter-Bold').fontSize(8).fillColor(C.primary)
                .text(c.label, c.x, yPos + 8, { width: c.w, align: c.align, characterSpacing: 0.5 });
        });
        doc.moveTo(MARGIN, yPos + 26).lineTo(RIGHT_EDGE, yPos + 26).strokeColor(C.primary).lineWidth(1).stroke();
        return yPos + 26;
    };

    tableY = drawTableHeader(tableY);

    // Items
    items.forEach((item, i) => {
        const rowH = 36;
        if (tableY + rowH > PAGE_HEIGHT - 180) { // Keep room for footer
            doc.addPage();
            tableY = drawTableHeader(MARGIN + 20);
        }

        const productName = item.product_name || item.product?.name || item.name || 'Item';
        const variantName = item.variant?.name || item.product_variant?.name || item.variant_name || '';
        const qty = Number(item.quantity);
        const unitPrice = parseFloat(item.unit_price || item.price || 0);
        const discount = parseFloat(item.discount_amount || 0);
        const lineTotal = (unitPrice * qty) - discount;
        
        let descText = productName;
        if (variantName && variantName.toLowerCase() !== 'default') {
            descText = `${productName} (${variantName})`;
        }

        doc.font('Inter-Regular').fontSize(9).fillColor(C.secondary)
            .text(String(i + 1), cols[0].x, tableY + 14, { width: cols[0].w, align: 'center', lineBreak: false });
        
        doc.font('Inter-Bold').fontSize(9.5).fillColor(C.primary)
            .text(descText, cols[1].x + 4, tableY + 10, { width: cols[1].w - 8, lineBreak: false, ellipsis: true });
        
        if (item.product?.code) {
            doc.font('Inter-Regular').fontSize(7.5).fillColor(C.muted)
                .text(`SKU: ${item.product.code}`, cols[1].x + 4, tableY + 22, { width: cols[1].w - 8, lineBreak: false, ellipsis: true });
        }
        
        doc.font('Inter-Bold').fontSize(9.5).fillColor(C.primary)
            .text(String(qty), cols[2].x, tableY + 14, { width: cols[2].w, align: 'center', lineBreak: false });
        
        doc.font('Inter-Regular').fontSize(9.5).fillColor(C.primary)
            .text(fmt(unitPrice), cols[3].x, tableY + 14, { width: cols[3].w - 6, align: 'right', lineBreak: false });
        
        doc.font('Inter-Regular').fontSize(9).fillColor(discount > 0 ? C.accent : C.muted)
            .text(discount > 0 ? `- ${fmt(discount)}` : '—', cols[4].x, tableY + 14, { width: cols[4].w - 6, align: 'right', lineBreak: false });
        
        doc.font('Inter-Bold').fontSize(9.5).fillColor(C.primary)
            .text(fmt(lineTotal), cols[5].x, tableY + 14, { width: cols[5].w - 6, align: 'right', lineBreak: false });

        doc.moveTo(MARGIN, tableY + rowH).lineTo(RIGHT_EDGE, tableY + rowH)
            .strokeColor(C.border).lineWidth(1).stroke();

        tableY += rowH;
    });

    // ── TOTALS & NOTES AREA ────────────────────────────────────────────────────
    let summaryY = tableY + 20;

    // We need about 150px for the totals block. If we don't have it, break page.
    if (summaryY + 150 > PAGE_HEIGHT - 100) {
        doc.addPage();
        summaryY = MARGIN + 20;
    }

    // -- Totals (Right Side) --
    const summaryRight = RIGHT_EDGE;
    const summaryLabelW = 110;
    const summaryValW = 100;
    const summaryLabelX = summaryRight - summaryLabelW - summaryValW;

    const drawSummaryRow = (label, value, y, { bold = false, large = false, color = C.primary } = {}) => {
        const h = large ? 24 : 18;
        const font = bold ? 'Inter-Bold' : 'Inter-Regular';
        const size = large ? 12 : 9;
        
        doc.font(font).fontSize(size).fillColor(bold ? C.primary : C.secondary)
            .text(label, summaryLabelX, y + (h - size) / 2, { width: summaryLabelW, align: 'right' });
        doc.font(bold ? 'Inter-Bold' : 'Inter-Regular').fontSize(size).fillColor(color)
            .text(value, summaryRight - summaryValW, y + (h - size) / 2, { width: summaryValW, align: 'right' });
        return y + h + 4;
    };

    let curTotY = summaryY;
    curTotY = drawSummaryRow('Subtotal', `LKR ${fmt(sale.total_amount)}`, curTotY);
    if (parseFloat(sale.discount_amount) > 0) {
        curTotY = drawSummaryRow('Discount', `- LKR ${fmt(sale.discount_amount)}`, curTotY, { color: C.accent });
    }
    if (parseFloat(sale.tax_amount) > 0) {
        curTotY = drawSummaryRow('VAT / Tax', `LKR ${fmt(sale.tax_amount)}`, curTotY);
    }
    if (parseFloat(sale.adjustment || 0) !== 0) {
        curTotY = drawSummaryRow('Adjustment', `LKR ${fmt(sale.adjustment)}`, curTotY);
    }

    curTotY += 6;
    doc.moveTo(summaryLabelX, curTotY).lineTo(RIGHT_EDGE, curTotY)
        .strokeColor(C.primary).lineWidth(1.5).stroke();
    curTotY += 10;
    
    curTotY = drawSummaryRow('TOTAL PAYABLE', `LKR ${fmt(sale.payable_amount)}`, curTotY, { bold: true, large: true, color: C.primary });
    
    curTotY += 10;
    
    if (payments.length > 0) {
        let totalPaid = 0;
        payments.forEach(pmt => {
            const amt = parseFloat(pmt.amount || 0);
            totalPaid += amt;
            curTotY = drawSummaryRow(`${(pmt.payment_method || 'CASH').toUpperCase()} PAID`, `LKR ${fmt(amt)}`, curTotY, { bold: true, color: C.primary });
        });
        const balance = parseFloat(sale.payable_amount) - totalPaid;
        if (balance > 0.005) {
            curTotY = drawSummaryRow('BALANCE DUE', `LKR ${fmt(balance)}`, curTotY, { bold: true, color: C.primary });
        }
    } else {
        const paidAmt = parseFloat(sale.paid_amount || sale.payable_amount || 0);
        curTotY = drawSummaryRow(`${(sale.payment_method || 'CASH').toUpperCase()} PAID`, `LKR ${fmt(paidAmt)}`, curTotY, { bold: true, color: C.primary });
        const balance = parseFloat(sale.payable_amount) - paidAmt;
        if (balance > 0.005) {
            curTotY = drawSummaryRow('BALANCE DUE', `LKR ${fmt(balance)}`, curTotY, { bold: true, color: C.primary });
        }
    }

    // -- Notes & Terms (Left Side) --
    // Drawn concurrently with Totals, ensuring it doesn't overlap
    const notesX = MARGIN;
    const notesW = CONTENT_WIDTH * 0.45; // Max 45% width to keep away from Totals
    let curNotY = summaryY;

    if (settings.showRefundPolicy && settings.refundPolicy) {
        const textH = doc.heightOfString(settings.refundPolicy, { width: notesW - 20, lineHeight: 1.3 });
        const boxH = textH + 34;

        doc.roundedRect(notesX, curNotY, notesW, boxH, 4)
            .strokeColor(C.border).lineWidth(1).stroke();

        doc.font('Inter-Bold').fontSize(8).fillColor(C.muted)
            .text('TERMS & CONDITIONS', notesX + 10, curNotY + 10, { characterSpacing: 1 });
        doc.font('Inter-Regular').fontSize(8.5).fillColor(C.secondary)
            .text(settings.refundPolicy, notesX + 10, curNotY + 24, { width: notesW - 20, lineHeight: 1.3 });
        curNotY += boxH + 10;
    }

    if (sale.notes) {
        const textH = doc.heightOfString(sale.notes, { width: notesW - 20, lineHeight: 1.3 });
        const boxH = textH + 34;

        doc.roundedRect(notesX, curNotY, notesW, boxH, 4)
            .strokeColor(C.border).lineWidth(1).stroke();

        doc.font('Inter-Bold').fontSize(8).fillColor(C.muted)
            .text('NOTES', notesX + 10, curNotY + 10, { characterSpacing: 1 });
        doc.font('Inter-Regular').fontSize(9).fillColor(C.secondary)
            .text(sale.notes, notesX + 10, curNotY + 24, { width: notesW - 20, lineHeight: 1.3 });
        curNotY += boxH;
    }

    // ── SIGNATURE BLOCK ────────────────────────────────────────────────────────
    let contentBottom = Math.max(curTotY, curNotY) + 60;
    
    // Ensure enough space for the signature before the footer
    if (contentBottom > PAGE_HEIGHT - 120) {
        doc.addPage();
        contentBottom = MARGIN + 60;
    }

    const sigX = MARGIN;
    doc.moveTo(sigX, contentBottom).lineTo(sigX + 160, contentBottom)
        .strokeColor(C.primary).lineWidth(1).stroke();
    doc.font('Inter-Bold').fontSize(8).fillColor(C.primary)
        .text('Authorized Signature', sigX, contentBottom + 6, { width: 160, align: 'center', lineBreak: false });

    // ── FOOTER + WATERMARK (Rendered on EVERY Page) ───────────────────────────
    const pages = doc.bufferedPageRange();

    // Resolve logo path once for the watermark
    const wmLogoPath = (settings.showLogo && settings.logoFilePath)
        ? path.join(process.cwd(), settings.logoFilePath)
        : null;
    const wmLogoExists = wmLogoPath && fs.existsSync(wmLogoPath);

    for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);

        // ── Watermark: Logo centered on every page ──────────────────
        if (wmLogoExists) {
            const wmSize = 550; // bounding box for the watermark
            const wmX = (PAGE_WIDTH - wmSize) / 2;
            const wmY = (PAGE_HEIGHT - wmSize) / 2;

            doc.save();
            doc.opacity(0.04); // even more subtle since it covers the whole page
            try {
                doc.image(wmLogoPath, wmX, wmY, { fit: [wmSize, wmSize], align: 'center', valign: 'center' });
            } catch (e) { /* ignore corrupt image */ }
            doc.restore();
        }

        const footerY = PAGE_HEIGHT - 65;

        // Global Footer Line
        doc.moveTo(MARGIN, footerY).lineTo(RIGHT_EDGE, footerY)
            .strokeColor(C.border).lineWidth(1).stroke();

        doc.font('Inter-Bold').fontSize(10).fillColor(C.primary)
            .text(settings.footerText || 'Thank you for your business!', MARGIN, footerY + 12, { width: CONTENT_WIDTH * 0.7, lineBreak: false, ellipsis: true });

        doc.font('Inter-Regular').fontSize(8).fillColor(C.muted)
            .text(`Generated by Inzeedo ERP System`, MARGIN, footerY + 28, { lineBreak: false });

        doc.font('Inter-Bold').fontSize(8).fillColor(C.muted)
            .text(`Page ${i + 1} of ${pages.count}`, RIGHT_EDGE - 100, footerY + 28, { width: 100, align: 'right', lineBreak: false });
    }
};

// ─── Controller: Stream PDF ────────────────────────────────────────────────────
const generateSaleInvoicePdf = async (req, res, next) => {
    try {
        const { id } = req.params;
        const organization_id = req.user.organization_id;

        const [sale, settings, branchCount] = await Promise.all([
            getSaleData(id, organization_id),
            getReceiptSettings(organization_id),
            Branch.count({ where: { organization_id } })
        ]);

        if (!sale) return errorResponse(res, 'Sale not found', 404);

        const filename = `Invoice-${sale.invoice_number || 'draft'}.pdf`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Cache-Control', 'no-cache');

        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 0 },
            bufferPages: true,
            autoFirstPage: true,
            info: {
                Title: `Invoice ${sale.invoice_number || ''}`,
                Author: settings.businessName,
                Subject: 'Sales Invoice',
                Creator: 'Inzeedo ERP'
            }
        });

        try {
            doc.registerFont('Inter-Regular', path.join(process.cwd(), 'public/fonts/Inter-Regular.ttf'));
            doc.registerFont('Inter-Bold', path.join(process.cwd(), 'public/fonts/Inter-Bold.ttf'));
            doc.registerFont('Inter-Italic', path.join(process.cwd(), 'public/fonts/Inter-Italic.ttf'));
        } catch (e) {
            console.error('Failed to load Inter fonts', e);
        }

        doc.pipe(res);
        buildInvoicePdf(doc, sale, settings, branchCount);
        doc.end();

    } catch (error) {
        next(error);
    }
};

module.exports = { generateSaleInvoicePdf };
