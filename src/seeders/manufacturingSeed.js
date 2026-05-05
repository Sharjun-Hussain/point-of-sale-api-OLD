require('dotenv').config();
const {
    sequelize,
    Sequelize,
    Organization,
    Branch,
    Brand,
    Unit,
    MeasurementUnit,
    MainCategory,
    SubCategory,
    User,
    Product,
    ProductVariant,
    Recipe,
    RecipeItem,
    Supplier,
    Stock,
    ProductBatch,
    StockOpening
} = require('../models');
const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

const seedManufacturing = async () => {
    try {
        console.log('🏭 Starting Industrial Manufacturing Seed...');

        // 1. Interactive Organization Selection
        const organizations = await Organization.findAll({
            attributes: ['id', 'name', 'email']
        });

        if (organizations.length === 0) {
            console.error('❌ No organizations found. Please run master seed first.');
            process.exit(1);
        }

        console.log('\nAvailable Organizations:');
        organizations.forEach((org, index) => {
            console.log(`${index + 1}. ${org.name} (${org.email})`);
        });

        const choice = await askQuestion('\nSelect organization to seed manufacturing data: ');
        const selectedIndex = parseInt(choice) - 1;

        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= organizations.length) {
            console.error('❌ Invalid selection.');
            process.exit(1);
        }

        const org = organizations[selectedIndex];
        const organization_id = org.id;

        const branch = await Branch.findOne({ where: { organization_id, is_main: true } });
        const adminUser = await User.findOne({ where: { organization_id } });
        const user_id = adminUser ? adminUser.id : (await User.findOne()).id;

        console.log(`✅ Selected: ${org.name}`);
        
        const confirm = await askQuestion('\nProceed? This will add Raw Materials, Recipes, and Finished Goods. (y/n): ');
        if (confirm.toLowerCase() !== 'y') {
            console.log('Seed cancelled.');
            process.exit(0);
        }

        rl.close();

        const t = await sequelize.transaction();
        try {
            // 2. Specialized Manufacturing Units
            const mUnits = [
                { name: 'Kilogram', short_name: 'kg' },
                { name: 'Liter', short_name: 'l' },
                { name: 'Milliliter', short_name: 'ml' },
                { name: 'Gram', short_name: 'g' },
                { name: 'Metric Ton', short_name: 'MT' }
            ];
            const mUnitMap = {};
            for (const item of mUnits) {
                const [mUnit] = await MeasurementUnit.findOrCreate({
                    where: { short_name: item.short_name, organization_id },
                    defaults: { ...item, id: crypto.randomUUID(), organization_id },
                    transaction: t
                });
                mUnitMap[item.short_name] = mUnit.id;
            }

            const brands = ['Inzeedo Industrial', 'Generic Inputs', 'Global Flavors'];
            const brandMap = {};
            for (const b of brands) {
                const [brand] = await Brand.findOrCreate({
                    where: { name: b, organization_id },
                    defaults: { name: b, id: crypto.randomUUID(), organization_id },
                    transaction: t
                });
                brandMap[b] = brand.id;
            }

            // 3. Categories
            const mainCat = await MainCategory.findOrCreate({
                where: { name: 'Industrial Production', organization_id },
                defaults: { id: crypto.randomUUID(), name: 'Industrial Production', organization_id },
                transaction: t
            });

            const rawCat = await SubCategory.findOrCreate({
                where: { name: 'Raw Materials', organization_id },
                defaults: { id: crypto.randomUUID(), name: 'Raw Materials', main_category_id: mainCat[0].id, organization_id },
                transaction: t
            });

            const finishCat = await SubCategory.findOrCreate({
                where: { name: 'Finished Goods', organization_id },
                defaults: { id: crypto.randomUUID(), name: 'Finished Goods', main_category_id: mainCat[0].id, organization_id },
                transaction: t
            });

            // 4. Products - Raw Materials
            const rawItems = [
                { name: 'Liquid Sugar Syrup', code: 'RM-SUG-01', unit: 'l', cost: 120 },
                { name: 'Cola Concentrate', code: 'RM-CON-01', unit: 'l', cost: 4500 },
                { name: 'Purified Water', code: 'RM-WAT-01', unit: 'l', cost: 2 },
                { name: 'CO2 Industrial Grade', code: 'RM-CO2-01', unit: 'kg', cost: 300 },
                { name: 'PET Bottle 500ml', code: 'RM-PET-500', unit: 'pc', cost: 15 },
                { name: 'Cola Label', code: 'RM-LBL-01', unit: 'pc', cost: 3 },
                { name: 'Plastic Cap (Red)', code: 'RM-CAP-01', unit: 'pc', cost: 2 }
            ];

            const rmVariantMap = {};
            for (const item of rawItems) {
                const [product] = await Product.findOrCreate({
                    where: { code: item.code, organization_id },
                    defaults: {
                        id: crypto.randomUUID(),
                        name: item.name,
                        code: item.code,
                        organization_id,
                        product_type: 'Raw Material',
                        can_be_manufactured: false,
                        main_category_id: mainCat[0].id,
                        sub_category_id: rawCat[0].id,
                        brand_id: brandMap['Generic Inputs'],
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
                        sku: item.code,
                        price: 0,
                        wholesale_price: 0,
                        cost_price: item.cost,
                        stock_quantity: 1000,
                        is_active: true
                    },
                    transaction: t
                });
                rmVariantMap[item.name] = variant.id;

                // Seed some initial stock
                await Stock.findOrCreate({
                    where: { branch_id: branch.id, product_variant_id: variant.id, organization_id },
                    defaults: {
                        id: crypto.randomUUID(),
                        branch_id: branch.id,
                        product_id: product.id,
                        product_variant_id: variant.id,
                        quantity: 1000,
                        organization_id
                    },
                    transaction: t
                });
            }

            // 5. Products - Finished Goods
            const finishedGoods = [
                { name: 'Inzeedo Classic Cola 500ml', code: 'FG-COLA-500', unit: 'pc', price: 150 },
                { name: 'Inzeedo Diet Cola 500ml', code: 'FG-DIET-500', unit: 'pc', price: 160 }
            ];

            for (const fg of finishedGoods) {
                const [product] = await Product.findOrCreate({
                    where: { code: fg.code, organization_id },
                    defaults: {
                        id: crypto.randomUUID(),
                        name: fg.name,
                        code: fg.code,
                        organization_id,
                        product_type: 'Standard',
                        can_be_manufactured: true,
                        main_category_id: mainCat[0].id,
                        sub_category_id: finishCat[0].id,
                        brand_id: brandMap['Inzeedo Industrial'],
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
                        sku: fg.code,
                        price: fg.price,
                        wholesale_price: fg.price * 0.9,
                        cost_price: 65, // Estimated
                        stock_quantity: 0,
                        is_active: true
                    },
                    transaction: t
                });

                // 6. Seed Recipe for this Finished Good
                const [recipe] = await Recipe.findOrCreate({
                    where: { product_id: product.id, organization_id },
                    defaults: {
                        id: crypto.randomUUID(),
                        product_id: product.id,
                        organization_id,
                        name: `Standard ${fg.name} Recipe`,
                        version: '1.0',
                        standard_batch_size: 500, // 500 bottles per batch
                        instructions: '1. Carbonate Water. 2. Blend Concentrate & Syrup. 3. Bottle and Label.',
                        is_active: true
                    },
                    transaction: t
                });

                // Recipe Components (Per 500 bottles)
                const components = [
                    { name: 'Purified Water', qty: 245 }, // 245L
                    { name: 'Liquid Sugar Syrup', qty: 50 }, // 50L
                    { name: 'Cola Concentrate', qty: 5 }, // 5L
                    { name: 'CO2 Industrial Grade', qty: 10 }, // 10kg
                    { name: 'PET Bottle 500ml', qty: 505 }, // 500 + 1% wastage
                    { name: 'Cola Label', qty: 510 },
                    { name: 'Plastic Cap (Red)', qty: 505 }
                ];

                for (const comp of components) {
                    await RecipeItem.findOrCreate({
                        where: { recipe_id: recipe.id, product_variant_id: rmVariantMap[comp.name] },
                        defaults: {
                            id: crypto.randomUUID(),
                            recipe_id: recipe.id,
                            product_variant_id: rmVariantMap[comp.name],
                            quantity: comp.qty,
                            organization_id
                        },
                        transaction: t
                    });
                }
            }

            await t.commit();
            console.log('✅ Manufacturing Seed Completed Successfully!');
        } catch (err) {
            await t.rollback();
            throw err;
        }
    } catch (error) {
        console.error('❌ Seeding failed:', error);
    } finally {
        process.exit();
    }
};

seedManufacturing();
