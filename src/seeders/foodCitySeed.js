require('dotenv').config();
const {
    sequelize,
    Sequelize,
    Organization,
    Branch,
    Brand,
    Unit,
    MeasurementUnit,
    Container,
    MainCategory,
    SubCategory,
    User,
    Attribute,
    AttributeValue,
    Product,
    ProductVariant,
    VariantAttributeValue,
    Supplier,
    Stock,
    StockOpening,
    ProductBatch,
    Recipe,
    RecipeItem
} = require('../models');
const { Op } = Sequelize;
const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

const seedFoodCity = async () => {
    let t;
    try {
        console.log('🌱 Starting Food City Enterprise Seed (Hybrid Retail + Manufacturing)...');

        // 1. Interactive Organization Selection
        const organizations = await Organization.findAll({
            attributes: ['id', 'name', 'email', 'business_type']
        });

        if (organizations.length === 0) {
            console.error('❌ No organizations found in the database. Please run bootstrap-db.js first.');
            process.exit(1);
        }

        console.log('\nAvailable Organizations:');
        organizations.forEach((org, index) => {
            console.log(`${index + 1}. ${org.name} (${org.email}) - Type: ${org.business_type}`);
        });

        const choice = await askQuestion('\nSelect organization number to seed: ');
        const selectedIndex = parseInt(choice) - 1;

        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= organizations.length) {
            console.error('❌ Invalid selection. Exiting.');
            process.exit(1);
        }

        const org = organizations[selectedIndex];
        const organization_id = org.id;

        if (org.business_type !== 'Manufacturing') {
             console.log(`⚠️  Updating organization business_type to 'Manufacturing' to enable production features...`);
             await Organization.update({ business_type: 'Manufacturing' }, { where: { id: organization_id } });
        }

        const branch = await Branch.findOne({ where: { organization_id, is_main: true } });
        if (!branch) {
            console.error(`❌ No main branch found for organization: ${org.name}`);
            process.exit(1);
        }
        const branch_id = branch.id;

        const adminUser = await User.findOne({ where: { organization_id } });
        const user_id = adminUser ? adminUser.id : (await User.findOne()).id;

        rl.close();

        t = await sequelize.transaction();
        
        // 2. Base Metadata
        const mUnits = [
            { name: 'Kilogram', short_name: 'kg' },
            { name: 'Gram', short_name: 'g' },
            { name: 'Liter', short_name: 'l' },
            { name: 'Milliliter', short_name: 'ml' },
            { name: 'Piece', short_name: 'pc' }
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

        const units = [
            { name: 'Piece', short_name: 'pc' },
            { name: 'Pack', short_name: 'pk' },
            { name: 'Bottle', short_name: 'btl' },
            { name: 'Box', short_name: 'box' },
            { name: 'Kilogram', short_name: 'kg' }
        ];
        const unitMap = {};
        for (const item of units) {
            const [unit] = await Unit.findOrCreate({
                where: { short_name: item.short_name, organization_id },
                defaults: { ...item, id: crypto.randomUUID(), organization_id },
                transaction: t
            });
            unitMap[item.short_name] = unit.id;
        }

        const brands = ['Coca-Cola', 'PepsiCo', 'Nestle', 'Unilever', 'Cargills', 'Keells', 'Maliban', 'Munchee', 'Anchor', 'Highland', 'Inzeedo Industrial', 'Generic'];
        const brandMap = {};
        for (const b of brands) {
            const [brand] = await Brand.findOrCreate({
                where: { name: b, organization_id },
                defaults: { name: b, id: crypto.randomUUID(), organization_id, description: `${b} brand products` },
                transaction: t
            });
            brandMap[b] = brand.id;
        }

        // 3. Categories
        const foodCityData = [
            { category: 'Industrial Production', subs: ['Raw Materials', 'Packaging', 'Semi-Finished'], items: [
                { name: 'Sugar (Industrial)', brand: 'Generic', unit: 'kg', product_type: 'Raw Material' },
                { name: 'Liquid Sugar Syrup', brand: 'Inzeedo Industrial', unit: 'l', product_type: 'Raw Material', cost: 120 },
                { name: 'Cola Concentrate', brand: 'Inzeedo Industrial', unit: 'l', product_type: 'Raw Material', cost: 4500 },
                { name: 'Carbon Dioxide Gas', brand: 'Generic', unit: 'kg', product_type: 'Raw Material', cost: 300 },
                { name: 'Empty PET Bottles', brand: 'Generic', unit: 'pc', product_type: 'Raw Material', cost: 15 },
                { name: 'Inzeedo Classic Cola 500ml', brand: 'Inzeedo Industrial', unit: 'pc', product_type: 'Finished Good', can_be_manufactured: true, price: 150 }
            ]},
            { category: 'Beverages', subs: ['Soft Drinks', 'Milk & Dairy Drinks', 'Fruit Juices'], items: [
                { name: 'Coca Cola', brand: 'Coca-Cola', unit: 'btl', product_type: 'Finished Good' },
                { name: 'Pepsi', brand: 'PepsiCo', unit: 'btl', product_type: 'Finished Good' },
                { name: 'Milo RTD', brand: 'Nestle', unit: 'pk', product_type: 'Finished Good' }
            ]},
            { category: 'Grocery', subs: ['Rice & Pulses', 'Sugar & Salt', 'Noodles'], items: [
                { name: 'Red Raw Rice', brand: 'Generic', unit: 'kg', product_type: 'Finished Good' },
                { name: 'Cargills White Sugar', brand: 'Cargills', unit: 'kg', product_type: 'Finished Good' }
            ]}
        ];

        const mainCatMap = {};
        const subCatMap = {};
        for (const cat of foodCityData) {
            const [mCat] = await MainCategory.findOrCreate({
                where: { name: cat.category, organization_id },
                defaults: { id: crypto.randomUUID(), name: cat.category, organization_id, description: `${cat.category} section` },
                transaction: t
            });
            mainCatMap[cat.category] = mCat.id;

            for (const sub of cat.subs) {
                const [sCat] = await SubCategory.findOrCreate({
                    where: { name: sub, main_category_id: mCat.id, organization_id },
                    defaults: { id: crypto.randomUUID(), name: sub, main_category_id: mCat.id, organization_id, description: `${sub} subsection` },
                    transaction: t
                });
                subCatMap[`${cat.category}:${sub}`] = sCat.id;
            }
        }

        // 4. Attributes
        const attributes = [
            { name: 'Weight/Volume', values: ['500g', '1kg', '500ml', '1L'] }
        ];
        for (const attr of attributes) {
            const [a] = await Attribute.findOrCreate({
                where: { name: attr.name, organization_id },
                defaults: { id: crypto.randomUUID(), name: attr.name, organization_id },
                transaction: t
            });
            for (const val of attr.values) {
                await AttributeValue.findOrCreate({
                    where: { value: val, attribute_id: a.id, organization_id },
                    defaults: { id: crypto.randomUUID(), value: val, attribute_id: a.id, organization_id },
                    transaction: t
                });
            }
        }

        // 5. Stock Opening
        const refNumber = `OPN-FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const [opening] = await StockOpening.findOrCreate({
            where: { reference_number: refNumber, organization_id },
            defaults: {
                id: crypto.randomUUID(),
                organization_id,
                branch_id,
                user_id,
                reference_number: refNumber,
                opening_date: new Date(),
                total_value: 0
            },
            transaction: t
        });

        // 6. Products & Variants
        const manufacturingProductMap = {};
        const manufacturingVariantMap = {};
        let productCounter = 0;

        for (const catGroup of foodCityData) {
            for (const item of catGroup.items) {
                const pCode = `PRD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
                const [product] = await Product.findOrCreate({
                    where: { name: item.name, organization_id },
                    defaults: {
                        id: crypto.randomUUID(),
                        name: item.name,
                        code: pCode,
                        organization_id,
                        brand_id: brandMap[item.brand],
                        main_category_id: mainCatMap[catGroup.category],
                        sub_category_id: subCatMap[`${catGroup.category}:${catGroup.subs[0]}`],
                        unit_id: unitMap[item.unit],
                        product_type: item.product_type || 'Finished Good',
                        can_be_manufactured: item.can_be_manufactured || false
                    },
                    transaction: t
                });

                manufacturingProductMap[item.name] = product.id;

                const vSku = `SKU-${pCode}`;
                const cost = item.cost || 100.00;
                const price = item.price || 150.00;
                const stockQty = (item.product_type === 'Raw Material') ? 1000 : 50;

                const [variant] = await ProductVariant.findOrCreate({
                    where: { product_id: product.id, organization_id },
                    defaults: {
                        id: crypto.randomUUID(),
                        product_id: product.id,
                        organization_id,
                        name: 'Default',
                        sku: vSku,
                        code: vSku,
                        barcode: `BAR-${vSku}`,
                        price: price,
                        wholesale_price: price * 0.9,
                        cost_price: cost,
                        stock_quantity: stockQty,
                        is_default: true
                    },
                    transaction: t
                });

                manufacturingVariantMap[item.name] = variant.id;

                await Stock.findOrCreate({
                    where: { branch_id, product_variant_id: variant.id, organization_id },
                    defaults: {
                        id: crypto.randomUUID(),
                        branch_id,
                        product_id: product.id,
                        product_variant_id: variant.id,
                        quantity: stockQty,
                        organization_id
                    },
                    transaction: t
                });

                if (stockQty > 0) {
                    await ProductBatch.create({
                        id: crypto.randomUUID(),
                        branch_id,
                        product_id: product.id,
                        product_variant_id: variant.id,
                        batch_number: `BAT-${vSku}`,
                        cost_price: cost,
                        selling_price: price,
                        quantity: stockQty,
                        opening_stock_id: opening.id,
                        organization_id,
                        purchase_date: new Date()
                    }, { transaction: t });
                }

                productCounter++;
            }
        }

        // 7. Recipes
        console.log('📜 Seeding Recipes...');
        const colaProdId = manufacturingProductMap['Inzeedo Classic Cola 500ml'];
        const colaVarId = manufacturingVariantMap['Inzeedo Classic Cola 500ml'];

        if (colaProdId && colaVarId) {
            const [recipe] = await Recipe.findOrCreate({
                where: { product_id: colaProdId, organization_id },
                defaults: {
                    id: crypto.randomUUID(),
                    product_id: colaProdId,
                    product_variant_id: colaVarId,
                    organization_id,
                    name: 'Classic Cola Formula',
                    batch_size: 100.000,
                    instructions: 'Industrial mixing protocol.',
                    is_active: true
                },
                transaction: t
            });

            const components = [
                { name: 'Liquid Sugar Syrup', qty: 10 },
                { name: 'Cola Concentrate', qty: 1 },
                { name: 'Carbon Dioxide Gas', qty: 2 },
                { name: 'Empty PET Bottles', qty: 102 }
            ];

            for (const comp of components) {
                const rmProdId = manufacturingProductMap[comp.name];
                const rmVarId = manufacturingVariantMap[comp.name];
                if (rmProdId && rmVarId) {
                    await RecipeItem.findOrCreate({
                        where: { recipe_id: recipe.id, raw_material_variant_id: rmVarId },
                        defaults: {
                            id: crypto.randomUUID(),
                            recipe_id: recipe.id,
                            raw_material_id: rmProdId,
                            raw_material_variant_id: rmVarId,
                            quantity: comp.qty,
                            unit_id: null
                        },
                        transaction: t
                    });
                }
            }
        }

        await t.commit();
        console.log(`✅ Seeded ${productCounter} products correctly with hybrid retail/manufacturing data.`);
        process.exit(0);

    } catch (error) {
        if (t) await t.rollback();
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
};

seedFoodCity();
