const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Multi-Branch & Multi-Tenant Tests (Organizations & Branches)', () => {
    let authHeader;
    let testUser;

    beforeEach(async () => {
        // Clear tables
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.User.destroy({ where: {} });
        await db.Role.destroy({ where: {} });
        await db.Organization.destroy({ where: {} });
        await db.Branch.destroy({ where: {} });
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // Seed Super Admin user to perform actions
        const superAdminRole = await db.Role.create({
            name: 'Super Admin',
            is_system_role: true
        });

        const hashedPassword = await bcrypt.hash('password123', 10);
        testUser = await db.User.create({
            name: 'System Admin',
            username: 'sysadmin',
            email: 'sysadmin@example.com',
            password: hashedPassword,
            status: 'active'
        });
        await testUser.addRole(superAdminRole);

        // Login to get token
        const loginRes = await request(app)
            .post('/api/v1/login')
            .send({
                email: 'sysadmin@example.com',
                password: 'password123'
            });

        authHeader = `Bearer ${loginRes.body.data.auth_token}`;
    });

    describe('POST /api/v1/organizations', () => {
        it('should create a new organization successfully', async () => {
            const response = await request(app)
                .post('/api/v1/organizations/create')
                .set('Authorization', authHeader)
                .send({
                    name: 'Test Business Inc.',
                    email: 'contact@testbusiness.com',
                    phone: '+1234567890',
                    address: '123 Test Street',
                    owner_name: 'Shop Owner',
                    owner_email: 'owner@testbusiness.com',
                    owner_password: 'securepassword123'
                });

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('success');
            expect(response.body.data.organization).toHaveProperty('name', 'Test Business Inc.');
        });

        it('should fail to create organization without a name', async () => {
            const response = await request(app)
                .post('/api/v1/organizations/create')
                .set('Authorization', authHeader)
                .send({
                    email: 'contact@testbusiness.com',
                    owner_password: 'securepassword123'
                });

            expect(response.status).toBe(400); // Validation error
            expect(response.body.status).toBe('error');
        });
    });

    describe('POST /api/v1/branches', () => {
        let createdOrg;

        beforeEach(async () => {
            createdOrg = await db.Organization.create({
                name: 'Parent Org',
                status: 'active'
            });
        });

        it('should create a new branch under an organization', async () => {
            const response = await request(app)
                .post('/api/v1/branches')
                .set('Authorization', authHeader)
                .send({
                    organization_id: createdOrg.id,
                    name: 'Downtown Branch',
                    branch_code: 'DT001',
                    phone: '+1987654321',
                    address: '456 Branch Ave'
                });

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('name', 'Downtown Branch');
            expect(response.body.data).toHaveProperty('organization_id', createdOrg.id);
        });
    });
});
