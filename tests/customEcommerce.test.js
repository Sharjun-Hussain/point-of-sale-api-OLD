const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

// Mock global fetch for outbound HTTP requests
const fetchMock = jest.fn().mockImplementation(() => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true })
}));
global.fetch = fetchMock;

describe('Custom E-Commerce Integration End-to-End Tests', () => {
    let authHeader;
    let testUser;
    let testOrg;
    let testBranch;
    let testCategory;
    let testUnit;
    let testProduct;
    let testVariant;

    jest.setTimeout(60000);

    beforeAll(async () => {
        // Seed Org
        testOrg = await db.Organization.create({
            name: 'E-commerce Test Org',
            status: 'active',
            custom_ecommerce_enabled: true
        });

        // Seed Branch
        testBranch = await db.Branch.create({
            organization_id: testOrg.id,
            name: 'E-com Main Store',
            branch_code: 'EMS01',
            status: 'active'
        });

        // Seed Admin user
        const adminRole = await db.Role.create({
            name: 'Super Admin',
            is_system_role: true
        });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            name: 'Ecom Manager',
            username: 'ecom_manager',
            email: 'ecom_manager@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(adminRole);

        // Seed Catalog dependencies
        testCategory = await db.MainCategory.create({ organization_id: testOrg.id, name: 'Smartphones' });
        testUnit = await db.Unit.create({ organization_id: testOrg.id, name: 'Unit', short_name: 'U' });

        // Seed Product & Variant
        testProduct = await db.Product.create({
            organization_id: testOrg.id,
            name: 'Nexus Ecom Phone',
            code: 'NE-001',
            sku: 'NE-SKU-001',
            main_category_id: testCategory.id,
            unit_id: testUnit.id,
            is_variant: false,
            custom_ecommerce_sync_enabled: true
        });

        testVariant = await db.ProductVariant.create({
            organization_id: testOrg.id,
            product_id: testProduct.id,
            name: 'Nexus Ecom Phone Standard',
            sku: 'NEXUS-ECOM-SKU',
            price: 600.00,
            cost_price: 400.00,
            is_default: true
        });

        // Set initial stock
        await db.Stock.create({
            organization_id: testOrg.id,
            branch_id: testBranch.id,
            product_id: testProduct.id,
            product_variant_id: testVariant.id,
            quantity: 150
        });

        // Login to get token
        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({
                email: 'ecom_manager@example.com',
                password: 'password123'
            });

        authHeader = `Bearer ${loginRes.body.data.auth_token}`;
    });

    describe('1. Configuration Settings Management', () => {
        it('should initially return empty custom e-commerce settings', async () => {
            const res = await request(app)
                .get('/api/v1/custom-ecommerce/config')
                .set('Authorization', authHeader);

            expect(res.status).toBe(200);
            expect(res.body.data.enabled).toBe(false);
            expect(res.body.data.api_url).toBe('');
        });

        it('should configure custom e-commerce integration settings', async () => {
            const res = await request(app)
                .post('/api/v1/custom-ecommerce/config')
                .set('Authorization', authHeader)
                .send({
                    api_url: 'https://my-mock-shopify.com/webhook',
                    api_token: 'outbound-secret-token',
                    pos_branch_id: testBranch.id,
                    enabled: true
                });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');

            const savedSetting = await db.Setting.findOne({
                where: { organization_id: testOrg.id, category: 'custom_ecommerce' }
            });
            expect(savedSetting).toBeDefined();
            const config = JSON.parse(savedSetting.settings_data);
            expect(config.api_url).toBe('https://my-mock-shopify.com/webhook');
            expect(config.enabled).toBe(true);
            expect(config.inbound_token).toBeDefined(); // Token generated automatically
        });

        it('should retrieve saved e-commerce settings successfully', async () => {
            const res = await request(app)
                .get('/api/v1/custom-ecommerce/config')
                .set('Authorization', authHeader);

            expect(res.status).toBe(200);
            expect(res.body.data.api_url).toBe('https://my-mock-shopify.com/webhook');
            expect(res.body.data.inbound_token).toBeDefined();
        });

        it('should allow regenerating inbound token', async () => {
            const oldConfigRes = await request(app)
                .get('/api/v1/custom-ecommerce/config')
                .set('Authorization', authHeader);
            const oldToken = oldConfigRes.body.data.inbound_token;

            const regenRes = await request(app)
                .post('/api/v1/custom-ecommerce/token')
                .set('Authorization', authHeader);

            expect(regenRes.status).toBe(200);
            expect(regenRes.body.data.inbound_token).toBeDefined();
            expect(regenRes.body.data.inbound_token).not.toBe(oldToken);
        });
    });

    describe('2. Outbound Inventory Sync Triggers', () => {
        beforeEach(() => {
            fetchMock.mockClear();
        });

        it('should trigger outbound stock sync on manual adjustment', async () => {
            const adjustRes = await request(app)
                .post('/api/v1/stocks/adjust')
                .set('Authorization', authHeader)
                .send({
                    branch_id: testBranch.id,
                    product_id: testProduct.id,
                    product_variant_id: testVariant.id,
                    quantity: 20,
                    type: 'addition',
                    reason: 'Arrival'
                });

            expect(adjustRes.status).toBe(201);

            // Wait a small instant to allow asynchronous outbound webhook to process
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify fetchMock was triggered
            expect(fetchMock).toHaveBeenCalled();
            const calledUrl = fetchMock.mock.calls[0][0];
            const options = fetchMock.mock.calls[0][1];
            const calledBody = JSON.parse(options.body);
            const calledHeaders = options.headers;

            expect(calledUrl).toContain('https://my-mock-shopify.com/webhook');
            expect(calledBody.sku).toBe('NEXUS-ECOM-SKU');
            expect(calledBody.absolute_stock).toBe(170); // 150 starting + 20 added
            expect(calledHeaders.Authorization).toBe('Bearer outbound-secret-token');
        });
    });

    describe('3. Inbound Checkout Webhook Processing', () => {
        let inboundToken;

        beforeAll(async () => {
            const res = await request(app)
                .get('/api/v1/custom-ecommerce/config')
                .set('Authorization', authHeader);
            inboundToken = res.body.data.inbound_token;
        });

        it('should fail with 401 if inbound webhook is called with invalid token', async () => {
            const webhookRes = await request(app)
                .post('/api/v1/webhooks/custom-ecommerce/order-created')
                .set('Authorization', 'Bearer invalid-token')
                .send({
                    order_id: 'WEB-ORDER-999',
                    items: [{ sku: 'NEXUS-ECOM-SKU', quantity: 2 }]
                });

            expect(webhookRes.status).toBe(401);
        });

        it('should successfully process inbound order paid webhook, create customer, sale, and general ledger records', async () => {
            const orderPayload = {
                order_id: 'WEB-ORDER-1001',
                customer: {
                    name: 'Gavin Belson',
                    phone: '+15550192',
                    email: 'gavin@hooli.xyz',
                    address: 'Hooli HQ, Silicon Valley'
                },
                items: [
                    {
                        sku: 'NEXUS-ECOM-SKU',
                        quantity: 3,
                        price: 600.00
                    }
                ],
                payment: {
                    method: 'online',
                    status: 'paid',
                    amount_paid: 1800.00,
                    reference: 'ch_stripe_82937'
                },
                notes: 'Deliver package to front desk.'
            };

            const webhookRes = await request(app)
                .post('/api/v1/webhooks/custom-ecommerce/order-created')
                .set('Authorization', `Bearer ${inboundToken}`)
                .send(orderPayload);

            expect(webhookRes.status).toBe(201);
            expect(webhookRes.body.status).toBe('success');

            // A. Check if customer was created
            const customer = await db.Customer.findOne({
                where: { email: 'gavin@hooli.xyz', organization_id: testOrg.id }
            });
            expect(customer).toBeDefined();
            expect(customer.name).toBe('Gavin Belson');
            expect(Number(customer.credit_limit)).toBe(10000000); // 10 Million credit limit

            // B. Check if sale was recorded with correct source and notes
            const sale = await db.Sale.findOne({
                where: { customer_id: customer.id, organization_id: testOrg.id }
            });
            expect(sale).toBeDefined();
            expect(sale.source).toBe('ecommerce');
            expect(sale.notes).toContain('E-commerce Order ID: #WEB-ORDER-1001');

            // C. Check if stock was reduced correctly
            const finalStock = await db.Stock.findOne({
                where: { branch_id: testBranch.id, product_variant_id: testVariant.id }
            });
            // 170 before sale, 3 sold -> 167 remaining
            expect(Number(finalStock.quantity)).toBe(167);

            // D. Check General Ledger entries prepended with [E-Commerce]
            const glEntries = await db.Transaction.findAll({
                where: { reference_type: 'Sale', reference_id: sale.id }
            });
            expect(glEntries.length).toBeGreaterThan(0);
            for (const entry of glEntries) {
                expect(entry.description).toContain('[E-Commerce]');
            }
        });
    });
});
