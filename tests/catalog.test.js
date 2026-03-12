const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Catalog Management Tests (Categories, Brands, Units, Products)', () => {
    let authHeader;
    let testUser;
    let testCategory;
    let testBrand;
    let testUnit;

    beforeEach(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.User.destroy({ where: {} });
        await db.Role.destroy({ where: {} });
        await db.MainCategory.destroy({ where: {} });
        await db.Brand.destroy({ where: {} });
        await db.MeasurementUnit.destroy({ where: {} });
        await db.Product.destroy({ where: {} });
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Seed Admin user
        const adminRole = await db.Role.create({
            name: 'Super Admin',
            is_system_role: true
        });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            name: 'Catalog Admin',
            username: 'catadmin',
            email: 'catadmin@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(adminRole);

        // Login to get token
        const loginRes = await request(app)
            .post('/api/v1/login')
            .send({
                email: 'catadmin@example.com',
                password: 'password123'
            });

        authHeader = `Bearer ${loginRes.body.data.auth_token}`;

        // Seed base dependencies for Products
        testCategory = await db.MainCategory.create({ name: 'Electronics', description: 'Gadgets', status: 'active' });
        testBrand = await db.Brand.create({ name: 'TechCorp', status: 'active' });
        testUnit = await db.MeasurementUnit.create({ name: 'Pieces', short_name: 'pcs', unit_type: 'bulk' });
    });

    describe('POST /api/v1/main-categories', () => {
        it('should create a new category safely', async () => {
            const response = await request(app)
                .post('/api/v1/main-categories')
                .set('Authorization', authHeader)
                .send({
                    name: 'Home Appliances',
                    description: 'Washing machines, fridges, etc.'
                });

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('name', 'Home Appliances');
        });
    });

    describe('POST /api/v1/products', () => {
        it('should create a new Product with all mandatory foreign keys', async () => {
            const response = await request(app)
                .post('/api/v1/products')
                .set('Authorization', authHeader)
                .send({
                    name: 'Smartphone X',
                    sku: 'SPX-001',
                    code: 'SPX-001',
                    brand_id: testBrand.id,
                    main_category_id: testCategory.id,
                    measurement_unit_id: testUnit.id,
                    reorder_level: 10,
                    purchase_price: 500,
                    selling_price: 800,
                    has_variants: false
                });

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('name', 'Smartphone X');
        });

        it('should fail to create a Product without a name', async () => {
            const response = await request(app)
                .post('/api/v1/products')
                .set('Authorization', authHeader)
                .send({
                    /* name missing intentionally */
                    sku: 'SPY-001',
                    code: 'SPY-001',
                    brand_id: testBrand.id,
                    main_category_id: testCategory.id,
                    measurement_unit_id: testUnit.id
                });

            expect(response.status).toBe(400);
            expect(response.body.status).toBe('error');
        });
    });

    describe('GET /api/v1/products', () => {
        beforeEach(async () => {
            await db.Product.create({
                name: 'Laptop Pro',
                sku: 'LP-001',
                code: 'LP-001',
                brand_id: testBrand.id,
                main_category_id: testCategory.id,
                measurement_unit_id: testUnit.id,
                reorder_level: 5,
                purchase_price: 1000,
                selling_price: 1500,
                has_variants: false
            });
        });

        it('should fetch all products safely', async () => {
            const response = await request(app)
                .get('/api/v1/products')
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(Array.isArray(response.body.data.data)).toBe(true);
            expect(response.body.data.data.length).toBeGreaterThan(0);
        });
    });
});
