const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Customer Management Module Tests', () => {
    let authHeader;
    let testUser;
    let testOrg;
    let testBranch;
    let testCustomer;

    beforeEach(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.User.destroy({ where: {} });
        await db.Role.destroy({ where: {} });
        await db.Organization.destroy({ where: {} });
        await db.Branch.destroy({ where: {} });
        await db.Customer.destroy({ where: {} });
        await db.Account.destroy({ where: {} });
        await db.Transaction.destroy({ where: {} });
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Seed Organization & Branch
        testOrg = await db.Organization.create({
            name: 'Customer Test Org',
            status: 'active'
        });

        testBranch = await db.Branch.create({
            organization_id: testOrg.id,
            name: 'Customer Test Branch',
            branch_code: 'CTB001',
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
            name: 'Customer Admin',
            username: 'custadmin',
            email: 'custadmin@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(adminRole);

        // Login to get token
        const loginRes = await request(app)
            .post('/api/v1/login')
            .send({
                email: 'custadmin@example.com',
                password: 'password123'
            });

        authHeader = `Bearer ${loginRes.body.data.auth_token}`;

        // Seed a customer
        testCustomer = await db.Customer.create({
            organization_id: testOrg.id,
            name: 'John Doe',
            email: 'john@example.com',
            phone: '0771234567',
            status: 'active'
        });
    });

    describe('Customer CRUD', () => {
        it('should create a new customer', async () => {
            const response = await request(app)
                .post('/api/v1/customers')
                .set('Authorization', authHeader)
                .send({
                    name: 'Jane Smith',
                    email: 'jane@example.com',
                    phone: '0779876543'
                });

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('name', 'Jane Smith');
        });

        it('should fetch all customers', async () => {
            const response = await request(app)
                .get('/api/v1/customers')
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(Array.isArray(response.body.data.data)).toBe(true);
            expect(response.body.data.data.length).toBeGreaterThan(0);
        });

        it('should fetch a single customer by ID', async () => {
            const response = await request(app)
                .get(`/api/v1/customers/${testCustomer.id}`)
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('name', 'John Doe');
        });

        it('should update customer details', async () => {
            const response = await request(app)
                .put(`/api/v1/customers/${testCustomer.id}`)
                .set('Authorization', authHeader)
                .send({
                    name: 'John Doe Updated',
                    phone: '0770000000'
                });

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('name', 'John Doe Updated');
        });
    });

    describe('Customer Ledger', () => {
        it('should fetch customer ledger with zero balance for new customer', async () => {
            const response = await request(app)
                .get(`/api/v1/customers/${testCustomer.id}/ledger`)
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(Number(response.body.data.current_balance)).toBe(0);
        });
    });
});
