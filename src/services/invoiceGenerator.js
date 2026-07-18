const PDFDocument = require('pdfkit');

/**
 * Generate A4 Invoice PDF and return as Buffer (Styled to match frontend A4 Template)
 * @param {Object} sale - Sale object including customer, items, etc.
 * @param {Object} organization - Organization object
 * @returns {Promise<Buffer>}
 */
const generateInvoiceBuffer = (sale, organization) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            const formatCurrency = (val) => parseFloat(val || 0).toLocaleString("en-LK", { minimumFractionDigits: 2 });

            const businessName = organization?.name || 'INZEEDO MANUFACTURING';
            const businessAddress = organization?.address || '';
            const businessPhone = organization?.phone || '';
            const businessEmail = organization?.email || '';

            // --- HEADER ---
            doc.font('Helvetica-Bold').fontSize(24).text(businessName.toUpperCase(), 40, 40);
            
            let yInfo = 70;
            doc.font('Helvetica').fontSize(10);
            if (businessAddress) { doc.text(`Address: ${businessAddress}`, 40, yInfo); yInfo += 15; }
            if (businessPhone) { doc.text(`Phone: ${businessPhone}`, 40, yInfo); yInfo += 15; }
            if (businessEmail) { doc.text(`Email: ${businessEmail}`, 40, yInfo); yInfo += 15; }

            // INVOICE title on the right
            doc.font('Helvetica-Bold').fontSize(28).text('INVOICE', 400, 40, { align: 'right' });
            
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('INV NO:', 400, 80, { width: 60, align: 'right' });
            doc.font('Helvetica').text(sale.invoice_number || 'DRAFT', 470, 80, { align: 'right' });

            doc.font('Helvetica-Bold').text('DATE:', 400, 95, { width: 60, align: 'right' });
            doc.font('Helvetica').text(sale.created_at ? new Date(sale.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0], 470, 95, { align: 'right' });

            // Line separator
            doc.moveTo(40, yInfo + 10).lineTo(555, yInfo + 10).lineWidth(2).strokeColor('#000000').stroke();
            
            let y = yInfo + 30;

            // --- BILLED TO ---
            // Black label box
            doc.rect(40, y, 70, 16).fill('#000000');
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF').text('BILLED TO', 45, y + 4);
            
            y += 25;
            doc.fillColor('#000000');
            if (sale.customer || sale.distributor) {
                const client = sale.customer || sale.distributor;
                doc.fontSize(14).font('Helvetica-Bold').text(client.name, 40, y);
                y += 18;
                doc.fontSize(10).font('Helvetica');
                if (client.phone) { doc.font('Helvetica-Bold').text(`P: `, 40, y, { continued: true }).font('Helvetica').text(client.phone); y += 14; }
                if (client.email) { doc.font('Helvetica-Bold').text(`E: `, 40, y, { continued: true }).font('Helvetica').text(client.email); y += 14; }
                if (client.address) { doc.text(client.address, 40, y); y += 14; }
            } else {
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#666666').text('Walk-in / No Distributor Selected', 40, y);
                doc.fillColor('#000000');
                y += 14;
            }

            y += 20;

            // --- TABLE HEADER ---
            doc.rect(40, y, 515, 20).fill('#000000');
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF');
            doc.text('#', 50, y + 5);
            doc.text('ITEM DESCRIPTION', 80, y + 5);
            doc.text('QTY', 350, y + 5, { width: 50, align: 'center' });
            doc.text('UNIT PRICE', 400, y + 5, { width: 75, align: 'right' });
            doc.text('TOTAL', 475, y + 5, { width: 70, align: 'right' });
            
            y += 25;
            doc.fillColor('#000000');
            doc.lineWidth(1);

            // --- TABLE ROWS ---
            const items = sale.items || sale.sale_items || [];
            items.forEach((item, idx) => {
                doc.font('Helvetica').fontSize(10);
                doc.text((idx + 1).toString(), 50, y);
                
                const itemName = item.product_name || item.product?.name || item.name || 'Item';
                doc.text(itemName, 80, y, { width: 260 });
                
                doc.text(Number(item.quantity).toString(), 350, y, { width: 50, align: 'center' });
                
                const unitPrice = parseFloat(item.unit_price || item.price || 0);
                doc.text(formatCurrency(unitPrice), 400, y, { width: 75, align: 'right' });
                
                const total = unitPrice * item.quantity;
                doc.text(formatCurrency(total), 475, y, { width: 70, align: 'right' });

                y += 20;
            });

            doc.moveTo(40, y).lineTo(555, y).lineWidth(2).strokeColor('#000000').stroke();
            y += 20;

            // --- TOTALS ---
            doc.font('Helvetica-Bold');
            doc.text('Subtotal', 350, y);
            doc.text(formatCurrency(sale.total_amount), 450, y, { width: 95, align: 'right' });
            y += 15;

            if (parseFloat(sale.discount_amount || 0) > 0) {
                doc.text('Discount', 350, y);
                doc.text(`- ${formatCurrency(sale.discount_amount)}`, 450, y, { width: 95, align: 'right' });
                y += 15;
            }

            if (parseFloat(sale.tax_amount || 0) > 0) {
                doc.text('VAT / Tax', 350, y);
                doc.text(formatCurrency(sale.tax_amount), 450, y, { width: 95, align: 'right' });
                y += 15;
            }

            if (parseFloat(sale.adjustment || 0) !== 0) {
                doc.text('Adjustment', 350, y);
                doc.text(formatCurrency(sale.adjustment), 450, y, { width: 95, align: 'right' });
                y += 15;
            }

            y += 10;
            
            // Total Payable Box
            doc.rect(340, y, 215, 30).fill('#000000');
            doc.font('Helvetica-Bold').fontSize(14).fillColor('#FFFFFF');
            doc.text('TOTAL PAYABLE', 350, y + 8);
            doc.text(formatCurrency(sale.payable_amount || sale.net_total), 450, y + 8, { width: 95, align: 'right' });

            y += 45;
            doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold');
            const pmtMethod = sale.payments?.[0]?.payment_method || sale.payment_method || 'CASH';
            doc.text(`AMOUNT PAID (${pmtMethod.toUpperCase()})`, 340, y);
            doc.text(formatCurrency(sale.paid_amount || sale.payable_amount), 450, y, { width: 95, align: 'right' });

            const change = parseFloat(sale.paid_amount || 0) - parseFloat(sale.payable_amount || sale.net_total || 0);
            if (change > 0) {
                y += 15;
                doc.moveTo(340, y).lineTo(555, y).lineWidth(1).dash(2, { space: 2 }).stroke();
                doc.undash();
                y += 5;
                doc.text('CHANGE DUE', 340, y);
                doc.text(formatCurrency(change), 450, y, { width: 95, align: 'right' });
            }

            // --- FOOTER ---
            const footerY = 750;
            doc.moveTo(40, footerY).lineTo(555, footerY).lineWidth(2).stroke();
            doc.fontSize(14).font('Helvetica-Bold').text('THANK YOU FOR YOUR BUSINESS.', 40, footerY + 10);
            
            doc.moveTo(430, footerY + 25).lineTo(555, footerY + 25).lineWidth(1).stroke();
            doc.fontSize(10).font('Helvetica').text('Authorized Signature', 440, footerY + 30);

            doc.fontSize(8).fillColor('#888888').text('GENERATED BY INZEEDO ERP SYSTEM', 0, 800, { align: 'center' });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
};

module.exports = {
    generateInvoiceBuffer
};
