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
    PurchaseOrder,
    PurchaseOrderItem,
    GRN,
    GRNItem,
    Sale,
    SaleItem,
    SalePayment,
    SaleReturn,
    SaleReturnItem,
    ExpenseCategory,
    Expense,
    Account,
    Transaction,
    SupplierPayment,
    Cheque,
    Customer,
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

        // Ensure business_type supports manufacturing to show UI
        if (org.business_type !== 'Manufacturing') {
             console.log(`⚠️  Updating organization business_type to 'Manufacturing' to enable production features...`);
             await Organization.update({ business_type: 'Manufacturing' }, { where: { id: organization_id } });
        }

        // Get Main Branch for this Org
        const branch = await Branch.findOne({ where: { organization_id, is_main: true } });
        if (!branch) {
            console.error(`❌ No main branch found for organization: ${org.name}`);
            process.exit(1);
        }
        const branch_id = branch.id;

        // Get Admin User for this Org
        const adminUser = await User.findOne({ where: { organization_id } });
        const user_id = adminUser ? adminUser.id : (await User.findOne()).id;

        console.log(`✅ Selected Org: ${org.name}`);
        console.log(`🏢 Target Branch: ${branch.name} (${branch_id})`);
        
        const confirm = await askQuestion('\nProceed with seeding? (y/n): ');
        if (confirm.toLowerCase() !== 'y') {
            console.log('Seed cancelled.');
            process.exit(0);
        }

        rl.close();

        // Start Transaction
        const t = await sequelize.transaction();
        try {
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

        const brands = ['Coca-Cola', 'PepsiCo', 'Nestle', 'Unilever', 'Cargills', 'Keells', 'Maliban', 'Munchee', 'Anchor', 'Highland', 'Hemas', 'Inzeedo Industrial', 'Generic'];
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
                { name: 'Coca Cola', brand: 'Coca-Cola', unit: 'btl' },
                { name: 'Pepsi', brand: 'PepsiCo', unit: 'btl' },
                { name: 'Milo RTD', brand: 'Nestle', unit: 'pk' },
                { name: 'Elephant House EGB', brand: 'Generic', unit: 'btl' }
            ]},
            { category: 'Grocery', subs: ['Rice & Pulses', 'Sugar & Salt', 'Noodles'], items: [
                { name: 'Red Raw Rice', brand: 'Generic', unit: 'kg' },
                { name: 'Cargills White Sugar', brand: 'Cargills', unit: 'kg' },
                { name: 'Maggi 2 Minute Noodles', brand: 'Nestle', unit: 'pk' }
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

        // 4. Attributes for Variants
        const attributes = [
            { name: 'Weight/Volume', values: ['500g', '1kg', '500ml', '1L', '1.5L'] },
            { name: 'Flavor', values: ['Original', 'Chocolate', 'Vanilla'] }
        ];
        const attrMap = {};
        const attrValueMap = {};
        for (const attr of attributes) {
            const [a] = await Attribute.findOrCreate({
                where: { name: attr.name, organization_id },
                defaults: { id: crypto.randomUUID(), name: attr.name, organization_id },
                transaction: t
            });
            attrMap[attr.name] = a.id;
            for (const val of attr.values) {
                const [av] = await AttributeValue.findOrCreate({
                    where: { value: val, attribute_id: a.id, organization_id },
                    defaults: { id: crypto.randomUUID(), value: val, attribute_id: a.id, organization_id },
                    transaction: t
                });
                attrValueMap[`${attr.name}:${val}`] = av.id;
            }
        }

        // 5. Stock Opening Header
        const refNumber = `OPN-FOODCITY-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const [opening] = await StockOpening.findOrCreate({
            where: { reference_number: refNumber, organization_id },
            defaults: {
                id: crypto.randomUUID(),
                organization_id,
                branch_id,
                user_id,
                reference_number: refNumber,
                opening_date: new Date(),
                notes: 'Food City hybrid initial stock bootstrap',
                total_value: 1500000.00
            },
            transaction: t
        });

        // 6. Loop and Create Products
        let totalVariantsCount = 0;
        let productCounter = 0;
        const usedCodes = new Set();
        const usedSkus = new Set();
        const usedBarcodes = new Set();
        const allCreatedVariants = [];
        const manufacturingVariantMap = {};

        const generateCode = (prefix) => {
            let code;
            do {
                code = `${prefix}-${Math.floor(10000 + Math.random() * 90000)}`;
            } while (usedCodes.has(code));
            usedCodes.add(code);
            return code;
        };

        const generateSku = (prefix) => {
            let sku;
            do {
                sku = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
            } while (usedSkus.has(sku));
            usedSkus.add(sku);
            return sku;
        };

        const generateBarcode = () => {
            let barcode;
            do {
                barcode = Math.floor(Math.random() * 900000000000 + 100000000000).toString();
            } while (usedBarcodes.has(barcode));
            usedBarcodes.add(barcode);
            return barcode;
        };

        for (const catGroup of foodCityData) {
            for (const item of catGroup.items) {
                const isMultiVariant = !item.can_be_manufactured && item.product_type !== 'Raw Material' && Math.random() > 0.5;
                const pCode = generateCode(item.name.substring(0, 3).toUpperCase());

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
                        is_active: true,
                        is_variant: isMultiVariant,
                        product_type: item.product_type || 'Finished Good',
                        can_be_manufactured: item.can_be_manufactured || false
                    },
                    transaction: t
                });

                let variantsToCreate = [{ name: null, attr: null, val: null }];
                if (isMultiVariant) {
                    variantsToCreate = ['Small', 'Large'].map(v => ({ name: `${item.name} ${v}`, attr: 'Weight/Volume', val: v }));
                }

                for (const vData of variantsToCreate) {
                    const vSku = generateSku(pCode);
                    const vBarcode = generateBarcode();
                    const cost = item.cost || parseFloat((50 + Math.random() * 500).toFixed(2));
                    const price = item.price || parseFloat((cost * 1.25).toFixed(2));
                    const stockQty = (item.product_type === 'Raw Material') ? 1000 : Math.floor(20 + Math.random() * 200);

                    const [variant] = await ProductVariant.findOrCreate({
                        where: { name: vData.name, product_id: product.id, organization_id },
                        defaults: {
                            id: crypto.randomUUID(),
                            product_id: product.id,
                            organization_id,
                            name: vData.name,
                            sku: vSku,
                            code: vSku,
                            barcode: vBarcode,
                            price: price,
                            cost_price: cost,
                            stock_quantity: stockQty,
                            is_active: true
                        },
                        transaction: t
                    });

                    if (item.product_type === 'Raw Material' || item.can_be_manufactured) {
                        manufacturingVariantMap[item.name] = variant.id;
                    }

                    // Create Stock & Batch
                    const [stock, created] = await Stock.findOrCreate({
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

                    if (created && stockQty > 0) {
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

                    totalVariantsCount++;
                    if (allCreatedVariants.length < 50) allCreatedVariants.push(variant);
                }
                productCounter++;
            }
        }

        // 7. Manufacturing Recipes (BOM)
        console.log('📜 Seeding Manufacturing Recipes...');
        const colaProduct = await Product.findOne({ where: { name: 'Inzeedo Classic Cola 500ml', organization_id }, transaction: t });
        if (colaProduct) {
            const [recipe] = await Recipe.findOrCreate({
                where: { product_id: colaProduct.id, organization_id },
                defaults: {
                    id: crypto.randomUUID(),
                    product_id: colaProduct.id,
                    organization_id,
                    name: 'Industrial Cola Recipe',
                    version: '1.0',
                    standard_batch_size: 100,
                    instructions: 'Mix concentrate with water and syrup. Carbonate and bottle.',
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
                const variantId = manufacturingVariantMap[comp.name];
                if (variantId) {
                    await RecipeItem.findOrCreate({
                        where: { recipe_id: recipe.id, product_variant_id: variantId },
                        defaults: {
                            id: crypto.randomUUID(),
                            recipe_id: recipe.id,
                            product_variant_id: variantId,
                            quantity: comp.qty,
                            organization_id
                        },
                        transaction: t
                    });
                }
            }
            console.log('✅ Created BOM for Inzeedo Classic Cola.');
        }

        // 8. Suppliers & Accounts (Minimal for this demo)
        const [supplier] = await Supplier.findOrCreate({
            where: { name: 'Industrial Supplies Ltd', organization_id },
            defaults: { id: crypto.randomUUID(), name: 'Industrial Supplies Ltd', phone: '0112233445', organization_id },
            transaction: t
        });

        await t.commit();
        console.log(`✅ Seeded ${productCounter} products Correctly.`);
        console.log(`✅ Seeded ${totalVariantsCount} variants with opening stocks.`);
        console.log('✨ Food City Seeding Completed Successfully!');
        process.exit(0);

    } catch (error) {
        if (t) await t.rollback();
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
    } catch (outerError) {
        console.error('❌ Script failed:', outerError);
        process.exit(1);
    }
};

seedFoodCity();
