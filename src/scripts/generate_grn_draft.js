/**
 * ============================================================
 * SCRIPT: GENERATE DIRECT GRN DRAFT (FOR BROWSER)
 * ============================================================
 * Use this script when a user mistakenly created a large Direct GRN
 * and wants to "edit" it natively in the Direct GRN page without
 * creating a Purchase Order.
 * 
 * This script reads the GRN from the database and generates a 
 * Javascript snippet. The user pastes this snippet into their 
 * browser console, which injects the GRN into the UI's Draft system.
 * 
 * Usage: node src/scripts/generate_grn_draft.js <GRN_NUMBER>
 * Example: node src/scripts/generate_grn_draft.js GRN-20260610-0002
 */

require('dotenv').config({ path: __dirname + '/../../.env' });
const db = require('../models');

const grnNumber = process.argv[2];

if (!grnNumber) {
    console.error('❌ Usage: node generate_grn_draft.js <GRN_NUMBER>');
    process.exit(1);
}

async function generateDraft(grnNumber) {
    try {
        const grn = await db.GRN.findOne({
            where: { grn_number: grnNumber },
            include: [
                { 
                    model: db.GRNItem, 
                    as: 'items',
                    include: [
                        { model: db.Product, as: 'product' },
                        { model: db.ProductVariant, as: 'variant' }
                    ]
                },
                { model: db.Supplier, as: 'supplier' }
            ]
        });

        if (!grn) {
            console.error(`❌ GRN "${grnNumber}" NOT FOUND.`);
            process.exit(1);
        }

        if (!grn.items || grn.items.length === 0) {
            console.error(`❌ GRN "${grnNumber}" has no items.`);
            process.exit(1);
        }

        const draftId = `RECOVERED_${Date.now()}`;
        
        // Format the data exactly as React Hook Form expects it
        const formData = {
            supplierId: grn.supplier_id,
            grnDate: grn.received_date,
            branchId: grn.branch_id,
            invoiceNumber: grn.invoice_number || `INV-${Date.now()}`,
            remarks: grn.notes || "",
            items: grn.items.map(item => {
                const name = item.variant ? `${item.product?.name} - ${item.variant?.name || 'Variant'}` : item.product?.name;
                const sku = item.variant ? (item.variant.sku || item.variant.barcode) : (item.product?.sku || item.product?.barcode);
                
                const cost = parseFloat(item.unit_cost) || 0;
                const selling = parseFloat(item.selling_price) || 0;
                let margin = 30;
                if (cost > 0 && selling > 0) {
                    margin = Number((((selling - cost) / selling) * 100).toFixed(2));
                }

                return {
                    productId: item.product_id,
                    productVariantId: item.product_variant_id || null,
                    name: name || "",
                    sku: sku || "",
                    orderedQty: parseFloat(item.quantity_ordered) || 0,
                    receivedQty: parseFloat(item.quantity_received) || 0,
                    freeQty: parseFloat(item.free_quantity) || 0,
                    unitCost: cost,
                    wholesalePrice: parseFloat(item.wholesale_price) || 0,
                    profitMargin: margin,
                    mrpPrice: parseFloat(item.mrp_price) || selling,
                    sellingPrice: selling,
                    batchNumber: item.batch_number || "",
                    expiryDate: item.expiry_date || undefined
                };
            })
        };

        const draftObject = {
            id: draftId,
            updatedAt: new Date().toISOString(),
            summary: `[RECOVERED] ${grn.supplier?.name || 'Supplier'} - ${grn.items.length} item(s)`,
            data: formData
        };

        const jsonString = JSON.stringify(draftObject);

        console.log('\n============================================================');
        console.log('✅ SCRIPT GENERATED SUCCESSFULLY!');
        console.log('============================================================\n');
        console.log('INSTRUCTIONS FOR THE CUSTOMER:');
        console.log('1. Go to the "Direct GRN" page in the Web App.');
        console.log('2. Right-click anywhere and select "Inspect" (or press F12).');
        console.log('3. Go to the "Console" tab.');
        console.log('4. Copy and paste the ENTIRE block of code below into the console and press Enter:\n');
        
        console.log('// --- COPY START ---');
        console.log(`(function() {
    const drafts = JSON.parse(localStorage.getItem('direct-grn-drafts') || '[]');
    drafts.push(${jsonString});
    localStorage.setItem('direct-grn-drafts', JSON.stringify(drafts));
    
    const url = new URL(window.location.href);
    url.searchParams.set('draftId', '${draftId}');
    window.location.href = url.toString();
})();`);
        console.log('// --- COPY END ---\n');
        
        console.log('5. The page will reload and ALL 100 products will be perfectly loaded into the form!');
        console.log('6. They can now fix the mistake, click Submit, and create the correct Direct GRN.');
        console.log(`7. Finally, run delete_bad_grn.js ${grnNumber} --confirm to delete the bad one.`);

    } catch (error) {
        console.error('❌ Error generating draft:', error);
    } finally {
        process.exit(0);
    }
}

generateDraft(grnNumber);
