require('dotenv').config();
const db = require('./src/models');
const { Product, ProductVariant, Organization } = db;

async function debugProduct(productId) {
    console.log(`\n--- Debugging Product ID: ${productId} ---`);
    
    try {
        const product = await Product.findByPk(productId, {
            include: [{ model: Organization, as: 'organization', attributes: ['id', 'name'] }]
        });

        if (product) {
            console.log('✅ FOUND in Products table:');
            console.log(`   Name: ${product.name}`);
            console.log(`   Org ID: ${product.organization_id} (${product.organization?.name || 'Unknown'})`);
            console.log(`   Status: ${product.is_active ? 'Active' : 'Inactive'}`);
        } else {
            console.log('❌ NOT FOUND in Products table.');
        }

        const variant = await ProductVariant.findByPk(productId);
        if (variant) {
            console.log('✅ FOUND in ProductVariants table:');
            console.log(`   SKU: ${variant.sku}`);
            console.log(`   Product ID (Parent): ${variant.product_id}`);
            console.log(`   Org ID: ${variant.organization_id}`);
        } else {
            console.log('❌ NOT FOUND in ProductVariants table.');
        }

    } catch (error) {
        console.error('Error during debug:', error);
    } finally {
        process.exit();
    }
}

const targetId = process.argv[2] || '13b937b7-1dfa-4b23-a035-e10b9efe9a92';
debugProduct(targetId);
