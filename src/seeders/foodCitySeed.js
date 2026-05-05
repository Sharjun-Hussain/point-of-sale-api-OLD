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
    RecipeItem,
    Customer,
    Sale,
    SaleItem,
    SalePayment,
    SaleReturn,
    SaleReturnItem,
    PurchaseOrder,
    PurchaseOrderItem,
    GRN,
    GRNItem,
    PurchaseReturn,
    PurchaseReturnItem,
    Account,
    Expense,
    ExpenseCategory,
    Cheque,
    SupplierPayment,
    SupplierPaymentMethod,
    Transaction,
    Shift
} = require('../models');
const { Op } = Sequelize;
const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

const generateNumericBarcode = () => {
    return Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
};

const seedFoodCity = async () => {
    let t;
    try {
        console.log('🌱 Starting Comprehensive Food City Enterprise Seed...');

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

        const branch = await Branch.findOne({ where: { organization_id, is_main: true } });
        if (!branch) {
            console.error(`❌ No main branch found for organization: ${org.name}`);
            process.exit(1);
        }
        const branch_id = branch.id;

        const adminUser = await User.findOne({ where: { organization_id } });
        if (!adminUser) {
            console.error(`❌ No user found for organization: ${org.name}`);
            process.exit(1);
        }
        const user_id = adminUser.id;

        rl.close();

        t = await sequelize.transaction();
        
        console.log('📦 Seeding Metadata (Units, Brands, Containers)...');

        // 2. Base Metadata
        const mUnits = [
            { name: 'Kilogram', short_name: 'kg' },
            { name: 'Gram', short_name: 'g' },
            { name: 'Liter', short_name: 'l' },
            { name: 'Milliliter', short_name: 'ml' },
            { name: 'Piece', short_name: 'pc' },
            { name: 'Pack', short_name: 'pk' }
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
            { name: 'Kilogram', short_name: 'kg' },
            { name: 'Gram', short_name: 'g' }
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

        const containers = [
            { name: 'Small Crate', code: 'SC01', capacity: 20 },
            { name: 'Large Crate', code: 'LC01', capacity: 50 },
            { name: 'Standard Box', code: 'BX01', capacity: 12 }
        ];
        for (const c of containers) {
            await Container.findOrCreate({
                where: { code: c.code, organization_id },
                defaults: { ...c, id: crypto.randomUUID(), organization_id },
                transaction: t
            });
        }

        const brands = ['Coca-Cola', 'PepsiCo', 'Nestle', 'Unilever', 'Cargills', 'Keells', 'Maliban', 'Munchee', 'Anchor', 'Highland', 'Elephant House', 'Signal', 'Sunlight', 'Generic'];
        const brandMap = {};
        for (const b of brands) {
            const [brand] = await Brand.findOrCreate({
                where: { name: b, organization_id },
                defaults: { name: b, id: crypto.randomUUID(), organization_id, description: `${b} brand products` },
                transaction: t
            });
            brandMap[b] = brand.id;
        }

        // 3. Categories & Subcategories
        console.log('📂 Seeding Categories...');
        const categoryData = [
            { name: 'Beverages', subs: ['Soft Drinks', 'Fruit Juices', 'Water', 'Tea & Coffee'] },
            { name: 'Dairy & Chilled', subs: ['Milk', 'Yogurt', 'Cheese', 'Butter'] },
            { name: 'Grocery', subs: ['Rice', 'Pulses', 'Sugar & Salt', 'Spices', 'Cooking Oil'] },
            { name: 'Snacks & Biscuits', subs: ['Biscuits', 'Chips', 'Chocolates', 'Sweets'] },
            { name: 'Household', subs: ['Detergents', 'Cleaners', 'Paper Products'] },
            { name: 'Personal Care', subs: ['Soap', 'Shampoo', 'Toothpaste', 'Deodorants'] },
            { name: 'Bakery', subs: ['Bread', 'Cakes', 'Buns'] }
        ];

        const mainCatMap = {};
        const subCatMap = {};
        for (const cat of categoryData) {
            const [mCat] = await MainCategory.findOrCreate({
                where: { name: cat.name, organization_id },
                defaults: { id: crypto.randomUUID(), name: cat.name, organization_id, description: `${cat.name} section` },
                transaction: t
            });
            mainCatMap[cat.name] = mCat.id;

            for (const sub of cat.subs) {
                const [sCat] = await SubCategory.findOrCreate({
                    where: { name: sub, main_category_id: mCat.id, organization_id },
                    defaults: { id: crypto.randomUUID(), name: sub, main_category_id: mCat.id, organization_id, description: `${sub} subsection` },
                    transaction: t
                });
                subCatMap[`${cat.name}:${sub}`] = sCat.id;
            }
        }

        // 4. Suppliers & Customers
        console.log('🤝 Seeding Suppliers & Customers...');
        const suppliers = [
            { name: 'Lanka Distributors', email: 'info@lankadist.com', phone: '0112345678', address: 'Colombo 03' },
            { name: 'Global Foods Pvt Ltd', email: 'sales@globalfoods.com', phone: '0119876543', address: 'Kaduwela' },
            { name: 'Nestle Lanka PLC', email: 'nestle@lanka.com', phone: '0115554443', address: 'Pannipitiya' }
        ];
        const supplierMap = {};
        for (const s of suppliers) {
            const [supplier] = await Supplier.findOrCreate({
                where: { email: s.email, organization_id },
                defaults: { ...s, id: crypto.randomUUID(), organization_id },
                transaction: t
            });
            supplierMap[s.name] = supplier.id;
        }

        const customers = [
            { name: 'Cash Customer', phone: '0000000000', email: 'cash@pos.com', type: 'retail' },
            { name: 'John Doe', phone: '0771234567', email: 'john@example.com', type: 'retail' },
            { name: 'Wholesale Buyer Ltd', phone: '0719876543', email: 'wholesale@buyer.com', type: 'wholesale' }
        ];
        const customerMap = {};
        for (const c of customers) {
            const [customer] = await Customer.findOrCreate({
                where: { email: c.email, organization_id },
                defaults: { ...c, id: crypto.randomUUID(), organization_id },
                transaction: t
            });
            customerMap[c.name] = customer.id;
        }

        // 5. Accounts & Expenses
        console.log('💰 Seeding Financials...');
        const accounts = [
            { name: 'Cash in Hand', account_type: 'Cash', balance: 50000 },
            { name: 'Commercial Bank', account_type: 'Bank', balance: 1000000 },
            { name: 'HNB Bank', account_type: 'Bank', balance: 750000 }
        ];
        const accountMap = {};
        for (const acc of accounts) {
            const [account] = await Account.findOrCreate({
                where: { name: acc.name, organization_id },
                defaults: { ...acc, id: crypto.randomUUID(), organization_id },
                transaction: t
            });
            accountMap[acc.name] = account.id;
        }

        const expenseCategories = ['Rent', 'Electricity', 'Salaries', 'Internet', 'Marketing'];
        const expCatMap = {};
        for (const ec of expenseCategories) {
            const [cat] = await ExpenseCategory.findOrCreate({
                where: { name: ec, organization_id },
                defaults: { id: crypto.randomUUID(), name: ec, organization_id },
                transaction: t
            });
            expCatMap[ec] = cat.id;
        }

        // 6. Products
        console.log('🍎 Seeding Products & Variants...');
        const productData = [
            { name: 'Coca-Cola 500ml', brand: 'Coca-Cola', cat: 'Beverages', sub: 'Soft Drinks', unit: 'btl', cost: 120, price: 150, wholesale: 140, image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97' },
            { name: 'Pepsi 500ml', brand: 'PepsiCo', cat: 'Beverages', sub: 'Soft Drinks', unit: 'btl', cost: 115, price: 145, wholesale: 135, image: 'https://images.unsplash.com/photo-1543251758-c9cdcd53da4a' },
            { name: 'Anchor Milk Powder 400g', brand: 'Anchor', cat: 'Dairy & Chilled', sub: 'Milk', unit: 'pk', cost: 850, price: 980, wholesale: 950, image: 'https://images.unsplash.com/photo-1550583724-125581f7783b' },
            { name: 'Highland Fresh Milk 1L', brand: 'Highland', cat: 'Dairy & Chilled', sub: 'Milk', unit: 'btl', cost: 240, price: 280, wholesale: 265, image: 'https://images.unsplash.com/photo-1563636619-e9107da5a76a' },
            { name: 'Red Raw Rice 1kg', brand: 'Generic', cat: 'Grocery', sub: 'Rice', unit: 'kg', cost: 180, price: 220, wholesale: 200, image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c' },
            { name: 'Keells White Sugar 1kg', brand: 'Keells', cat: 'Grocery', sub: 'Sugar & Salt', unit: 'kg', cost: 210, price: 245, wholesale: 230, image: 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635' },
            { name: 'Maliban Gold Marie 80g', brand: 'Maliban', cat: 'Snacks & Biscuits', sub: 'Biscuits', unit: 'pk', cost: 65, price: 80, wholesale: 75, image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35' },
            { name: 'Munchee Super Cream Cracker 190g', brand: 'Munchee', cat: 'Snacks & Biscuits', sub: 'Biscuits', unit: 'pk', cost: 140, price: 175, wholesale: 165, image: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e' },
            { name: 'Sunlight Care 70g', brand: 'Sunlight', cat: 'Household', sub: 'Detergents', unit: 'pc', cost: 45, price: 60, wholesale: 55, image: 'https://images.unsplash.com/photo-1600857062241-98e5dba7f214' },
            { name: 'Signal Strong Teeth 120g', brand: 'Signal', cat: 'Personal Care', sub: 'Toothpaste', unit: 'pc', cost: 210, price: 250, wholesale: 235, image: 'https://images.unsplash.com/photo-1559594861-16383c899062' }
        ];

        const productMap = {};
        const variantMap = {};
        let productCounter = 0;

        for (const item of productData) {
            const pCode = `PRD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
            const [product] = await Product.findOrCreate({
                where: { name: item.name, organization_id },
                defaults: {
                    id: crypto.randomUUID(),
                    name: item.name,
                    code: pCode,
                    organization_id,
                    brand_id: brandMap[item.brand],
                    main_category_id: mainCatMap[item.cat],
                    sub_category_id: subCatMap[`${item.cat}:${item.sub}`],
                    unit_id: unitMap[item.unit],
                    product_type: 'Finished Good',
                    image_url: item.image
                },
                transaction: t
            });

            productMap[item.name] = product.id;

            const [variant] = await ProductVariant.findOrCreate({
                where: { product_id: product.id, organization_id },
                defaults: {
                    id: crypto.randomUUID(),
                    product_id: product.id,
                    organization_id,
                    name: 'Default',
                    sku: `SKU-${pCode}`,
                    code: `SKU-${pCode}`,
                    barcode: generateNumericBarcode(),
                    price: item.price,
                    wholesale_price: item.wholesale,
                    cost_price: item.cost,
                    stock_quantity: 100,
                    is_default: true
                },
                transaction: t
            });

            variantMap[item.name] = variant.id;

            // Initial Stock
            await Stock.findOrCreate({
                where: { branch_id, product_variant_id: variant.id, organization_id },
                defaults: {
                    id: crypto.randomUUID(),
                    branch_id,
                    product_id: product.id,
                    product_variant_id: variant.id,
                    quantity: 100,
                    organization_id
                },
                transaction: t
            });

            productCounter++;
        }

        // 7. Purchase Flow (PO -> GRN)
        console.log('📝 Seeding Purchase Workflow...');
        const poNumber = `PO-FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const po = await PurchaseOrder.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            supplier_id: supplierMap['Lanka Distributors'],
            user_id,
            po_number: poNumber,
            order_date: new Date(),
            total_amount: 50000,
            status: 'received'
        }, { transaction: t });

        await PurchaseOrderItem.create({
            id: crypto.randomUUID(),
            purchase_order_id: po.id,
            product_id: productMap['Coca-Cola 500ml'],
            product_variant_id: variantMap['Coca-Cola 500ml'],
            quantity: 100,
            unit_price: 120,
            total_price: 12000
        }, { transaction: t });

        const grnNumber = `GRN-FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const grn = await GRN.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            purchase_order_id: po.id,
            supplier_id: po.supplier_id,
            user_id,
            grn_number: grnNumber,
            received_date: new Date(),
            total_amount: 12000,
            status: 'completed'
        }, { transaction: t });

        await GRNItem.create({
            id: crypto.randomUUID(),
            grn_id: grn.id,
            product_id: productMap['Coca-Cola 500ml'],
            product_variant_id: variantMap['Coca-Cola 500ml'],
            quantity_received: 100,
            unit_cost: 120,
            total_cost: 12000
        }, { transaction: t });

        // 8. Sales Workflow
        console.log('🛒 Seeding Sales Workflow...');
        
        // Active Shift for Sales
        const shift = await Shift.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            user_id,
            start_time: new Date(),
            opening_balance: 5000,
            status: 'open'
        }, { transaction: t });

        const invNumber = `INV-FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const sale = await Sale.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            customer_id: customerMap['John Doe'],
            user_id,
            shift_id: shift.id,
            invoice_number: invNumber,
            sale_date: new Date(),
            total_amount: 1000,
            payable_amount: 1000,
            paid_amount: 1000,
            payment_status: 'paid',
            status: 'completed'
        }, { transaction: t });

        await SaleItem.create({
            id: crypto.randomUUID(),
            sale_id: sale.id,
            product_id: productMap['Anchor Milk Powder 400g'],
            product_variant_id: variantMap['Anchor Milk Powder 400g'],
            quantity: 1,
            unit_price: 980,
            subtotal: 980
        }, { transaction: t });

        await SalePayment.create({
            id: crypto.randomUUID(),
            sale_id: sale.id,
            organization_id,
            payment_method: 'Cash',
            amount: 1000,
            payment_date: new Date()
        }, { transaction: t });

        // Credit Sale
        const invNumber2 = `INV-FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const sale2 = await Sale.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            customer_id: customerMap['Wholesale Buyer Ltd'],
            user_id,
            shift_id: shift.id,
            invoice_number: invNumber2,
            sale_date: new Date(),
            total_amount: 5000,
            payable_amount: 5000,
            paid_amount: 0,
            payment_status: 'unpaid',
            status: 'completed',
            is_wholesale: true
        }, { transaction: t });

        // Cheque Sale
        const invNumber3 = `INV-FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const sale3 = await Sale.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            customer_id: customerMap['John Doe'],
            user_id,
            shift_id: shift.id,
            invoice_number: invNumber3,
            sale_date: new Date(),
            total_amount: 2500,
            payable_amount: 2500,
            paid_amount: 2500,
            payment_status: 'paid',
            status: 'completed'
        }, { transaction: t });

        const cheque = await Cheque.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            cheque_number: 'CHQ123456',
            bank_name: 'Commercial Bank',
            amount: 2500,
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'pending',
            reference_type: 'Sale',
            reference_id: sale3.id,
            received_from: 'John Doe'
        }, { transaction: t });

        await SalePayment.create({
            id: crypto.randomUUID(),
            sale_id: sale3.id,
            organization_id,
            payment_method: 'Cheque',
            amount: 2500,
            payment_date: new Date(),
            reference_number: cheque.cheque_number
        }, { transaction: t });

        // 9. Expenses
        console.log('💸 Seeding Expenses...');
        await Expense.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            expense_category_id: expCatMap['Electricity'],
            account_id: accountMap['Commercial Bank'],
            user_id,
            amount: 15000,
            expense_date: new Date(),
            reference_number: 'ELEC-2024-05',
            notes: 'Monthly electricity bill'
        }, { transaction: t });

        // 10. Supplier Settlement (Split)
        console.log('💳 Seeding Supplier Settlements...');
        const suppPayment = await SupplierPayment.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            supplier_id: supplierMap['Lanka Distributors'],
            voucher_number: 'VOU-001',
            payment_date: new Date(),
            total_amount: 10000,
            created_by: user_id
        }, { transaction: t });

        await SupplierPaymentMethod.create({
            id: crypto.randomUUID(),
            organization_id,
            supplier_payment_id: suppPayment.id,
            payment_method: 'Cash',
            amount: 4000
        }, { transaction: t });

        await SupplierPaymentMethod.create({
            id: crypto.randomUUID(),
            organization_id,
            supplier_payment_id: suppPayment.id,
            payment_method: 'Cheque',
            amount: 6000,
            reference_number: 'CHQ-SUP-99'
        }, { transaction: t });

        // 11. Returns
        console.log('🔄 Seeding Returns (Sale & Purchase)...');
        const saleReturn = await SaleReturn.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            sale_id: sale.id,
            user_id,
            return_number: `SRT-FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            return_date: new Date(),
            total_amount: 150,
            status: 'completed'
        }, { transaction: t });

        await SaleReturnItem.create({
            id: crypto.randomUUID(),
            sale_return_id: saleReturn.id,
            product_id: productMap['Coca-Cola 500ml'],
            product_variant_id: variantMap['Coca-Cola 500ml'],
            quantity: 1,
            unit_price: 150,
            subtotal: 150
        }, { transaction: t });

        const purchaseReturn = await PurchaseReturn.create({
            id: crypto.randomUUID(),
            organization_id,
            branch_id,
            supplier_id: supplierMap['Lanka Distributors'],
            purchase_order_id: po.id,
            user_id,
            return_number: `PRT-FC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            return_date: new Date(),
            total_amount: 600,
            status: 'completed'
        }, { transaction: t });

        await PurchaseReturnItem.create({
            id: crypto.randomUUID(),
            purchase_return_id: purchaseReturn.id,
            product_id: productMap['Coca-Cola 500ml'],
            product_variant_id: variantMap['Coca-Cola 500ml'],
            quantity_returned: 5,
            unit_cost: 120,
            total_cost: 600
        }, { transaction: t });

        await t.commit();

        console.log(`✅ Comprehensive Food City Seed Completed! Seeded ${productCounter} products and associated workflows.`);
        productCounter > 0 ? process.exit(0) : process.exit(1);

    } catch (error) {
        if (t) await t.rollback();
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
};

seedFoodCity();
