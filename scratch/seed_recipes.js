require('dotenv').config();
const path = require('path');
const { 
    sequelize, 
    Product, 
    ProductVariant, 
    Recipe, 
    RecipeItem, 
    Organization 
} = require(path.resolve(__dirname, '../src/models'));
const crypto = require('crypto');

async function seedRecipes() {
    const t = await sequelize.transaction();
    try {
        console.log('🌱 Seeding Manufacturing Recipes...');
        
        // Find the Inzeedo or first organization
        const org = await Organization.findOne();
        if (!org) throw new Error('No organization found');
        const organization_id = org.id;

        // 1. Create a "Custom Soda" product that can be manufactured
        const [soda] = await Product.findOrCreate({
            where: { name: 'Inzeedo Premium Cola', organization_id },
            defaults: {
                id: crypto.randomUUID(),
                name: 'Inzeedo Premium Cola',
                code: 'SODA-COL-001',
                organization_id,
                product_type: 'Standard',
                can_be_manufactured: true,
                is_active: true
            },
            transaction: t
        });

        const [sodaVariant] = await ProductVariant.findOrCreate({
            where: { product_id: soda.id, organization_id },
            defaults: {
                id: crypto.randomUUID(),
                product_id: soda.id,
                organization_id,
                name: '500ml Bottle',
                sku: 'SODA-COL-500ML',
                price: 150,
                cost_price: 80,
                is_active: true
            },
            transaction: t
        });

        // 2. Ensure Raw Materials exist
        const rawMaterials = [
            { name: 'Sugar (Industrial)', code: 'RM-SUG-001' },
            { name: 'Flavoring Agent', code: 'RM-FLV-001' },
            { name: 'CO2 Gas', code: 'RM-CO2-001' }
        ];

        const rmMap = {};
        for (const rm of rawMaterials) {
            const [product] = await Product.findOrCreate({
                where: { name: rm.name, organization_id },
                defaults: {
                    id: crypto.randomUUID(),
                    name: rm.name,
                    code: rm.code,
                    organization_id,
                    product_type: 'Raw Material',
                    can_be_manufactured: false,
                    is_active: true
                },
                transaction: t
            });

            const [variant] = await ProductVariant.findOrCreate({
                where: { product_id: product.id, organization_id },
                defaults: {
                    id: crypto.randomUUID(),
                    product_id: product.id,
                    organization_id,
                    sku: rm.code,
                    price: 0,
                    cost_price: 100, // Dummy cost
                    is_active: true
                },
                transaction: t
            });
            rmMap[rm.name] = variant.id;
        }

        // 3. Create the Recipe
        const [recipe] = await Recipe.findOrCreate({
            where: { product_id: soda.id, organization_id },
            defaults: {
                id: crypto.randomUUID(),
                product_id: soda.id,
                organization_id,
                name: 'Standard Cola Recipe',
                version: '1.0',
                standard_batch_size: 100, // 100 bottles
                instructions: '1. Mix flavor with water. 2. Add sugar. 3. Carbonate. 4. Bottle.',
                is_active: true
            },
            transaction: t
        });

        // 4. Add Recipe Items
        const items = [
            { name: 'Sugar (Industrial)', qty: 5, unit: 'kg' },
            { name: 'Flavoring Agent', qty: 2, unit: 'l' },
            { name: 'CO2 Gas', qty: 1, unit: 'btl' }
        ];

        for (const item of items) {
            await RecipeItem.findOrCreate({
                where: { recipe_id: recipe.id, product_variant_id: rmMap[item.name] },
                defaults: {
                    id: crypto.randomUUID(),
                    recipe_id: recipe.id,
                    product_variant_id: rmMap[item.name],
                    quantity: item.qty,
                    organization_id
                },
                transaction: t
            });
        }

        await t.commit();
        console.log('✅ Manufacturing recipes seeded successfully!');
    } catch (err) {
        await t.rollback();
        console.error('❌ Recipe seeding failed:', err);
    } finally {
        process.exit();
    }
}

seedRecipes();
