require('dotenv').config();
const {
    sequelize,
    Organization,
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
    Supplier
} = require('../models');

const seedHardwareShop = async () => {
    try {
        console.log('🌱 Starting Hardware Shop Seed...');

        // 1. Get Organization ID from the active admin user
        const adminUser = await User.findOne({
            where: { email: 'admin@emipos.com' }
        });

        let organization_id;
        if (adminUser) {
            organization_id = adminUser.organization_id;
            console.log(`✅ Found admin user, using organization_id: ${organization_id}`);
        } else {
            const org = await Organization.findOne();
            if (!org) {
                console.error('❌ No organization found in DB. Please run master seed first.');
                process.exit(1);
            }
            organization_id = org.id;
            console.log(`⚠️ Admin user not found, using first available organization_id: ${organization_id}`);
        }

        // 2. Measurement Units
        const measurementUnits = [
            { name: 'Kilogram', short_name: 'kg' },
            { name: 'Gram', short_name: 'g' },
            { name: 'Liter', short_name: 'l' },
            { name: 'Milliliter', short_name: 'ml' },
            { name: 'Meter', short_name: 'm' },
            { name: 'Centimeter', short_name: 'cm' },
            { name: 'Feet', short_name: 'ft' },
            { name: 'Inch', short_name: 'in' },
            { name: 'Square Feet', short_name: 'sqft' },
            { name: 'Square Meter', short_name: 'sqm' },
            { name: 'Piece', short_name: 'pc' }
        ];
        const mUnitMap = {};
        for (const item of measurementUnits) {
            const [mUnit] = await MeasurementUnit.findOrCreate({
                where: { short_name: item.short_name, organization_id },
                defaults: { ...item, organization_id }
            });
            mUnitMap[item.short_name] = mUnit.id;
        }
        console.log('✅ Seeded Measurement Units.');

        // 3. Base Units
        const units = [
            { name: 'Piece', short_name: 'pc' },
            { name: 'Kilogram', short_name: 'kg' },
            { name: 'Liter', short_name: 'l' },
            { name: 'Bag', short_name: 'bag' },
            { name: 'Box', short_name: 'box' },
            { name: 'Roll', short_name: 'roll' },
            { name: 'Bundle', short_name: 'bundle' },
            { name: 'Sheet', short_name: 'sheet' },
            { name: 'Meter', short_name: 'm' },
            { name: 'Feet', short_name: 'ft' },
            { name: 'Dozen', short_name: 'doz' }
        ];
        const unitMap = {};
        for (const item of units) {
            const [unit] = await Unit.findOrCreate({
                where: { short_name: item.short_name, organization_id },
                defaults: { ...item, organization_id }
            });
            unitMap[item.short_name] = unit.id;
        }
        console.log('✅ Seeded Base Units.');

        // 4. Containers
        const containers = [
            { name: 'Bag', description: 'Heavy duty bag' },
            { name: 'Box', description: 'Cardboard or plastic box' },
            { name: 'Roll', description: 'Cylindrical roll' },
            { name: 'Bundle', description: 'Tied bundle' },
            { name: 'Packet', description: 'Small packet' },
            { name: 'Can', description: 'Metal or plastic can' },
            { name: 'Bottle', description: 'Plastic or glass bottle' },
            { name: 'Drum', description: 'Large industrial drum' },
            { name: 'Pallet', description: 'Wooden or plastic pallet' },
            { name: 'Crate', description: 'Wooden or plastic crate' }
        ];
        const containerMap = {};
        for (const item of containers) {
            const [container] = await Container.findOrCreate({
                where: { name: item.name, organization_id },
                defaults: { ...item, organization_id }
            });
            containerMap[item.name] = container.id;
        }
        console.log('✅ Seeded Containers.');

        // 5. Brands
        const brands = [
            { name: 'Generic', description: 'Non-branded hardware' },
            { name: 'Stanley', description: 'Professional tools' },
            { name: 'Bosch', description: 'Power tools' },
            { name: 'Makita', description: 'Power tools' },
            { name: 'Dulux', description: 'Paints and coatings' },
            { name: 'Nippon', description: 'Paints and coatings' },
            { name: 'Orange', description: 'Electrical accessories' },
            { name: 'ACL', description: 'Cables and switches' },
            { name: 'Anton', description: 'PVC pipes and fittings' },
            { name: 'S-Lon', description: 'PVC pipes and fittings' },
            { name: 'Holcim', description: 'Cement' },
            { name: 'Tokyo Super', description: 'Cement' },
            { name: 'Lanwa', description: 'Steel bars' },
            { name: 'Melwire', description: 'Steel products' }
        ];
        const brandMap = {};
        for (const item of brands) {
            const [brand] = await Brand.findOrCreate({
                where: { name: item.name, organization_id },
                defaults: { ...item, organization_id }
            });
            brandMap[item.name] = brand.id;
        }
        console.log('✅ Seeded Brands.');

        // 6. Categories and Subcategories
        const categories = {
            'Hand Tools': ['Hammers', 'Screwdrivers', 'Wrenches', 'Pliers', 'Saws', 'Measuring Tapes'],
            'Power Tools': ['Drills', 'Grinders', 'Saws', 'Sanders', 'Blowers'],
            'Plumbing': ['PVC Pipes', 'Fittings', 'Taps & Valves', 'Water Tanks', 'Adhesives'],
            'Electrical': ['Cables', 'Switches & Sockets', 'Lighting', 'Circuit Breakers', 'Conduits'],
            'Paint & Accessories': ['Emulsion', 'Weather Shield', 'Brushes & Rollers', 'Thinner', 'Turpentine'],
            'Building Materials': ['Cement', 'Sand', 'Bricks', 'Roofing Sheets', 'Steel Bars'],
            'Fasteners': ['Nails', 'Screws', 'Bolts & Nuts', 'Washers', 'Wall Plugs'],
            'Safety Gear': ['Helmets', 'Gloves', 'Safety Shoes', 'Vests', 'Goggles']
        };

        const subCategoryMap = {};
        const mainCategoryMap = {};
        for (const [mainName, subNames] of Object.entries(categories)) {
            const [mainCategory] = await MainCategory.findOrCreate({
                where: { name: mainName, organization_id },
                defaults: { name: mainName, organization_id, description: `${mainName} products` }
            });
            mainCategoryMap[mainName] = mainCategory.id;

            for (const subName of subNames) {
                const [subCategory] = await SubCategory.findOrCreate({
                    where: { name: subName, main_category_id: mainCategory.id, organization_id },
                    defaults: { name: subName, main_category_id: mainCategory.id, organization_id, description: `${subName} items` }
                });
                subCategoryMap[`${mainName}:${subName}`] = subCategory.id;
            }
        }
        console.log('✅ Seeded Categories and Subcategories.');

        // 7. Suppliers
        const suppliersData = [
            { name: 'Lanka Hardware Solutions', email: 'sales@lankahardware.lk', phone: '0112223334', address: '123, Nawala Rd, Rajagiriya', contact_person: 'Mr. Perera' },
            { name: 'Tool Master PVT Ltd', email: 'info@toolmaster.lk', phone: '0114445556', address: '45, Panchikawatta Rd, Colombo 10', contact_person: 'Mr. Silva' },
            { name: 'Green Paints Distributor', email: 'orders@greenpaints.lk', phone: '0117778889', address: '88, Kandy Rd, Kiribathgoda', contact_person: 'Ms. Fernando' },
            { name: 'Steel & Pipe Center', email: 'supply@steelpipe.lk', phone: '0119991112', address: '20, Kelaniya Industrial Zone', contact_person: 'Mr. Gamage' },
            { name: 'ABC Electricals', email: 'admin@abcelectricals.lk', phone: '0113334445', address: '67, Galle Rd, Dehiwala', contact_person: 'Mr. Mohamed' }
        ];

        const supplierMap = {};
        for (const item of suppliersData) {
            const [supplier] = await Supplier.findOrCreate({
                where: { name: item.name, organization_id },
                defaults: { ...item, organization_id }
            });
            supplierMap[item.name] = supplier.id;
        }
        console.log('✅ Seeded Suppliers.');

        // 8. Attributes and Values
        const attributesData = [
            { name: 'Size', values: ['1/2"', '3/4"', '1"', '1.5"', '2"', '16oz', '20oz', 'M5', 'M8', 'M10'] },
            { name: 'Color', values: ['Red', 'Blue', 'White', 'Black', 'Yellow', 'Grey', 'Green'] },
            { name: 'Material', values: ['Steel', 'PVC', 'Brass', 'Aluminum', 'Plastic'] },
            { name: 'Volume', values: ['100ml', '500ml', '1L', '4L', '10L', '20L'] }
        ];

        const attrValueMap = {};
        for (const item of attributesData) {
            const [attribute] = await Attribute.findOrCreate({
                where: { name: item.name, organization_id },
                defaults: { name: item.name, organization_id, description: `${item.name} attribute` }
            });

            for (const val of item.values) {
                const [attrVal] = await AttributeValue.findOrCreate({
                    where: { value: val, attribute_id: attribute.id, organization_id },
                    defaults: { value: val, attribute_id: attribute.id, organization_id }
                });
                attrValueMap[`${item.name}:${val}`] = attrVal.id;
            }
        }
        console.log('✅ Seeded Attributes and Values.');

        // 9. Products and Variants
        const productsData = [
            {
                name: 'Stanley Claw Hammer',
                code: 'HMR-STN-001',
                brand: 'Stanley',
                mainCategory: 'Hand Tools',
                subCategory: 'Hammers',
                unit: 'pc',
                supplier: 'Tool Master PVT Ltd',
                is_variant: true,
                variants: [
                    { name: 'Stanley Hammer 16oz', sku: 'HMR-STN-16OZ', price: 2500, cost: 1800, stock: 50, attr: { 'Size': '16oz' } },
                    { name: 'Stanley Hammer 20oz', sku: 'HMR-STN-20OZ', price: 3200, cost: 2400, stock: 30, attr: { 'Size': '20oz' } }
                ]
            },
            {
                name: 'S-Lon PVC Pipe Class 1000',
                code: 'PVC-SLN-1000',
                brand: 'S-Lon',
                mainCategory: 'Plumbing',
                subCategory: 'PVC Pipes',
                unit: 'm',
                supplier: 'Steel & Pipe Center',
                is_variant: true,
                variants: [
                    { name: 'S-Lon Pipe 1/2"', sku: 'PVC-SLN-05', price: 450, cost: 320, stock: 200, attr: { 'Size': '1/2"' } },
                    { name: 'S-Lon Pipe 3/4"', sku: 'PVC-SLN-75', price: 680, cost: 500, stock: 150, attr: { 'Size': '3/4"' } },
                    { name: 'S-Lon Pipe 1"', sku: 'PVC-SLN-10', price: 950, cost: 700, stock: 100, attr: { 'Size': '1"' } }
                ]
            },
            {
                name: 'Dulux Weathershield White',
                code: 'PNT-DLX-WS-W',
                brand: 'Dulux',
                mainCategory: 'Paint & Accessories',
                subCategory: 'Weather Shield',
                unit: 'l',
                supplier: 'Green Paints Distributor',
                is_variant: true,
                variants: [
                    { name: 'Dulux WS White 1L', sku: 'PNT-DLX-WS-W-1L', price: 2800, cost: 2200, stock: 40, attr: { 'Volume': '1L' } },
                    { name: 'Dulux WS White 4L', sku: 'PNT-DLX-WS-W-4L', price: 10500, cost: 8500, stock: 20, attr: { 'Volume': '4L' } },
                    { name: 'Dulux WS White 10L', sku: 'PNT-DLX-WS-W-10L', price: 24500, cost: 20000, stock: 10, attr: { 'Volume': '10L' } }
                ]
            },
            {
                name: 'Measuring Tape 5m Stanley',
                code: 'MT-STN-5M',
                brand: 'Stanley',
                mainCategory: 'Hand Tools',
                subCategory: 'Measuring Tapes',
                unit: 'pc',
                supplier: 'Tool Master PVT Ltd',
                is_variant: false,
                price: 1200,
                cost: 850,
                stock: 75
            },
            {
                name: 'Safety Helmet Yellow',
                code: 'SF-HLM-Y',
                brand: 'Generic',
                mainCategory: 'Safety Gear',
                subCategory: 'Helmets',
                unit: 'pc',
                supplier: 'Lanka Hardware Solutions',
                is_variant: false,
                price: 1500,
                cost: 950,
                stock: 25
            }
        ];

        for (const pData of productsData) {
            const [product] = await Product.findOrCreate({
                where: { code: pData.code, organization_id },
                defaults: {
                    name: pData.name,
                    code: pData.code,
                    organization_id,
                    brand_id: brandMap[pData.brand],
                    main_category_id: mainCategoryMap[pData.mainCategory],
                    sub_category_id: subCategoryMap[`${pData.mainCategory}:${pData.subCategory}`],
                    unit_id: unitMap[pData.unit],
                    supplier_id: supplierMap[pData.supplier],
                    is_variant: pData.is_variant
                }
            });

            // Update supplier_id if it already exists but might be different
            if (product.supplier_id !== supplierMap[pData.supplier]) {
                product.supplier_id = supplierMap[pData.supplier];
                await product.save();
            }

            if (pData.is_variant && pData.variants) {
                for (const vData of pData.variants) {
                    const [variant] = await ProductVariant.findOrCreate({
                        where: { sku: vData.sku, organization_id },
                        defaults: {
                            product_id: product.id,
                            organization_id,
                            name: vData.name,
                            sku: vData.sku,
                            price: vData.price,
                            cost_price: vData.cost,
                            stock_quantity: vData.stock
                        }
                    });

                    if (vData.attr) {
                        for (const [attrName, attrVal] of Object.entries(vData.attr)) {
                            const attrValId = attrValueMap[`${attrName}:${attrVal}`];
                            if (attrValId) {
                                await VariantAttributeValue.findOrCreate({
                                    where: { product_variant_id: variant.id, attribute_value_id: attrValId, organization_id },
                                    defaults: { product_variant_id: variant.id, attribute_value_id: attrValId, organization_id }
                                });
                            }
                        }
                    }
                }
            } else {
                await ProductVariant.findOrCreate({
                    where: { sku: pData.code, organization_id },
                    defaults: {
                        product_id: product.id,
                        organization_id,
                        name: pData.name,
                        sku: pData.code,
                        price: pData.price || 0,
                        cost_price: pData.cost || 0,
                        stock_quantity: pData.stock || 0
                    }
                });
            }
        }
        console.log('✅ Seeded Products and Variants (with Suppliers).');

        console.log('🌱 Hardware Shop Seeding Completed Successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
};

seedHardwareShop();
