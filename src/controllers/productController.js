const { Product, ProductVariant, MainCategory, SubCategory, Brand, Unit, MeasurementUnit, Container, Stock, Branch, ProductBatch, StockOpening, Attribute, AttributeValue, VariantAttributeValue, Supplier, sequelize } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');
const auditService = require('../services/auditService');

/**
 * Product Controller
 */
const getAllProducts = async (req, res, next) => {
    try {
        const { page, size, name, category_id } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = {};
        if (name) {
            where.name = { [Op.like]: `%${name}%` };
        }
        if (category_id) {
            where.main_category_id = category_id;
        }

        const products = await Product.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                { model: MainCategory, as: 'main_category' },
                { model: SubCategory, as: 'sub_category' },
                { model: Brand, as: 'brand' },
                { model: Unit, as: 'unit' },
                { model: MeasurementUnit, as: 'measurement' },
                { model: Container, as: 'container' },
                {
                    model: ProductVariant,
                    as: 'variants',
                    include: [
                        {
                            model: AttributeValue,
                            as: 'attribute_values',
                            include: [{ model: Attribute, as: 'attribute' }]
                        }
                    ]
                },
                {
                    model: Supplier,
                    as: 'suppliers',
                    through: { attributes: [] }
                }
            ],
            distinct: true,
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, products.rows, {
            total: products.count,
            page: parseInt(page) || 1,
            limit
        }, 'Products fetched successfully');
    } catch (error) {
        next(error);
    }
};

const createProduct = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const {
            name, code, description, sku, barcode,
            main_category_id, sub_category_id, brand_id,
            unit_id, measurement_id, container_id, supplier_id, is_variant, is_active,

            variants, product_attributes, suppliers // Added suppliers array
        } = req.body;

        // Handle Image Upload
        let imagePath = null;
        if (req.files && req.files.length > 0) {
            const imagePaths = req.files.map(file => file.path);
            imagePath = JSON.stringify(imagePaths);
        }

        // Create product
        const product = await Product.create({
            name,
            code,
            description,
            sku,
            barcode,
            main_category_id,
            sub_category_id,
            brand_id,
            unit_id,
            measurement_id,
            container_id,
            supplier_id,
            is_variant,
            is_active,
            image: imagePath
        }, { transaction: t });

        // --- ATTR: Handle Product Attributes ---
        if (product_attributes && Array.isArray(product_attributes)) {
            await product.setAttributes(product_attributes, { transaction: t });
        }

        // --- SUPPLIERS: Handle Multi-Supplier ---
        if (suppliers && Array.isArray(suppliers)) {
            // Ensure default supplier_id is in the list if it exists
            const supplierList = [...suppliers];
            if (supplier_id && !supplierList.includes(supplier_id)) {
                supplierList.push(supplier_id);
            }
            await product.setSuppliers(supplierList, { transaction: t });
        } else if (supplier_id) {
            // If no list provided but default exists, add default to Pivot
            await product.setSuppliers([supplier_id], { transaction: t });
        }

        // --- VAR: Handle Variants ---
        if (is_variant && variants && Array.isArray(variants)) {
            for (const v of variants) {
                const variant = await ProductVariant.create({
                    ...v,
                    product_id: product.id
                }, { transaction: t });

                // Link Attributes if provided (e.g., v.attributes = [{ name: 'Color', value: 'Red' }])
                if (v.attributes && Array.isArray(v.attributes)) {
                    for (const attrData of v.attributes) {
                        // 1. Find or Create Attribute
                        const [attribute] = await Attribute.findOrCreate({
                            where: { name: attrData.name },
                            transaction: t
                        });

                        // 2. Find or Create Attribute Value
                        const [attrValue] = await AttributeValue.findOrCreate({
                            where: { attribute_id: attribute.id, value: attrData.value },
                            transaction: t
                        });

                        // 3. Link to Variant
                        await VariantAttributeValue.create({
                            product_variant_id: variant.id,
                            attribute_value_id: attrValue.id
                        }, { transaction: t });
                    }
                }
            }
        }

        await t.commit();

        const createdProduct = await Product.findOne({
            where: { id: product.id },
            include: [
                {
                    model: Attribute,
                    as: 'attributes',
                    through: { attributes: [] }
                },
                {
                    model: Supplier,
                    as: 'suppliers',
                    through: { attributes: [] }
                },
                {
                    model: ProductVariant,
                    as: 'variants',
                    include: [
                        {
                            model: AttributeValue,
                            as: 'attribute_values',
                            include: [{ model: Attribute, as: 'attribute' }]
                        }
                    ]
                }
            ]
        });

        // Log product creation
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            req.user?.organization_id,
            req.user?.id,
            'Product',
            product.id,
            {
                name: product.name,
                code: product.code,
                sku: product.sku,
                is_variant: product.is_variant,
                variants_count: variants?.length || 0
            },
            ipAddress,
            userAgent
        );

        return successResponse(res, createdProduct, 'Product created successfully', 201);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

const getProductById = async (req, res, next) => {
    try {
        const product = await Product.findByPk(req.params.id, {
            include: [
                { model: MainCategory, as: 'main_category' },
                { model: SubCategory, as: 'sub_category' },
                { model: Brand, as: 'brand' },
                { model: Unit, as: 'unit' },
                { model: MeasurementUnit, as: 'measurement' },
                { model: Container, as: 'container' },
                {
                    model: Attribute,
                    as: 'attributes',
                    through: { attributes: [] }
                },
                {
                    model: Supplier,
                    as: 'suppliers',
                    through: { attributes: [] }
                },
                {
                    model: ProductVariant,
                    as: 'variants',
                    include: [
                        {
                            model: AttributeValue,
                            as: 'attribute_values',
                            include: [{ model: Attribute, as: 'attribute' }]
                        }
                    ]
                }
            ]
        });

        if (!product) {
            return errorResponse(res, 'Product not found', 404);
        }

        return successResponse(res, product, 'Product fetched successfully');
    } catch (error) {
        next(error);
    }
};

const updateProduct = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const {
            name, code, description, sku, barcode,
            main_category_id, sub_category_id, brand_id,
            unit_id, measurement_id, container_id, supplier_id, is_variant,
            variants, product_attributes, suppliers // Added suppliers
        } = req.body;

        const product = await Product.findByPk(id);
        if (!product) {
            await t.rollback();
            return errorResponse(res, 'Product not found', 404);
        }

        const updates = {
            name,
            code,
            description,
            sku,
            barcode,
            main_category_id,
            sub_category_id,
            brand_id,
            unit_id,
            measurement_id,
            container_id,
            supplier_id,
            is_variant
        };

        // Handle Image Upload
        if (req.files && req.files.length > 0) {
            const imagePaths = req.files.map(file => file.path);
            updates.image = JSON.stringify(imagePaths);
        } else if (req.body.image === null || req.body.image === 'null') {
            updates.image = null; // enable clearing images
        }

        await product.update(updates, { transaction: t });

        // --- ATTR: Handle Product Attributes ---
        if (product_attributes && Array.isArray(product_attributes)) {
            await product.setAttributes(product_attributes, { transaction: t });
        }

        // --- SUPPLIERS: Handle Multi-Supplier ---
        if (suppliers && Array.isArray(suppliers)) {
            // Ensure default supplier_id is in the list
            const supplierList = [...suppliers];
            if (supplier_id && !supplierList.includes(supplier_id)) {
                supplierList.push(supplier_id);
            }
            await product.setSuppliers(supplierList, { transaction: t });
        } else if (supplier_id) {
            // If valid supplier_id and logic dictates we should sync pivot (optional, but safe)
            // Check if we need to preserve existing if 'suppliers' is undefined? 
            // If suppliers is undefined, we assume no change to list? 
            // Logic: If 'supplier_id' changed, ensure it's in the list.
            // Simpler: If no 'suppliers' array sent, don't touch pivot?
            // OR: Always ensure default is in pivot.
            // Implementation: We'll add the new default if not there.
            const currentSuppliers = await product.getSuppliers({ transaction: t });
            const currentIds = currentSuppliers.map(s => s.id);
            if (!currentIds.includes(supplier_id)) {
                await product.addSupplier(supplier_id, { transaction: t });
            }
        }

        // Handle Variants Upsert (Create or Update)
        if (variants && Array.isArray(variants)) {
            for (const variantData of variants) {
                if (variantData.id) {
                    // Update existing variant
                    const variant = await ProductVariant.findOne({ where: { id: variantData.id, product_id: id } });
                    if (variant) {
                        await variant.update(variantData, { transaction: t });
                    }
                } else {
                    // Create new variant
                    await ProductVariant.create({
                        ...variantData,
                        product_id: id
                    }, { transaction: t });
                }
            }
        }

        await t.commit();

        // Fetch fresh product with all associations
        const updatedProduct = await Product.findByPk(id, {
            include: [
                {
                    model: Attribute,
                    as: 'attributes',
                    through: { attributes: [] }
                },
                {
                    model: ProductVariant,
                    as: 'variants'
                }
            ]
        });

        // Log product update
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            req.user?.organization_id,
            req.user?.id,
            'Product',
            product.id,
            { name: product.name }, // Old values (simplified)
            {
                name,
                code,
                sku,
                is_variant
            },
            ipAddress,
            userAgent
        );

        return successResponse(res, updatedProduct, 'Product updated successfully');
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

const deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const product = await Product.findByPk(id);
        if (!product) {
            return errorResponse(res, 'Product not found', 404);
        }

        // Log product deletion
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logDelete(
            req.user?.organization_id,
            req.user?.id,
            'Product',
            product.id,
            {
                name: product.name,
                code: product.code,
                sku: product.sku
            },
            ipAddress,
            userAgent
        );

        // This is a hard delete, consider soft delete by adding deleted_at to model
        await product.destroy();

        return successResponse(res, null, 'Product deleted successfully');
    } catch (error) {
        next(error);
    }
};

const getActiveProductsList = async (req, res, next) => {
    try {
        const products = await Product.findAll({
            where: { is_active: true },
            include: [
                { model: MainCategory, as: 'main_category' },
                { model: Brand, as: 'brand' },
                {
                    model: ProductVariant,
                    as: 'variants',
                    where: { is_active: true },
                    required: false,
                    include: [
                        {
                            model: AttributeValue,
                            as: 'attribute_values',
                            include: [{ model: Attribute, as: 'attribute' }]
                        }
                    ]
                }
            ],
            order: [['name', 'ASC']]
        });
        return successResponse(res, products, 'Active products fetched');
    } catch (error) {
        next(error);
    }
};

const toggleProductStatus = async (req, res, next) => {
    try {
        const product = await Product.findByPk(req.params.id);
        if (!product) return errorResponse(res, 'Product not found', 404);

        const action = req.params.action || (product.is_active ? 'deactivate' : 'activate');
        product.is_active = (action === 'activate');
        await product.save();

        return successResponse(res, product, `Product ${action}d successfully`);
    } catch (error) {
        next(error);
    }
};

const toggleVariantStatus = async (req, res, next) => {
    try {
        const variant = await ProductVariant.findOne({
            where: { id: req.params.variantId, product_id: req.params.id }
        });
        if (!variant) return errorResponse(res, 'Variant not found', 404);

        const action = req.params.action || (variant.is_active ? 'deactivate' : 'activate');
        variant.is_active = (action === 'activate');
        await variant.save();

        return successResponse(res, variant, `Variant ${action}d successfully`);
    } catch (error) {
        next(error);
    }
};

const createVariant = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params; // Product ID
        const {
            name, sku, code, barcode, price, cost_price, stock_quantity,
            low_stock_threshold, description,
            is_active, is_default, imei_number, warranty_period,
            wholesale_price,
            attributes
        } = req.body;

        const product = await Product.findByPk(id);
        if (!product) return errorResponse(res, 'Product not found', 404);

        // Handle Image Upload
        let imagePath = null;
        if (req.files && req.files.length > 0) {
            const imagePaths = req.files.map(file => file.path);
            imagePath = JSON.stringify(imagePaths);
        }

        const variant = await ProductVariant.create({
            product_id: id,
            name, sku, code, barcode,
            price: price || 0,
            cost_price: cost_price || 0,
            stock_quantity: stock_quantity || 0,
            low_stock_threshold: low_stock_threshold || 10,
            description,
            is_active: is_active === 'true' || is_active === true || is_active === '1',
            is_default: is_default === 'true' || is_default === true || is_default === '1',
            image: imagePath,
            imei_number, warranty_period,
            wholesale_price: wholesale_price || 0
        }, { transaction: t });

        // Handle Dynamic Attributes
        if (attributes) {
            let parsedAttributes = attributes;
            if (typeof attributes === 'string') {
                try { parsedAttributes = JSON.parse(attributes); } catch (e) { parsedAttributes = []; }
            }

            if (Array.isArray(parsedAttributes)) {
                for (const attrData of parsedAttributes) {
                    if (!attrData.value) continue;

                    const [attrValue] = await AttributeValue.findOrCreate({
                        where: { attribute_id: attrData.attribute_id, value: attrData.value },
                        transaction: t
                    });

                    await VariantAttributeValue.create({
                        product_variant_id: variant.id,
                        attribute_value_id: attrValue.id
                    }, { transaction: t });
                }
            }
        }

        await t.commit();

        // Fetch the fresh variant with associations for the response
        const freshVariant = await ProductVariant.findByPk(variant.id, {
            include: [
                {
                    model: AttributeValue,
                    as: 'attribute_values',
                    include: [{ model: Attribute, as: 'attribute' }]
                }
            ]
        });

        // Map for response format consistency
        const responseData = {
            ...freshVariant.toJSON(),
            attributes: freshVariant.attribute_values.map(av => ({
                attribute_id: av.attribute.id,
                name: av.attribute.name,
                value: av.value
            }))
        };

        return successResponse(res, responseData, 'Variant created successfully', 201);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

// Handle Update Request (which might come as POST with _method=PUT from FormData)
const getVariantById = async (req, res, next) => {
    try {
        const { variantId } = req.params;
        const variant = await ProductVariant.findByPk(variantId, {
            include: [
                {
                    model: AttributeValue,
                    as: 'attribute_values',
                    include: [{ model: Attribute, as: 'attribute' }]
                }
            ]
        });

        if (!variant) return errorResponse(res, 'Variant not found', 404);

        // Map attribute_values to the format expected by the frontend
        const attributes = variant.attribute_values.map(av => ({
            attribute_id: av.attribute.id,
            name: av.attribute.name,
            value: av.value
        }));

        const result = {
            ...variant.toJSON(),
            attributes
        };

        return successResponse(res, result, 'Variant fetched successfully');
    } catch (error) {
        next(error);
    }
};

const updateVariant = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id, variantId } = req.params;
        const {
            name, sku, code, barcode, price, cost_price, stock_quantity,
            low_stock_threshold, description,
            is_active, is_default, imei_number, warranty_period,
            wholesale_price,
            attributes
        } = req.body;

        const variant = await ProductVariant.findOne({ where: { id: variantId, product_id: id } });
        if (!variant) {
            await t.rollback();
            return errorResponse(res, 'Variant not found', 404);
        }

        const updates = {
            name, sku, code, barcode,
            price: price || variant.price,
            cost_price: cost_price || variant.cost_price,
            stock_quantity: stock_quantity || variant.stock_quantity,
            low_stock_threshold: low_stock_threshold || variant.low_stock_threshold,
            description,
            is_active: is_active === 'true' || is_active === true || is_active === '1',
            is_default: is_default === 'true' || is_default === true || is_default === '1',
            imei_number, warranty_period,
            wholesale_price: wholesale_price || variant.wholesale_price
        };

        // Handle Image Upload
        if (req.files && req.files.length > 0) {
            // If multiple images are provided, store them as JSON string
            const imagePaths = req.files.map(file => file.path);
            updates.image = JSON.stringify(imagePaths);
        }

        await variant.update(updates, { transaction: t });

        // Handle Dynamic Attributes
        if (attributes) {
            let parsedAttributes = attributes;
            if (typeof attributes === 'string') {
                try { parsedAttributes = JSON.parse(attributes); } catch (e) { parsedAttributes = []; }
            }

            if (Array.isArray(parsedAttributes)) {
                // Clear existing attributes first
                await VariantAttributeValue.destroy({
                    where: { product_variant_id: variant.id },
                    transaction: t
                });

                for (const attrData of parsedAttributes) {
                    if (!attrData.value) continue;

                    const [attrValue] = await AttributeValue.findOrCreate({
                        where: { attribute_id: attrData.attribute_id, value: attrData.value },
                        transaction: t
                    });

                    await VariantAttributeValue.create({
                        product_variant_id: variant.id,
                        attribute_value_id: attrValue.id
                    }, { transaction: t });
                }
            }
        }

        await t.commit();

        // Fetch the fresh variant with associations for the response
        const freshVariant = await ProductVariant.findByPk(variant.id, {
            include: [
                {
                    model: AttributeValue,
                    as: 'attribute_values',
                    include: [{ model: Attribute, as: 'attribute' }]
                }
            ]
        });

        // Map for response format consistency
        const responseData = {
            ...freshVariant.toJSON(),
            attributes: freshVariant.attribute_values.map(av => ({
                attribute_id: av.attribute.id,
                name: av.attribute.name,
                value: av.value
            }))
        };

        return successResponse(res, responseData, 'Variant updated successfully');
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

/**
 * Create Opening Stock
 */
const createOpeningStock = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { branch_id, opening_date, remarks, items } = req.body;
        const user_id = req.user.id;

        if (!branch_id) return errorResponse(res, 'Branch ID is required', 400);

        // 1. Create Opening Stock Header
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await StockOpening.count();
        const reference_number = `OS-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;

        const opening = await StockOpening.create({
            branch_id,
            user_id,
            reference_number,
            opening_date: opening_date || new Date(),
            notes: remarks,
            total_value: items.reduce((acc, item) => acc + (parseFloat(item.quantity) * parseFloat(item.cost_price || 0)), 0)
        }, { transaction: t });

        // 2. Process Items
        for (const item of items) {
            const qty = parseFloat(item.quantity || 0);
            const cost = parseFloat(item.cost_price || 0);
            const sell = parseFloat(item.selling_price || item.price || 0);
            const wholesale = parseFloat(item.wholesale_price || 0);

            // Create/Update Product Batch
            const batch = await ProductBatch.create({
                branch_id,
                product_id: item.product_id,
                product_variant_id: item.product_variant_id || null,
                batch_number: item.batch_number || null,
                expiry_date: item.expiry_date || null,
                purchase_date: opening_date || new Date(),
                cost_price: cost,
                selling_price: sell,
                wholesale_price: wholesale,
                quantity: qty,
                opening_stock_id: opening.id
            }, { transaction: t });

            // Update Global Stock
            const [stock, created] = await Stock.findOrCreate({
                where: {
                    branch_id,
                    product_id: item.product_id,
                    product_variant_id: item.product_variant_id || null
                },
                defaults: { quantity: 0 },
                transaction: t
            });
            await stock.increment('quantity', { by: qty, transaction: t });

            // Update master price if provided
            if (item.product_variant_id) {
                await ProductVariant.update(
                    { cost_price: cost, price: sell, wholesale_price: wholesale },
                    { where: { id: item.product_variant_id }, transaction: t }
                );
            } else {
                await Product.update(
                    { cost_price: cost, price: sell, wholesale_price: wholesale },
                    { where: { id: item.product_id }, transaction: t }
                );
            }
        }

        // --- ACCOUNTING ---
        const totalValue = opening.total_value;
        if (totalValue > 0) {
            // Needed models might not be imported directly, access via sequelize or implicit
            const Account = sequelize.models.Account;
            const Transaction = sequelize.models.Transaction;

            // 1. Find Accounts
            const [inventoryAccount] = await Account.findOrCreate({
                where: { organization_id: req.user.organization_id, code: '1200' },
                defaults: { name: 'Inventory Asset', type: 'asset' },
                transaction: t
            });

            const [equityAccount] = await Account.findOrCreate({
                where: { organization_id: req.user.organization_id, code: '3000' },
                defaults: { name: 'Opening Balance Equity', type: 'equity' },
                transaction: t
            });

            // 2. Debit Inventory (Increase Asset)
            await Transaction.create({
                organization_id: req.user.organization_id,
                branch_id,
                account_id: inventoryAccount.id,
                amount: totalValue,
                type: 'debit',
                reference_type: 'StockOpening',
                reference_id: opening.id,
                transaction_date: opening_date || new Date(),
                description: `Opening Stock Value: ${reference_number}`
            }, { transaction: t });
            await inventoryAccount.increment('balance', { by: totalValue, transaction: t });

            // 3. Credit Equity (Increase Equity)
            await Transaction.create({
                organization_id: req.user.organization_id,
                branch_id,
                account_id: equityAccount.id,
                amount: totalValue,
                type: 'credit',
                reference_type: 'StockOpening',
                reference_id: opening.id,
                transaction_date: opening_date || new Date(),
                description: `Opening Stock Equity: ${reference_number}`
            }, { transaction: t });
            await equityAccount.increment('balance', { by: totalValue, transaction: t });
        }

        await t.commit();
        return successResponse(res, opening, 'Opening stock recorded successfully', 201);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

/**
 * Get Product Stock (Check Stock)
 */
const getProductStock = async (req, res, next) => {
    try {
        const { search } = req.query;
        if (!search) {
            return errorResponse(res, 'Search term is required', 400);
        }

        const searchCondition = {
            [Op.or]: [
                { name: { [Op.like]: `%${search}%` } },
                { barcode: { [Op.like]: `%${search}%` } }
            ]
        };

        // 1. Search Products
        const productsMatch = await Product.findAll({
            where: searchCondition,
            include: [
                {
                    model: ProductVariant,
                    as: 'variants',
                    include: [
                        {
                            model: AttributeValue,
                            as: 'attribute_values',
                            include: [{ model: Attribute, as: 'attribute' }]
                        }
                    ]
                }
            ],
            limit: 10
        });

        // 2. Search Variants specifically
        const variantsMatch = await ProductVariant.findAll({
            where: searchCondition,
            include: [
                { model: Product, as: 'product' },
                {
                    model: AttributeValue,
                    as: 'attribute_values',
                    include: [{ model: Attribute, as: 'attribute' }]
                }
            ],
            limit: 10
        });

        const results = [];
        const seenVariantIds = new Set();
        const seenProductIds = new Set();

        // Process variant matches first (more specific)
        for (const variant of variantsMatch) {
            if (seenVariantIds.has(variant.id)) continue;
            seenVariantIds.add(variant.id);

            const stocks = await Stock.findAll({
                where: { product_variant_id: variant.id },
                include: [{ model: Branch, as: 'branch', attributes: ['name'] }]
            });

            let variantLabel = variant.name;
            if (!variantLabel && variant.attribute_values && variant.attribute_values.length > 0) {
                variantLabel = variant.attribute_values.map(av => av.value).join(" / ");
            }

            results.push({
                id: variant.id,
                name: `${variant.product?.name || 'Unknown'} - ${variantLabel || 'Default'}`,
                barcode: variant.barcode || variant.product?.barcode,
                stocks: stocks.map(s => ({
                    branch: s.branch?.name || 'Unknown',
                    quantity: s.quantity
                }))
            });
        }

        // Process product matches
        for (const product of productsMatch) {
            if (product.variants && product.variants.length > 0) {
                for (const variant of product.variants) {
                    if (seenVariantIds.has(variant.id)) continue;
                    seenVariantIds.add(variant.id);

                    const stocks = await Stock.findAll({
                        where: { product_variant_id: variant.id },
                        include: [{ model: Branch, as: 'branch', attributes: ['name'] }]
                    });

                    let variantLabel = variant.name;
                    if (!variantLabel && variant.attribute_values && variant.attribute_values.length > 0) {
                        variantLabel = variant.attribute_values.map(av => av.value).join(" / ");
                    }

                    results.push({
                        id: variant.id,
                        name: `${product.name} - ${variantLabel || 'Default'}`,
                        barcode: variant.barcode || product.barcode,
                        stocks: stocks.map(s => ({
                            branch: s.branch?.name || 'Unknown',
                            quantity: s.quantity
                        }))
                    });
                }
            } else {
                if (seenProductIds.has(product.id)) continue;
                seenProductIds.add(product.id);

                const stocks = await Stock.findAll({
                    where: { product_id: product.id, product_variant_id: null },
                    include: [{ model: Branch, as: 'branch', attributes: ['name'] }]
                });

                results.push({
                    id: product.id,
                    name: product.name,
                    barcode: product.barcode,
                    stocks: stocks.map(s => ({
                        branch: s.branch?.name || 'Unknown',
                        quantity: s.quantity
                    }))
                });
            }
        }

        return successResponse(res, results.slice(0, 15), 'Product stock fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Import Products from CSV Data
 */
const importProducts = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { products } = req.body;
        const organization_id = req.user.organization_id;
        const results = { success: 0, failed: 0, logs: [] };

        if (!products || !Array.isArray(products)) {
            return errorResponse(res, 'No product data provided', 400);
        }

        for (const [index, p] of products.entries()) {
            try {
                // 1. Resolve Main Category
                const [category] = await MainCategory.findOrCreate({
                    where: {
                        organization_id,
                        name: p.main_category || 'Uncategorized'
                    },
                    transaction: t
                });

                // 2. Resolve Brand (if provided)
                let brand_id = null;
                if (p.brand) {
                    const [brand] = await Brand.findOrCreate({
                        where: { organization_id, name: p.brand },
                        transaction: t
                    });
                    brand_id = brand.id;
                }

                // 3. Resolve Unit (if provided)
                let unit_id = null;
                if (p.unit) {
                    const [unit] = await Unit.findOrCreate({
                        where: { organization_id, name: p.unit },
                        transaction: t
                    });
                    unit_id = unit.id;
                }

                // 4. Create Product
                const product = await Product.create({
                    organization_id,
                    name: p.name,
                    code: p.code || `PRD-${Date.now()}-${index}`,
                    main_category_id: category.id,
                    brand_id,
                    unit_id,
                    description: p.description || '',
                    sku: p.sku || p.code,
                    is_active: true,
                    is_variant: false // Bulk import usually creates simple products first
                }, { transaction: t });

                // 5. Create Default Variant
                await ProductVariant.create({
                    product_id: product.id,
                    name: 'Default',
                    sku: product.sku,
                    code: product.code,
                    price: parseFloat(p.selling_price || 0),
                    cost_price: parseFloat(p.cost_price || 0),
                    stock_quantity: 0, // Stock handled separately via batch/opening
                    is_active: true,
                    is_default: true
                }, { transaction: t });

                results.success++;
            } catch (error) {
                results.failed++;
                results.logs.push({ row: index + 1, msg: error.message });
            }
        }

        await t.commit();
        return successResponse(res, results, 'Import completed');
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

/**
 * Export Products to CSV Data
 */
const exportProducts = async (req, res, next) => {
    try {
        const products = await Product.findAll({
            where: { organization_id: req.user.organization_id },
            include: [
                { model: MainCategory, as: 'main_category' },
                { model: Brand, as: 'brand' },
                { model: Unit, as: 'unit' },
                { model: ProductVariant, as: 'variants' }
            ]
        });

        // Flatten for CSV
        const data = products.map(p => ({
            name: p.name,
            code: p.code,
            sku: p.sku,
            main_category: p.main_category?.name || '',
            brand: p.brand?.name || '',
            unit: p.unit?.name || '',
            selling_price: p.variants?.[0]?.price || 0,
            cost_price: p.variants?.[0]?.cost_price || 0,
            is_active: p.is_active ? 'Yes' : 'No'
        }));

        return successResponse(res, data, 'Export data fetched');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllProducts,
    getActiveProductsList,
    createProduct,
    getProductById,
    updateProduct,
    deleteProduct,
    toggleProductStatus,
    toggleVariantStatus,
    createVariant,
    updateVariant,
    getVariantById,
    createOpeningStock,
    getProductStock,
    importProducts,
    exportProducts
};
