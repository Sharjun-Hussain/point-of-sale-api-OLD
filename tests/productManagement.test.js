const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Product & Variant Management Full Lifecycle Tests', () => {
    let authHeader;
    let testUser;
    let testOrg;
    let testBranch;
    let testCategory;
    let testBrand;
    let testUnit;

    jest.setTimeout(60000);

    beforeAll(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.User.destroy({ where: {} });
        await db.Role.destroy({ where: {} });
        await db.Organization.destroy({ where: {} });
        await db.Branch.destroy({ where: {} });
        await db.MainCategory.destroy({ where: {} });
        await db.Brand.destroy({ where: {} });
        await db.Unit.destroy({ where: {} });
        await db.Product.destroy({ where: {} });
        await db.ProductVariant.destroy({ where: {} });
        await db.Stock.destroy({ where: {} });
        await db.ProductBatch.destroy({ where: {} });
        await db.Attribute.destroy({ where: {} });
        await db.AttributeValue.destroy({ where: {} });
        await db.VariantAttributeValue.destroy({ where: {} });
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Seed Organization & Branch
        testOrg = await db.Organization.create({
            name: 'Management Test Org',
            status: 'active'
        });

        testBranch = await db.Branch.create({
            organization_id: testOrg.id,
            name: 'Main Store',
            branch_code: 'MS001',
            status: 'active'
        });

        // Seed Catalog Dependencies
        testCategory = await db.MainCategory.create({ organization_id: testOrg.id, name: 'Gadgets' });
        testBrand = await db.Brand.create({ organization_id: testOrg.id, name: 'AlphaTech' });
        testUnit = await db.Unit.create({ organization_id: testOrg.id, name: 'Unit', short_name: 'U' });

        // Seed Admin user
        const adminRole = await db.Role.create({
            name: 'Super Admin',
            is_system_role: true
        });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            name: 'Manager User',
            username: 'manager',
            email: 'manager@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(adminRole);

        // Login to get token
        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({
                email: 'manager@example.com',
                password: 'password123'
            });

        authHeader = `Bearer ${loginRes.body.data.auth_token}`;
    });

    describe('Product Creation & Retrieval', () => {
        it('should create a product with variants and attributes', async () => {
            const response = await request(app)
                .post('/api/v1/products')
                .set('Authorization', authHeader)
                .send({
                    name: 'Modular Phone',
                    code: 'MP-001',
                    sku: 'MP-SKU-001',
                    main_category_id: testCategory.id,
                    brand_id: testBrand.id,
                    unit_id: testUnit.id,
                    is_variant: true,
                    variants: JSON.stringify([
                        {
                            name: 'Base Model',
                            sku: 'MP-BASE',
                            price: 500,
                            cost_price: 300,
                            is_default: true,
                            attributes: [
                                { name: 'Color', value: 'Black' },
                                { name: 'Storage', value: '64GB' }
                            ]
                        },
                        {
                            name: 'Pro Model',
                            sku: 'MP-PRO',
                            price: 800,
                            cost_price: 500,
                            is_default: false,
                            attributes: [
                                { name: 'Color', value: 'Silver' },
                                { name: 'Storage', value: '256GB' }
                            ]
                        }
                    ])
                });

            expect(response.status).toBe(201);
            expect(response.body.data.name).toBe('Modular Phone');
            
            const product = await db.Product.findOne({ 
                where: { id: response.body.data.id },
                include: [{ model: db.ProductVariant, as: 'variants' }]
            });
            expect(product.variants.length).toBe(2);
        });

        it('should fetch product details with variants', async () => {
            const product = await db.Product.findOne({ where: { name: 'Modular Phone' } });
            const response = await request(app)
                .get(`/api/v1/products/${product.id}`)
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(response.body.data.variants.length).toBe(2);
        });

        it('should fail to create a product with duplicate SKU', async () => {
            const response = await request(app)
                .post('/api/v1/products')
                .set('Authorization', authHeader)
                .send({
                    name: 'Duplicate Phone',
                    code: 'MP-001', // Duplicate code too
                    sku: 'MP-SKU-001', // Already used by Modular Phone
                    main_category_id: testCategory.id,
                    unit_id: testUnit.id
                });

            expect(response.status).toBeGreaterThanOrEqual(400);
        });

        it('should create a simple product without variants', async () => {
            const response = await request(app)
                .post('/api/v1/products')
                .set('Authorization', authHeader)
                .send({
                    name: 'Simple Watch',
                    sku: 'SW-001',
                    code: 'SW-CODE-001',
                    is_variant: false,
                    main_category_id: testCategory.id,
                    unit_id: testUnit.id
                });

            expect(response.status).toBe(201);
            expect(response.body.data.is_variant).toBe(false);
        });
    });

    describe('Product Updates & Integrity', () => {
        let testProduct;
        beforeAll(async () => {
            testProduct = await db.Product.findOne({ where: { name: 'Simple Watch' } });
        });

        it('should update product basic details', async () => {
            const response = await request(app)
                .put(`/api/v1/products/${testProduct.id}`)
                .set('Authorization', authHeader)
                .send({
                    name: 'Simple Watch Pro',
                    description: 'Upgraded version'
                });

            expect(response.status).toBe(200);
            expect(response.body.data.name).toBe('Simple Watch Pro');
        });

        it('should upsert variants during product update', async () => {
            const product = await db.Product.findOne({ where: { name: 'Modular Phone' } });
            const existingVariant = await db.ProductVariant.findOne({ where: { sku: 'MP-BASE' } });

            const response = await request(app)
                .put(`/api/v1/products/${product.id}`)
                .set('Authorization', authHeader)
                .send({
                    name: 'Modular Phone v2',
                    variants: [
                        {
                            id: existingVariant.id,
                            price: 600 // Update price
                        },
                        {
                            name: 'Ultra Model',
                            sku: 'MP-ULTRA',
                            price: 1200,
                            cost_price: 900
                        }
                    ]
                });

            expect(response.status).toBe(200);
            
            const updatedProduct = await db.Product.findOne({
                where: { id: product.id },
                include: [{ model: db.ProductVariant, as: 'variants' }]
            });
            expect(updatedProduct.variants.length).toBe(3);
            const ultra = updatedProduct.variants.find(v => v.sku === 'MP-ULTRA');
            expect(ultra).toBeDefined();
        });

        it('should fail to update a non-existent product', async () => {
            const response = await request(app)
                .put('/api/v1/products/00000000-0000-0000-0000-000000000000')
                .set('Authorization', authHeader)
                .send({ name: 'Ghost' });

            expect(response.status).toBe(404);
        });
    });

    describe('Variant Updates', () => {
        let variant;
        beforeAll(async () => {
            variant = await db.ProductVariant.findOne({ where: { sku: 'MP-BASE' } });
        });

        it('should update variant price and cost', async () => {
            const response = await request(app)
                .post(`/api/v1/products/${variant.product_id}/variants/${variant.id}`)
                .set('Authorization', authHeader)
                .send({
                    price: 550,
                    cost_price: 320,
                    name: 'Base Model Updated'
                });

            expect(response.status).toBe(200);
            expect(Number(response.body.data.price)).toBe(550);
            
            const updated = await db.ProductVariant.findByPk(variant.id);
            expect(Number(updated.cost_price)).toBe(320);
        });

        it('should toggle variant status', async () => {
            const response = await request(app)
                .patch(`/api/v1/products/${variant.product_id}/variants/${variant.id}/deactivate`)
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            
            const updated = await db.ProductVariant.findByPk(variant.id);
            expect(updated.is_active).toBe(false);
        });

        it('should add a new variant to an existing product individually', async () => {
            const product = await db.Product.findOne({ where: { name: 'Simple Watch Pro' } });
            const response = await request(app)
                .post(`/api/v1/products/${product.id}/variants`)
                .set('Authorization', authHeader)
                .send({
                    name: 'Leather Strap',
                    sku: 'SW-LEATHER',
                    price: 150,
                    cost_price: 100,
                    stock_quantity: 50
                });

            expect(response.status).toBe(201);
            expect(response.body.data.sku).toBe('SW-LEATHER');

            // Verify stock was initialized
            const stock = await db.Stock.findOne({
                where: { product_variant_id: response.body.data.id }
            });
            expect(Number(stock.quantity)).toBe(50);
        });
    });

    describe('Stock Adjustments for Variants', () => {
        let variant;
        beforeAll(async () => {
            variant = await db.ProductVariant.findOne({ where: { sku: 'MP-PRO' } });
        });

        it('should adjust stock for a specific variant', async () => {
            const response = await request(app)
                .post('/api/v1/stocks/adjust')
                .set('Authorization', authHeader)
                .send({
                    branch_id: testBranch.id,
                    product_id: variant.product_id,
                    product_variant_id: variant.id,
                    quantity: 100,
                    type: 'addition',
                    reason: 'Bulk stock arrival'
                });

            expect(response.status).toBe(201);
            
            const stock = await db.Stock.findOne({
                where: { branch_id: testBranch.id, product_variant_id: variant.id }
            });
            expect(Number(stock.quantity)).toBe(100);
        });

        it('should subtract stock from a specific variant', async () => {
            const response = await request(app)
                .post('/api/v1/stocks/adjust')
                .set('Authorization', authHeader)
                .send({
                    branch_id: testBranch.id,
                    product_id: variant.product_id,
                    product_variant_id: variant.id,
                    quantity: 20,
                    type: 'subtraction',
                    reason: 'Damage'
                });

            expect(response.status).toBe(201);
            
            const stock = await db.Stock.findOne({
                where: { branch_id: testBranch.id, product_variant_id: variant.id }
            });
            expect(Number(stock.quantity)).toBe(80);
        });
    });

    describe('Variant Deletion', () => {
        it('should block deletion of a variant with stock', async () => {
            const variant = await db.ProductVariant.findOne({ where: { sku: 'MP-PRO' } });
            const response = await request(app)
                .delete(`/api/v1/products/${variant.product_id}/variants/${variant.id}`)
                .set('Authorization', authHeader);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Cannot delete variant with existing stock');
        });

        it('should allow deletion of a variant without stock', async () => {
            // Create a temporary variant without stock
            // Use SKU to find product since name might have changed
            const product = await db.Product.findOne({ where: { name: 'Modular Phone v2' } });
            const tempVariant = await db.ProductVariant.create({
                organization_id: testOrg.id,
                product_id: product.id,
                sku: 'TEMP-SKU',
                name: 'Temp Variant'
            });

            const response = await request(app)
                .delete(`/api/v1/products/${product.id}/variants/${tempVariant.id}`)
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            
            const deleted = await db.ProductVariant.findByPk(tempVariant.id);
            expect(deleted).toBeNull();
        });
    });
});
