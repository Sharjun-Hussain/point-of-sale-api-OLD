const { Product, ProductVariant, MainCategory, SubCategory, Brand, Unit, MeasurementUnit, Container, Stock, Branch, ProductBatch, StockOpening, Attribute, AttributeValue, VariantAttributeValue, Supplier, Account, Transaction, sequelize } = require('../models');
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

        const where = { organization_id: req.user.organization_id };
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
        let {
            name, code, description, sku, barcode,
            main_category_id, sub_category_id, brand_id,
            unit_id, measurement_id, container_id, supplier_id, is_variant, is_active,

            variants, product_attributes, suppliers // Added suppliers array
        } = req.body;

        // Parse JSON strings if they come from multipart/form-data
        if (typeof variants === 'string') { try { variants = JSON.parse(variants); } catch (e) { variants = []; } }
        if (typeof product_attributes === 'string') { try { product_attributes = JSON.parse(product_attributes); } catch (e) { product_attributes = []; } }
        if (typeof suppliers === 'string') { try { suppliers = JSON.parse(suppliers); } catch (e) { suppliers = []; } }
        
        is_variant = is_variant === 'true' || is_variant === true || is_variant === '1';
        is_active = is_active === 'true' || is_active === true || is_active === '1' || is_active === undefined;

        // Handle Image Upload
        let imagePath = null;
        if (req.files && req.files.length > 0) {
            const imagePaths = req.files.map(file => file.path);
            imagePath = JSON.stringify(imagePaths);
        }

        const organization_id = req.user.organization_id;

        // Create product
        const product = await Product.create({
            name,
            code: code === '' ? null : code,
            description,
            main_category_id,
            sub_category_id,
            brand_id,
            unit_id,
            measurement_id,
            container_id,
            supplier_id,
            is_variant,
            is_active,
            image: imagePath,
            organization_id
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
                    product_id: product.id,
                    organization_id
                }, { transaction: t });

                // Link Attributes if provided (e.g., v.attributes = [{ name: 'Color', value: 'Red' }])
                if (v.attributes && Array.isArray(v.attributes)) {
                    for (const attrData of v.attributes) {
                        // 1. Find or Create Attribute (Filtered by Org)
                        const [attribute] = await Attribute.findOrCreate({
                            where: { name: attrData.name, organization_id },
                            transaction: t
                        });

                        // 2. Find or Create Attribute Value (Filtered by Org)
                        const [attrValue] = await AttributeValue.findOrCreate({
                            where: { attribute_id: attribute.id, value: attrData.value, organization_id },
                            transaction: t
                        });

                        // 3. Link to Variant
                        await VariantAttributeValue.create({
                            product_variant_id: variant.id,
                            attribute_value_id: attrValue.id
                        }, { transaction: t });
                    }
                }

                // --- STOCK: Initialize Stock if provided ---
                if (parseFloat(v.stock_quantity) > 0) {
                    let branch_id = req.body.branch_id || req.user.branch_id;
                    
                    if (!branch_id && req.user.branches && req.user.branches.length > 0) {
                        branch_id = req.user.branches[0].id;
                    }
                    
                    if (!branch_id && req.user.employee) {
                        branch_id = req.user.employee.branch_id;
                        if (!branch_id && req.user.employee.branches && req.user.employee.branches.length > 0) {
                            branch_id = req.user.employee.branches[0].id;
                        }
                    }

                    if (!branch_id) {
                        const firstBranch = await Branch.findOne({ where: { organization_id } });
                        if (firstBranch) branch_id = firstBranch.id;
                    }

                    if (branch_id) {
                        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                        const reference_number = `OS-PRD-VAR-${variant.sku}-${dateStr}`;

                        const opening = await StockOpening.create({
                            organization_id,
                            branch_id,
                            user_id: req.user.id,
                            reference_number,
                            opening_date: new Date(),
                            notes: `Opening stock for variant ${variant.sku} during product creation`,
                            total_value: parseFloat(v.stock_quantity) * (parseFloat(v.cost_price) || 0)
                        }, { transaction: t });

                        await ProductBatch.create({
                            organization_id,
                            branch_id,
                            product_id: product.id,
                            product_variant_id: variant.id,
                            quantity: parseFloat(v.stock_quantity),
                            cost_price: parseFloat(v.cost_price) || 0,
                            selling_price: parseFloat(v.price) || 0,
                            wholesale_price: parseFloat(v.wholesale_price) || 0,
                            purchase_date: new Date(),
                            is_active: true,
                            opening_stock_id: opening.id
                        }, { transaction: t });

                        const [stockRecord] = await Stock.findOrCreate({
                            where: { organization_id, branch_id, product_id: product.id, product_variant_id: variant.id },
                            defaults: { quantity: 0 },
                            transaction: t
                        });
                        await stockRecord.increment('quantity', { by: parseFloat(v.stock_quantity), transaction: t });
                    }
                }
            }
        }

        await t.commit();

        const createdProduct = await Product.findOne({
            where: { id: product.id, organization_id },
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
        const product = await Product.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id },
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

        const organization_id = req.user.organization_id;

        const product = await Product.findOne({
            where: { id, organization_id }
        });
        if (!product) {
            await t.rollback();
            return errorResponse(res, 'Product not found', 404);
        }

        const updates = {
            name,
            code: code === '' ? null : code,
            description,
            main_category_id,
            sub_category_id,
            brand_id,
            unit_id,
            measurement_id,
            container_id,
            supplier_id,
            sku,
            barcode,
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
                    const variant = await ProductVariant.findOne({ 
                        where: { id: variantData.id, product_id: id, organization_id } 
                    });
                    if (variant) {
                        await variant.update(variantData, { transaction: t });
                    }
                } else {
                    // Create new variant
                    const variant = await ProductVariant.create({
                        ...variantData,
                        product_id: id,
                        organization_id
                    }, { transaction: t });

                    // --- STOCK: Initialize Stock if provided ---
                    if (parseFloat(variantData.stock_quantity) > 0) {
                        let branch_id = req.body.branch_id || req.user.branch_id;
                        
                        if (!branch_id && req.user.branches && req.user.branches.length > 0) {
                            branch_id = req.user.branches[0].id;
                        }
                        
                        if (!branch_id && req.user.employee) {
                            branch_id = req.user.employee.branch_id;
                            if (!branch_id && req.user.employee.branches && req.user.employee.branches.length > 0) {
                                branch_id = req.user.employee.branches[0].id;
                            }
                        }

                        if (!branch_id) {
                            const firstBranch = await Branch.findOne({ where: { organization_id } });
                            if (firstBranch) branch_id = firstBranch.id;
                        }

                        if (branch_id) {
                            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                            const reference_number = `OS-PRD-EDIT-VAR-${variant.sku}-${dateStr}`;

                            const opening = await StockOpening.create({
                                organization_id,
                                branch_id,
                                user_id: req.user.id,
                                reference_number,
                                opening_date: new Date(),
                                notes: `Opening stock for new variant ${variant.sku} added during product edit`,
                                total_value: parseFloat(variantData.stock_quantity) * (parseFloat(variantData.cost_price) || 0)
                            }, { transaction: t });

                            await ProductBatch.create({
                                organization_id,
                                branch_id,
                                product_id: id,
                                product_variant_id: variant.id,
                                quantity: parseFloat(variantData.stock_quantity),
                                cost_price: parseFloat(variantData.cost_price) || 0,
                                selling_price: parseFloat(variantData.price) || 0,
                                wholesale_price: parseFloat(variantData.wholesale_price) || 0,
                                purchase_date: new Date(),
                                is_active: true,
                                opening_stock_id: opening.id
                            }, { transaction: t });

                            const [stockRecord] = await Stock.findOrCreate({
                                where: { organization_id, branch_id, product_id: id, product_variant_id: variant.id },
                                defaults: { quantity: 0 },
                                transaction: t
                            });
                            await stockRecord.increment('quantity', { by: parseFloat(variantData.stock_quantity), transaction: t });
                        }
                    }
                }
            }
        }

        await t.commit();

        // Fetch fresh product with all associations
        const updatedProduct = await Product.findOne({
            where: { id, organization_id },
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
        const product = await Product.findOne({
            where: { id, organization_id: req.user.organization_id }
        });
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
        const { branch_id } = req.query;
        const products = await Product.findAll({
            where: { is_active: true, organization_id: req.user.organization_id },
            attributes: ['id', 'name', 'sku', 'barcode', 'code', 'image', 'main_category_id', 'is_variant'],
            include: [
                { model: MainCategory, as: 'main_category', attributes: ['id', 'name'] },
                { model: Brand, as: 'brand', attributes: ['id', 'name'] },
                {
                    model: Stock,
                    as: 'stocks',
                    attributes: ['quantity', 'branch_id'],
                    where: branch_id ? { branch_id } : {},
                    required: false
                },
                {
                    model: ProductVariant,
                    as: 'variants',
                    where: { is_active: true, organization_id: req.user.organization_id },
                    required: false,
                    attributes: ['id', 'product_id', 'name', 'sku', 'barcode', 'price', 'wholesale_price', 'stock_quantity'],
                    include: [
                        {
                            model: AttributeValue,
                            as: 'attribute_values',
                            include: [{ model: Attribute, as: 'attribute', attributes: ['id', 'name'] }]
                        },
                        {
                            model: Stock,
                            as: 'stocks',
                            attributes: ['quantity', 'branch_id'],
                            where: branch_id ? { branch_id } : {},
                            required: false
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
        const product = await Product.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!product) return errorResponse(res, 'Product not found', 404);

        const action = req.params.action || (product.is_active ? 'deactivate' : 'activate');
        const oldStatus = product.is_active;
        product.is_active = (action === 'activate');
        await product.save();

        // Log product status toggle
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            req.user?.organization_id,
            req.user?.id,
            'Product',
            product.id,
            { is_active: oldStatus },
            { is_active: product.is_active },
            ipAddress,
            userAgent,
            { action: `Product ${action}d` }
        );

        return successResponse(res, product, `Product ${action}d successfully`);
    } catch (error) {
        next(error);
    }
};

const toggleVariantStatus = async (req, res, next) => {
    try {
        const variant = await ProductVariant.findOne({
            where: { 
                id: req.params.variantId, 
                product_id: req.params.id,
                organization_id: req.user.organization_id 
            }
        });
        if (!variant) return errorResponse(res, 'Variant not found', 404);

        const action = req.params.action || (variant.is_active ? 'deactivate' : 'activate');
        const oldStatus = variant.is_active;
        variant.is_active = (action === 'activate');
        await variant.save();

        // Log variant status toggle
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            req.user?.organization_id,
            req.user?.id,
            'ProductVariant',
            variant.id,
            { is_active: oldStatus },
            { is_active: variant.is_active },
            ipAddress,
            userAgent,
            { action: `Variant ${action}d`, product_id: req.params.id }
        );

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

        const organization_id = req.user.organization_id;
        const product = await Product.findOne({
            where: { id, organization_id }
        });
        if (!product) return errorResponse(res, 'Product not found', 404);

        // Handle Image Upload
        let imagePath = null;
        if (req.files && req.files.length > 0) {
            const imagePaths = req.files.map(file => file.path);
            imagePath = JSON.stringify(imagePaths);
        }

        const variant = await ProductVariant.create({
            product_id: id,
            organization_id,
            name, 
            sku: sku === '' ? null : sku, 
            code: code === '' ? null : code, 
            barcode: barcode === '' ? null : barcode,
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
                        where: { 
                            attribute_id: attrData.attribute_id, 
                            value: attrData.value,
                            organization_id
                        },
                        transaction: t
                    });

                    await VariantAttributeValue.create({
                        product_variant_id: variant.id,
                        attribute_value_id: attrValue.id,
                        organization_id
                    }, { transaction: t });
                }
            }
        }

        if (variant && parseFloat(stock_quantity) > 0) {
            let branch_id = req.body.branch_id || req.user.branch_id;
            
            if (!branch_id && req.user.branches && req.user.branches.length > 0) {
                branch_id = req.user.branches[0].id;
            }
            
            if (!branch_id && req.user.employee) {
                branch_id = req.user.employee.branch_id;
                if (!branch_id && req.user.employee.branches && req.user.employee.branches.length > 0) {
                    branch_id = req.user.employee.branches[0].id;
                }
            }

            if (!branch_id) {
                const firstBranch = await Branch.findOne({ where: { organization_id } });
                if (firstBranch) branch_id = firstBranch.id;
            }

            if (branch_id) {
                // 1. Create Opening Stock Header for this specific variant initialization
                const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const reference_number = `OS-VAR-${variant.sku}-${dateStr}`;

                const opening = await StockOpening.create({
                    organization_id,
                    branch_id,
                    user_id: req.user.id,
                    reference_number,
                    opening_date: new Date(),
                    notes: `Opening stock for new variant: ${variant.sku}`,
                    total_value: parseFloat(stock_quantity) * (parseFloat(cost_price) || 0)
                }, { transaction: t });

                // 2. Create Product Batch
                await ProductBatch.create({
                    organization_id,
                    branch_id,
                    product_id: id,
                    product_variant_id: variant.id,
                    quantity: parseFloat(stock_quantity),
                    cost_price: parseFloat(cost_price) || 0,
                    selling_price: parseFloat(price) || 0,
                    wholesale_price: parseFloat(wholesale_price) || 0,
                    purchase_date: new Date(),
                    is_active: true,
                    opening_stock_id: opening.id
                }, { transaction: t });

                // 3. Update/Create Global Stock
                const [stockRecord] = await Stock.findOrCreate({
                    where: {
                        organization_id,
                        branch_id,
                        product_id: id,
                        product_variant_id: variant.id
                    },
                    defaults: { quantity: 0 },
                    transaction: t
                });
                await stockRecord.increment('quantity', { by: parseFloat(stock_quantity), transaction: t });
            }
        }

        await t.commit();

        // Fetch the fresh variant with associations for the response
        const freshVariant = await ProductVariant.findOne({
            where: { id: variant.id, organization_id },
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

        // Log variant creation
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            req.user?.organization_id,
            req.user?.id,
            'ProductVariant',
            variant.id,
            {
                name: variant.name,
                sku: variant.sku,
                code: variant.code,
                product_id: id
            },
            ipAddress,
            userAgent
        );

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
        const variant = await ProductVariant.findOne({
            where: { id: variantId, organization_id: req.user.organization_id },
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

        const organization_id = req.user.organization_id;

        const variant = await ProductVariant.findOne({ 
            where: { id: variantId, product_id: id, organization_id } 
        });
        if (!variant) {
            await t.rollback();
            return errorResponse(res, 'Variant not found', 404);
        }

        const updates = {
            name, 
            sku: sku === '' ? null : sku, 
            code: code === '' ? null : code, 
            barcode: barcode === '' ? null : barcode,
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
                    where: { product_variant_id: variant.id, organization_id },
                    transaction: t
                });

                for (const attrData of parsedAttributes) {
                    if (!attrData.value) continue;

                    const [attrValue] = await AttributeValue.findOrCreate({
                        where: { 
                            attribute_id: attrData.attribute_id, 
                            value: attrData.value,
                            organization_id
                        },
                        transaction: t
                    });

                    await VariantAttributeValue.create({
                        product_variant_id: variant.id,
                        attribute_value_id: attrValue.id,
                        organization_id
                    }, { transaction: t });
                }
            }
        }

        await t.commit();

        // Fetch the fresh variant with associations for the response
        const freshVariant = await ProductVariant.findOne({
            where: { id: variant.id, organization_id },
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

        // Log variant update
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            req.user?.organization_id,
            req.user?.id,
            'ProductVariant',
            variant.id,
            { name: variant.name, sku: variant.sku }, // Simplified old values
            {
                name,
                sku: updates.sku,
                code: updates.code,
                barcode: updates.barcode
            },
            ipAddress,
            userAgent,
            { product_id: id }
        );

        return successResponse(res, responseData, 'Variant updated successfully');
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

const deleteVariant = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id, variantId } = req.params;
        const organization_id = req.user.organization_id;

        const variant = await ProductVariant.findOne({ 
            where: { id: variantId, product_id: id, organization_id } 
        });

        if (!variant) {
            await t.rollback();
            return errorResponse(res, 'Variant not found', 404);
        }

        // 1. Check for dependent records (Sales, Purchase Orders, etc.)
        const stockCount = await Stock.count({ where: { product_variant_id: variant.id, organization_id } });
        if (stockCount > 0) {
            await t.rollback();
            return errorResponse(res, 'Cannot delete variant with existing stock. Please adjust stock to zero first.', 400);
        }

        // 2. Log deletion before it's gone
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logDelete(
            organization_id,
            req.user?.id,
            'ProductVariant',
            variant.id,
            { name: variant.name, sku: variant.sku, code: variant.code },
            ipAddress,
            userAgent,
            { product_id: id }
        );

        // 3. Delete the variant
        await variant.destroy({ transaction: t });

        await t.commit();
        return successResponse(res, null, 'Variant deleted successfully');
    } catch (error) {
        await t.rollback();
        // Handle database constraint errors
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return errorResponse(res, 'Cannot delete variant because it is referenced by other records (e.g., Sales, Orders).', 400);
        }
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
        const organization_id = req.user.organization_id;

        if (!branch_id) return errorResponse(res, 'Branch ID is required', 400);

        // 1. Create Opening Stock Header
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await StockOpening.count({ where: { organization_id } });
        const reference_number = `OS-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;

        const opening = await StockOpening.create({
            organization_id,
            branch_id,
            user_id: req.user.id,
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
                organization_id,
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
                    organization_id,
                    branch_id,
                    product_id: item.product_id,
                    product_variant_id: item.product_variant_id || null
                },
                defaults: { quantity: 0 },
                transaction: t
            });
            await stock.increment('quantity', { by: qty, transaction: t });

            // Update master price if provided - Always stored in ProductVariant
            if (item.product_variant_id) {
                await ProductVariant.update(
                    { cost_price: cost, price: sell, wholesale_price: wholesale },
                    { where: { id: item.product_variant_id, organization_id }, transaction: t }
                );
            } else {
                // Find the first/default variant for this product to update its price
                const defaultVariant = await ProductVariant.findOne({
                    where: { product_id: item.product_id, organization_id },
                    order: [['is_default', 'DESC'], ['created_at', 'ASC']],
                    transaction: t
                });
                
                if (defaultVariant) {
                    await defaultVariant.update(
                        { cost_price: cost, price: sell, wholesale_price: wholesale },
                        { transaction: t }
                    );
                }
            }
        }

        // --- ACCOUNTING ---
        const totalValue = opening.total_value;
        if (totalValue > 0) {
            // Needed models might not be imported directly, access via sequelize or implicit
            // Logic handled via imported models

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
            where: { ...searchCondition, organization_id: req.user.organization_id },
            include: [
                {
                    model: ProductVariant,
                    as: 'variants',
                    where: { organization_id: req.user.organization_id },
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
            limit: 10
        });

        // 2. Search Variants specifically
        const variantsMatch = await ProductVariant.findAll({
            where: { ...searchCondition, organization_id: req.user.organization_id },
            include: [
                { 
                    model: Product, 
                    as: 'product',
                    where: { organization_id: req.user.organization_id }
                },
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
                where: { 
                    product_variant_id: variant.id, 
                    organization_id: req.user.organization_id 
                },
                include: [{ model: Branch, as: 'branch', attributes: ['name'] }]
            });

            let variantLabel = variant.name;
            if (!variantLabel && variant.attribute_values && variant.attribute_values.length > 0) {
                variantLabel = variant.attribute_values.map(av => av.value).join(" / ");
            }

            results.push({
                id: variant.id,
                variantId: variant.id,
                productId: variant.product_id,
                name: `${variant.product?.name || 'Unknown'} - ${variantLabel || 'Default'}`,
                barcode: variant.barcode || variant.product?.barcode,
                retailPrice: parseFloat(variant.price) || 0,
                wholesalePrice: parseFloat(variant.wholesale_price) || 0,
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
                        where: { 
                            product_variant_id: variant.id, 
                            organization_id: req.user.organization_id 
                        },
                        include: [{ model: Branch, as: 'branch', attributes: ['name'] }]
                    });

                    let variantLabel = variant.name;
                    if (!variantLabel && variant.attribute_values && variant.attribute_values.length > 0) {
                        variantLabel = variant.attribute_values.map(av => av.value).join(" / ");
                    }

                    results.push({
                        id: variant.id,
                        variantId: variant.id,
                        productId: variant.product_id,
                        name: `${product.name} - ${variantLabel || 'Default'}`,
                        barcode: variant.barcode || product.barcode,
                        retailPrice: parseFloat(variant.price) || 0,
                        wholesalePrice: parseFloat(variant.wholesale_price) || 0,
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
                    where: { 
                        product_id: product.id, 
                        product_variant_id: null,
                        organization_id: req.user.organization_id
                    },
                    include: [{ model: Branch, as: 'branch', attributes: ['name'] }]
                });

                results.push({
                    id: product.id,
                    variantId: product.id,
                    productId: product.id,
                    name: product.name,
                    barcode: product.barcode,
                    retailPrice: parseFloat(product.price || product.variants?.[0]?.price) || 0,
                    wholesalePrice: parseFloat(product.wholesale_price || product.variants?.[0]?.wholesale_price) || 0,
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

                // 2. Resolve Brand
                let brand_id = null;
                if (p.brand) {
                    const [brand] = await Brand.findOrCreate({
                        where: { organization_id, name: p.brand },
                        transaction: t
                    });
                    brand_id = brand.id;
                }

                // 3. Resolve Unit
                let unit_id = null;
                if (p.unit) {
                    const [unit] = await Unit.findOrCreate({
                        where: { organization_id, name: p.unit },
                        transaction: t
                    });
                    unit_id = unit.id;
                }

                // 4. Find or Create Product (Deduplicate by Name or Code)
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
                        brand_id,
                        unit_id,
                        description: p.description || '',
                        sku: p.sku || p.code,
                        is_active: true,
                        is_variant: true // Enable variants support
                    },
                    transaction: t
                });

                // 5. Find or Create Variant
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
                        barcode: p.barcode || p.code,
                        price: parseFloat(p.selling_price || 0),
                        cost_price: parseFloat(p.cost_price || 0),
                        stock_quantity: 0,
                        is_active: true,
                        is_default: productCreated
                    },
                    transaction: t
                });

                if (!variantCreated) {
                    // Update existing variant price/cost if it already exists
                    await variant.update({
                        price: parseFloat(p.selling_price || variant.price),
                        cost_price: parseFloat(p.cost_price || variant.cost_price)
                    }, { transaction: t });
                }

                // 6. Handle Initial Stock if provided
                if (parseFloat(p.stock_qty) > 0) {
                    // Resolve Branch (Default to user's branch or first available)
                    let branch_id = req.user.branch_id;
                    if (!branch_id && req.user.branches && req.user.branches.length > 0) {
                        branch_id = req.user.branches[0].id;
                    }
                    if (!branch_id) {
                        const firstBranch = await Branch.findOne({ where: { organization_id } });
                        if (firstBranch) branch_id = firstBranch.id;
                    }

                    if (branch_id) {
                        // Create Opening Stock Header if not exists for this import
                        const reference_number = `IMP-OS-${product.code}-${Date.now()}`;
                        const opening = await StockOpening.create({
                            organization_id,
                            branch_id,
                            user_id: req.user.id,
                            reference_number,
                            opening_date: new Date(),
                            notes: 'Automatic opening stock from bulk import',
                            total_value: parseFloat(p.stock_qty) * parseFloat(p.cost_price || 0)
                        }, { transaction: t });

                        // Create Batch
                        await ProductBatch.create({
                            organization_id,
                            branch_id,
                            product_id: product.id,
                            product_variant_id: variant.id,
                            quantity: parseFloat(p.stock_qty),
                            cost_price: parseFloat(p.cost_price || 0),
                            selling_price: parseFloat(p.selling_price || 0),
                            purchase_date: new Date(),
                            is_active: true,
                            opening_stock_id: opening.id
                        }, { transaction: t });

                        // Update Global Stock
                        const [stockRecord] = await Stock.findOrCreate({
                            where: {
                                organization_id,
                                branch_id,
                                product_id: product.id,
                                product_variant_id: variant.id
                            },
                            defaults: { quantity: 0 },
                            transaction: t
                        });
                        await stockRecord.increment('quantity', { by: parseFloat(p.stock_qty), transaction: t });
                    }
                }

                results.success++;
            } catch (error) {
                results.failed++;
                results.logs.push({ row: index + 1, name: p.name, msg: error.message });
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
    exportProducts,
    deleteVariant,
    getVariantBatches
};

/**
 * Get Batches for a Variant (Active only)
 */
async function getVariantBatches(req, res, next) {
    try {
        const { variantId } = req.params;
        const branch_id = req.query.branch_id || req.user.branch_id;

        const batches = await ProductBatch.findAll({
            where: {
                product_variant_id: variantId,
                organization_id: req.user.organization_id,
                branch_id: branch_id || null,
                quantity: { [Op.gt]: 0 },
                is_active: true
            },
            order: [
                ['expiry_date', 'ASC'],
                ['created_at', 'ASC']
            ]
        });

        return successResponse(res, batches, 'Variant batches fetched successfully');
    } catch (error) { next(error); }
}
