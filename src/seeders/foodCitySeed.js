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
    Customer
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
        console.log('🌱 Starting Food City Enterprise Seed...');

        // 1. Interactive Organization Selection
        const organizations = await Organization.findAll({
            attributes: ['id', 'name', 'email']
        });

        if (organizations.length === 0) {
            console.error('❌ No organizations found in the database. Please run bootstrap-db.js first.');
            process.exit(1);
        }

        console.log('\nAvailable Organizations:');
        organizations.forEach((org, index) => {
            console.log(`${index + 1}. ${org.name} (${org.email})`);
        });

        const choice = await askQuestion('\nSelect organization number to seed: ');
        const selectedIndex = parseInt(choice) - 1;

        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= organizations.length) {
            console.error('❌ Invalid selection. Exiting.');
            process.exit(1);
        }

        const org = organizations[selectedIndex];
        const organization_id = org.id;

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

        const brands = ['Coca-Cola', 'PepsiCo', 'Nestle', 'Unilever', 'Cargills', 'Keells', 'Maliban', 'Munchee', 'Anchor', 'Highland', 'Hemas', 'Generic'];
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
            { category: 'Beverages', subs: ['Soft Drinks', 'Milk & Dairy Drinks', 'Fruit Juices', 'Tea & Coffee'], items: [
                { name: 'Coca Cola', brand: 'Coca-Cola', unit: 'btl' },
                { name: 'Pepsi', brand: 'PepsiCo', unit: 'btl' },
                { name: 'Sprite', brand: 'Coca-Cola', unit: 'btl' },
                { name: '7Up', brand: 'PepsiCo', unit: 'btl' },
                { name: 'Milo RTD', brand: 'Nestle', unit: 'pk' },
                { name: 'Elephant House EGB', brand: 'Generic', unit: 'btl' },
                { name: 'Highland Fresh Milk', brand: 'Highland', unit: 'pk' },
                { name: 'Nescafé Classic', brand: 'Nestle', unit: 'box' },
                { name: 'Dilmah Ceylon Tea', brand: 'Generic', unit: 'box' },
                { name: 'Red Bull Energy', brand: 'Generic', unit: 'pk' },
                { name: 'Smirnoff Ice', brand: 'Generic', unit: 'btl' }
            ]},
            { category: 'Snacks & Confectionery', subs: ['Biscuits', 'Chocolates', 'Chips', 'Cakes'], items: [
                { name: 'Munchee Super Cream Cracker', brand: 'Munchee', unit: 'pk' },
                { name: 'Maliban Lemon Puff', brand: 'Maliban', unit: 'pk' },
                { name: 'Cadbury Dairy Milk', brand: 'Generic', unit: 'pc' },
                { name: 'KitKat 4 Finger', brand: 'Nestle', unit: 'pc' },
                { name: 'Kist Potato Chips', brand: 'Cargills', unit: 'pk' },
                { name: 'Tiara Layer Cake', brand: 'Generic', unit: 'pk' },
                { name: 'Pringles Original', brand: 'Generic', unit: 'pc' },
                { name: 'Ritzbury Revello', brand: 'Generic', unit: 'pc' },
                { name: 'Toblerone Milk', brand: 'Generic', unit: 'pc' },
                { name: 'Lays Magic Masala', brand: 'PepsiCo', unit: 'pk' }
            ]},
            { category: 'Dairy & Chilled', subs: ['Cheese & Butter', 'Yogurt', 'Ice Cream'], items: [
                { name: 'Anchor New Zealand Butter', brand: 'Anchor', unit: 'pc' },
                { name: 'Happy Cow Cheese', brand: 'Generic', unit: 'box' },
                { name: 'Highland Yogurt Cup', brand: 'Highland', unit: 'pc' },
                { name: 'Newdale Fruit Yogurt', brand: 'Generic', unit: 'pc' },
                { name: 'Cargills Magic Vanilla', brand: 'Cargills', unit: 'box' },
                { name: 'Kotmale Cheddar Cheese', brand: 'Generic', unit: 'pc' },
                { name: 'Elephant House Pani Ice Cream', brand: 'Generic', unit: 'box' }
            ]},
            { category: 'Grocery', subs: ['Rice & Pulses', 'Sugar & Salt', 'Flour', 'Oils', 'Noodles & Pasta'], items: [
                { name: 'Keerthi Red Raw Rice', brand: 'Generic', unit: 'kg' },
                { name: 'Araliya White Nadu Rice', brand: 'Generic', unit: 'kg' },
                { name: 'Cargills White Sugar', brand: 'Cargills', unit: 'kg' },
                { name: 'Sanstha Table Salt', brand: 'Generic', unit: 'pk' },
                { name: 'Prima All Purpose Flour', brand: 'Generic', unit: 'kg' },
                { name: 'Fortune Vegetable Oil', brand: 'Generic', unit: 'btl' },
                { name: 'Maggi 2 Minute Noodles', brand: 'Nestle', unit: 'pk' },
                { name: 'Knorr Chicken Soup', brand: 'Unilever', unit: 'pk' },
                { name: 'Marina Coconut Oil', brand: 'Generic', unit: 'btl' },
                { name: 'Dahl Masoor', brand: 'Generic', unit: 'kg' },
                { name: 'Basmati Rice Premium', brand: 'Generic', unit: 'kg' }
            ]},
            { category: 'Meat & Frozen', subs: ['Chicken', 'Sausages', 'Frozen Vegetables'], items: [
                { name: 'Maxies Whole Chicken', brand: 'Generic', unit: 'kg' },
                { name: 'Keells Chicken Sausages', brand: 'Keells', unit: 'pk' },
                { name: 'Cargills Beef Meatballs', brand: 'Cargills', unit: 'pk' },
                { name: 'Frozen Mixed Veggies', brand: 'Generic', unit: 'pk' },
                { name: 'Elephant House Chicken Bockwurst', brand: 'Generic', unit: 'pk' },
                { name: 'Pork Bacon Slices', brand: 'Generic', unit: 'pk' }
            ]},
            { category: 'Household & Personal Care', subs: ['Soaps', 'Detergents', 'Oral Care', 'Paper Products'], items: [
                { name: 'Sunlight Lemon Soap', brand: 'Unilever', unit: 'pc' },
                { name: 'Lux Soft Touch', brand: 'Unilever', unit: 'pc' },
                { name: 'Surf Excel Matic', brand: 'Unilever', unit: 'pk' },
                { name: 'Vim Dishwash Liquid', brand: 'Unilever', unit: 'btl' },
                { name: 'Signal Strong Teeth', brand: 'Unilever', unit: 'pk' },
                { name: 'Flora Facial Tissues', brand: 'Generic', unit: 'pk' },
                { name: 'Lifebuoy Total 10', brand: 'Unilever', unit: 'pc' },
                { name: 'Dettol Antiseptic', brand: 'Generic', unit: 'btl' },
                { name: 'Harpic Power Plus', brand: 'Generic', unit: 'btl' },
                { name: 'Colgate Total', brand: 'Generic', unit: 'pk' },
                { name: 'Pears Baby Soap', brand: 'Unilever', unit: 'pc' }
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
            { name: 'Size', values: ['Small', 'Medium', 'Large', 'Family Pack', 'Value Pack'] },
            { name: 'Weight/Volume', values: ['100g', '250g', '500g', '1kg', '2kg', '5kg', '10kg', '180ml', '250ml', '500ml', '1L', '1.5L', '2L'] },
            { name: 'Flavor', values: ['Original', 'Chocolate', 'Vanilla', 'Strawberry', 'Lemon', 'Spicy'] }
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
                notes: 'Food City initial stock bootstrap',
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
                if (productCounter >= 55) break; 

                const isMultiVariant = Math.random() > 0.3; // 70% chance of being multi-variant
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
                        is_variant: isMultiVariant
                    },
                    transaction: t
                });

                // Determine variant options based on category
                let variantsToCreate = [];
                if (!isMultiVariant) {
                    // Single variant (Master Default)
                    variantsToCreate = [{ name: null, attr: null, val: null }];
                } else {
                    if (catGroup.category === 'Beverages') {
                        variantsToCreate = ['180ml', '250ml', '500ml', '1L', '1.5L', '2L'].map(v => ({ name: `${item.name} ${v}`, attr: 'Weight/Volume', val: v }));
                    } else if (catGroup.category === 'Grocery') {
                        variantsToCreate = ['500g', '1kg', '2kg', '5kg', '10kg'].map(v => ({ name: `${item.name} ${v}`, attr: 'Weight/Volume', val: v }));
                    } else if (catGroup.category === 'Snacks & Confectionery') {
                        variantsToCreate = ['Small', 'Medium', 'Large', 'Family Pack', 'Value Pack'].map(v => ({ name: `${item.name} ${v}`, attr: 'Size', val: v }));
                    } else if (catGroup.category === 'Dairy & Chilled') {
                        variantsToCreate = ['Original', 'Strawberry', 'Vanilla', 'Chocolate', 'Lemon'].map(v => ({ name: `${item.name} ${v}`, attr: 'Flavor', val: v }));
                    } else if (catGroup.category === 'Household & Personal Care') {
                        variantsToCreate = ['100g', '250g', '500g', '1kg', '1L', '2L'].map(v => ({ name: `${item.name} ${v}`, attr: 'Weight/Volume', val: v }));
                    } else {
                        variantsToCreate = ['Value Pack', 'Family Pack'].map(v => ({ name: `${item.name} ${v}`, attr: 'Size', val: v }));
                    }
                }

                for (const vData of variantsToCreate) {
                    if (totalVariantsCount >= 250) break; 

                    const vSku = generateSku(pCode);
                    const vBarcode = generateBarcode();
                    const cost = parseFloat((50 + Math.random() * 500).toFixed(2));
                    const price = parseFloat((cost * 1.25).toFixed(2));
                    const stockQty = Math.floor(20 + Math.random() * 200);

                    const [variant] = await ProductVariant.findOrCreate({
                        where: { 
                            name: vData.name, 
                            product_id: product.id, 
                            organization_id 
                        },
                        defaults: {
                            id: crypto.randomUUID(),
                            product_id: product.id,
                            organization_id,
                            name: vData.name,
                            sku: vSku,
                            code: vSku, // Use SKU as the variant code for uniqueness
                            barcode: vBarcode,
                            price: price,
                            cost_price: cost,
                            stock_quantity: stockQty,
                            is_active: true
                        },
                        transaction: t
                    });

                    // Update existing ones if they missing SKU/Barcode/Code or Prices from previous run
                    if (!variant.sku || !variant.barcode || !variant.code || !variant.cost_price || !variant.price) {
                        variant.sku = variant.sku || vSku;
                        variant.barcode = variant.barcode || vBarcode;
                        variant.code = variant.code || variant.sku || vSku;
                        variant.cost_price = variant.cost_price || cost;
                        variant.price = variant.price || price;
                        await variant.save({ transaction: t });
                    }

                    // Link Attributes
                    if (vData.attr && vData.val) {
                        const attrValId = attrValueMap[`${vData.attr}:${vData.val}`];
                        if (attrValId) {
                            await VariantAttributeValue.findOrCreate({
                                where: { product_variant_id: variant.id, attribute_value_id: attrValId, organization_id },
                                defaults: {
                                    id: crypto.randomUUID(),
                                    product_variant_id: variant.id,
                                    attribute_value_id: attrValId,
                                    organization_id
                                },
                                transaction: t
                            });
                        }
                    }

                    // Create Stock Record
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

                    // Create Product Batch (Opening Stock)
                    if (created) {
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
                    // Collect some variants for later seeding (PO, Sales, etc)
                    if (allCreatedVariants.length < 50) allCreatedVariants.push(variant);
                }
                productCounter++;
            }
        }

        // 7. Suppliers
        console.log('🚚 Seeding Suppliers...');
        const suppliersData = [
            { name: 'Unilever Sri Lanka', contact: '0112345678', email: 'orders@unilever.lk' },
            { name: 'Coca-Cola Beverages', contact: '0119876543', email: 'sales@coca-cola.lk' },
            { name: 'Ceylon Cold Stores', contact: '0115554433', email: 'info@ccs.lk' },
            { name: 'Cargills Quality Foods', contact: '0112221100', email: 'supplies@cargills.lk' }
        ];
        const supplierMap = {};
        for (const s of suppliersData) {
            const [supplier] = await Supplier.findOrCreate({
                where: { name: s.name, organization_id },
                defaults: { 
                    id: crypto.randomUUID(), 
                    name: s.name,
                    phone: s.contact,
                    email: s.email,
                    organization_id 
                },
                transaction: t
            });
            supplierMap[s.name] = supplier.id;
        }

        // 8. Accounts & Customers
        console.log('🏦 Seeding Accounts & Customers...');
        const accountsData = [
            { name: 'Main Cash', code: 'ACC-CASH-001', type: 'asset', initial_balance: 50000 },
            { name: 'HNB Bank Account', code: 'ACC-BANK-001', type: 'asset', initial_balance: 1500000 },
            { name: 'Petty Cash', code: 'ACC-PC-001', type: 'asset', initial_balance: 5000 }
        ];
        const accountMap = {};
        for (const acc of accountsData) {
            const [account] = await Account.findOrCreate({
                where: { code: acc.code, organization_id },
                defaults: { 
                    id: crypto.randomUUID(), 
                    name: acc.name,
                    code: acc.code,
                    type: acc.type,
                    balance: acc.initial_balance || 0,
                    organization_id 
                },
                transaction: t
            });
            accountMap[acc.name] = account.id;
        }

        const customerData = [
            { name: 'Walking Customer', phone: '0000000000' },
            { name: 'Loyal Customer - Kamal', phone: '0771234567', email: 'kamal@example.com' },
            { name: 'Credit Customer - Nimal', phone: '0719876543', credit_limit: 50000 }
        ];
        const customerMap = {};
        for (const c of customerData) {
            const [customer] = await Customer.findOrCreate({
                where: { phone: c.phone, organization_id },
                defaults: { ...c, id: crypto.randomUUID(), organization_id },
                transaction: t
            });
            customerMap[c.name] = customer.id;
        }

        // 9. Expenses
        console.log('💸 Seeding Expenses...');
        const expCat = ['Utilities', 'Rent', 'Salary', 'Maintenance'];
        const expCatMap = {};
        for (const cat of expCat) {
            const [ec] = await ExpenseCategory.findOrCreate({
                where: { name: cat, organization_id },
                defaults: { id: crypto.randomUUID(), name: cat, organization_id },
                transaction: t
            });
            expCatMap[cat] = ec.id;
        }
        await Expense.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            expense_category_id: expCatMap['Utilities'],
            amount: 15500.00,
            date: new Date(),
            description: 'Electricity Bill - March 2024',
            status: 'paid',
            user_id
        }, { transaction: t });

        // 10. Purchase Orders & GRNs
        console.log('📦 Seeding Purchase Orders & GRNs...');
        const poRef = `PO-FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const po = await PurchaseOrder.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            supplier_id: supplierMap['Unilever Sri Lanka'],
            po_number: poRef,
            po_date: new Date(),
            expected_date: new Date(Date.now() + 86400000 * 2),
            status: 'received',
            total_amount: 12500.00,
            user_id
        }, { transaction: t });

        // Add 2 items to PO
        const poItems = allCreatedVariants.slice(0, 2);
        for (const v of poItems) {
            const cost = v.cost_price || 0;
            await PurchaseOrderItem.create({
                id: crypto.randomUUID(),
                purchase_order_id: po.id,
                product_id: v.product_id,
                product_variant_id: v.id,
                quantity: 50,
                unit_cost: cost,
                total_amount: 50 * cost,
                organization_id
            }, { transaction: t });
        }

        // Connected GRN
        const grnRef = `GRN-FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const grn = await GRN.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            supplier_id: po.supplier_id,
            purchase_order_id: po.id,
            grn_number: grnRef,
            received_date: new Date(),
            status: 'completed',
            total_amount: po.total_amount,
            user_id
        }, { transaction: t });

        for (const v of poItems) {
            const batchNum = `BAT-GRN-${v.sku}`;
            const [batch] = await ProductBatch.findOrCreate({
                where: { batch_number: batchNum, organization_id },
                defaults: {
                    id: crypto.randomUUID(),
                    organization_id,
                    branch_id,
                    product_id: v.product_id,
                    product_variant_id: v.id,
                    batch_number: batchNum,
                    quantity: 50,
                    cost_price: v.cost_price,
                    selling_price: v.price,
                    purchase_date: new Date()
                },
                transaction: t
            });

            const cost = v.cost_price || 0;
            await GRNItem.create({
                id: crypto.randomUUID(),
                grn_id: grn.id,
                product_id: v.product_id,
                product_variant_id: v.id,
                quantity_ordered: 50,
                quantity_received: 50,
                unit_cost: cost,
                total_amount: 50 * cost,
                product_batch_id: batch.id,
                batch_number: batchNum,
                organization_id
            }, { transaction: t });
        }

        // 11. Sales & Payments
        console.log('💰 Seeding Sales & Payments...');
        const saleItems = allCreatedVariants.slice(5, 8);
        const invRef = `INV-FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const sale = await Sale.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            customer_id: customerMap['Walking Customer'],
            user_id,
            invoice_number: invRef,
            sale_date: new Date(),
            total_amount: 1500.00,
            payable_amount: 1500.00,
            paid_amount: 1500.00,
            payment_status: 'paid',
            status: 'completed'
        }, { transaction: t });

        for (const v of saleItems) {
            await SaleItem.create({
                id: crypto.randomUUID(),
                sale_id: sale.id,
                product_id: v.product_id,
                product_variant_id: v.id,
                quantity: 2,
                unit_price: v.price,
                total_amount: 2 * v.price,
                organization_id
            }, { transaction: t });
        }

        await SalePayment.create({
            id: crypto.randomUUID(),
            sale_id: sale.id,
            payment_method: 'cash',
            amount: 1500.00,
            payment_date: new Date()
        }, { transaction: t });

        // Cheque Sale
        const chequeInv = `INV-CHQ-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const saleChq = await Sale.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            customer_id: customerMap['Loyal Customer - Kamal'],
            user_id,
            invoice_number: chequeInv,
            sale_date: new Date(),
            total_amount: 5000.00,
            payable_amount: 5000.00,
            paid_amount: 5000.00,
            payment_status: 'paid',
            payment_method: 'cheque',
            status: 'completed'
        }, { transaction: t });

        await Cheque.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            type: 'receivable',
            reference_id: saleChq.id,
            cheque_number: 'CHQ-123456',
            bank_name: 'Sampath Bank',
            amount: 5000.00,
            due_date: new Date(Date.now() + 86400000 * 7),
            status: 'pending'
        }, { transaction: t });

        // Credit Sale
        const creditInv = `INV-CR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const saleCredit = await Sale.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            customer_id: customerMap['Credit Customer - Nimal'],
            user_id,
            invoice_number: creditInv,
            sale_date: new Date(),
            total_amount: 2500.00,
            payable_amount: 2500.00,
            paid_amount: 0.00,
            payment_status: 'unpaid',
            status: 'completed'
        }, { transaction: t });

        // 12. Returns
        console.log('🔄 Seeding Returns...');
        const sReturn = await SaleReturn.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            sale_id: sale.id,
            return_number: `SLR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            return_date: new Date(),
            total_amount: 500.00,
            user_id
        }, { transaction: t });

        await SaleReturnItem.create({
            id: crypto.randomUUID(),
            sale_return_id: sReturn.id,
            product_id: saleItems[0].product_id,
            product_variant_id: saleItems[0].id,
            quantity: 1,
            unit_price: saleItems[0].price,
            total_amount: saleItems[0].price,
            organization_id
        }, { transaction: t });

        // 13. Supplier Settlements
        console.log('🤝 Seeding Supplier Settlements...');
        await SupplierPayment.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            supplier_id: supplierMap['Unilever Sri Lanka'],
            payment_date: new Date(),
            amount: 5000.00,
            payment_method: 'cash',
            reference: 'Partial payment for PO-001',
            user_id
        }, { transaction: t });

        // 14. Manual Ledger Transactions
        console.log('📒 Seeding Manual Ledger Transactions...');
        await Transaction.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            account_id: accountMap['Main Cash'],
            date: new Date(),
            type: 'credit',
            amount: 1000.00,
            description: 'Manual cash deposit for initial change',
            reference_type: 'manual',
            user_id
        }, { transaction: t });

        // 15. SPECIAL SCENARIO: The "Coca-Cola Pricing Headache" (Same Barcode, Different Prices)
        console.log('🥤 Seeding "Coca-Cola Pricing Headache" Scenario...');
        const cokeProduct = await Product.findOne({ where: { name: 'Coca Cola', organization_id }, transaction: t });
        if (cokeProduct) {
            const cokeVariant = await ProductVariant.findOne({ 
                where: { product_id: cokeProduct.id, name: { [Op.like]: '%1L%' } },
                transaction: t
            });
            
            if (cokeVariant) {
                // Batch 1: Old Price ($150)
                await ProductBatch.create({
                    id: crypto.randomUUID(),
                    organization_id,
                    branch_id,
                    product_id: cokeProduct.id,
                    product_variant_id: cokeVariant.id,
                    batch_number: 'BATCH-OLD-150',
                    quantity: 10,
                    cost_price: 120.00,
                    selling_price: 150.00,
                    purchase_date: new Date(Date.now() - 86400000 * 30), // 1 month ago
                    expiry_date: new Date(Date.now() + 86400000 * 180)
                }, { transaction: t });

                // Batch 2: New Price ($200) - Same barcode/variant!
                await ProductBatch.create({
                    id: crypto.randomUUID(),
                    organization_id,
                    branch_id,
                    product_id: cokeProduct.id,
                    product_variant_id: cokeVariant.id,
                    batch_number: 'BATCH-NEW-200',
                    quantity: 15,
                    cost_price: 160.00,
                    selling_price: 200.00,
                    purchase_date: new Date(), // Today
                    expiry_date: new Date(Date.now() + 86400000 * 365)
                }, { transaction: t });

                console.log('✅ Created 2 distinct batches for Coca-Cola 1L ($150 and $200) to test selection logic.');
            }
        }

        await t.commit();
        console.log(`✅ Seeded ${productCounter} products correctly.`);
        console.log(`✅ Seeded ${totalVariantsCount} variants with SKUs, barcodes, and opening stocks.`);
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
