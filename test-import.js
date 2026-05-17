require('dotenv').config();
const { Product, ProductVariant, MainCategory, SubCategory, Brand, Unit, StockOpening, ProductBatch, Stock, Branch, Organization, User } = require('./src/models');
const { Op } = require('sequelize');

async function run() {
    const org = await Organization.findOne();
    const user = await User.findOne({ where: { organization_id: org.id } });
    const p = { name: "Test Bread 400g v3", cost_price: 10, selling_price: 20, stock_qty: 10 };
    const organization_id = org.id;
    const index = 0;
    
    try {
        const [category] = await MainCategory.findOrCreate({
            where: { organization_id, name: p.main_category || 'Uncategorized' }
        });
        
        const [product, productCreated] = await Product.findOrCreate({
            where: {
                organization_id,
                [Op.or]: [
                    { name: p.name },
                    { code: p.code || '___NON_EXISTENT_CODE___' }
                ]
            },
            defaults: {
                name: p.name,
                code: p.code || `PRD-${Date.now()}-${index}`,
                main_category_id: category.id,
                description: p.description || '',
                sku: p.sku || p.code,
                barcode: p.barcode || p.code,
                is_active: true,
                is_variant: false,
                product_type: p.product_type || 'Finished Good'
            }
        });

        const variantSku = p.sku || p.code || `${product.code}-DEF`;
        const [variant, variantCreated] = await ProductVariant.findOrCreate({
            where: {
                organization_id,
                product_id: product.id,
                sku: variantSku
            },
            defaults: {
                name: p.variant_name || (productCreated ? 'Default' : `Variant ${variantSku}`),
                sku: variantSku,
                code: p.code || product.code,
                barcode: p.barcode || p.code || product.barcode,
                price: parseFloat(p.selling_price || 0),
                cost_price: parseFloat(p.cost_price || 0),
                mrp_price: parseFloat(p.mrp_price || 0),
                wholesale_price: parseFloat(p.wholesale_price || 0),
                low_stock_threshold: parseFloat(p.low_stock_threshold || 10),
                stock_quantity: 0,
                is_active: true,
                is_default: productCreated
            }
        });

        const stockQty = parseFloat(p.stock_qty || 0);
        let branch_id = user.branch_id;
        if (!branch_id) {
            const firstBranch = await Branch.findOne({ where: { organization_id } });
            branch_id = firstBranch ? firstBranch.id : null;
        }
        
        if (branch_id) {
            const reference_number = `IMP-OS-${product.code}-${Date.now()}-${index}`;
            const opening = await StockOpening.create({
                organization_id,
                branch_id,
                user_id: user.id,
                reference_number,
                opening_date: new Date(),
                notes: 'Automatic opening stock from bulk import',
                total_value: stockQty * parseFloat(p.cost_price || 0)
            });

            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const finalBatchNumber = p.batch_number || `BT-IMP-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

            await ProductBatch.create({
                organization_id,
                branch_id,
                product_id: product.id,
                product_variant_id: variant.id,
                batch_number: finalBatchNumber,
                expiry_date: p.expiry_date ? new Date(p.expiry_date) : null,
                quantity: stockQty,
                cost_price: parseFloat(p.cost_price || 0),
                selling_price: parseFloat(p.selling_price || 0),
                mrp_price: parseFloat(p.mrp_price || 0),
                wholesale_price: parseFloat(p.wholesale_price || 0),
                purchase_date: new Date(),
                is_active: true,
                opening_stock_id: opening.id
            });

            const [stockRecord] = await Stock.findOrCreate({
                where: {
                    organization_id,
                    branch_id,
                    product_id: product.id,
                    product_variant_id: variant.id
                },
                defaults: { quantity: 0 }
            });
            await stockRecord.increment('quantity', { by: stockQty });
        }
        console.log("Success with stock");
    } catch (err) {
        console.error("Error:", err.message);
        if (err.errors) console.error("Details:", err.errors.map(e => e.message));
    }
    process.exit(0);
}
run();
