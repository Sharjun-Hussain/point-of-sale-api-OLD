const request = require('supertest');
const app = require('../server'); // Assuming server.js exports the express app
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Authentication & Authorization Tests', () => {
    let appServer;

    beforeAll(async () => {
        // Only start listening if server.js does not automatically
        // Usually we export the app without listening if testing
        if (app.listen) {
            // appServer = app.listen(0);
        }
    });

    beforeEach(async () => {
        // Clear tables instead of dropping schema
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
        await db.User.destroy({ where: {} });
        await db.Role.destroy({ where: {} });
        await db.Organization.destroy({ where: {} });
        await db.Branch.destroy({ where: {} });
        await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    });

    afterAll(async () => {
        if (appServer) {
            await appServer.close();
        }
    });

    describe('POST /api/v1/login', () => {
        let testUser;
        let testOrganization;
        let testBranch;
        let testRole;

        beforeEach(async () => {
            // Seed a role
            testRole = await db.Role.create({
                name: 'Admin',
                description: 'Administrator role',
                is_system_role: true
            });

            // Seed organization and branch
            testOrganization = await db.Organization.create({
                name: 'Test Org',
                status: 'active'
            });

            testBranch = await db.Branch.create({
                organization_id: testOrganization.id,
                name: 'Main Branch',
                branch_code: 'MB001',
                status: 'active'
            });

            // Seed a user
            const hashedPassword = await bcrypt.hash('password123', 10);
            testUser = await db.User.create({
                organization_id: testOrganization.id,
                branch_id: testBranch.id,
                name: 'Test Admin',
                username: 'testadmin',
                email: 'testadmin@example.com',
                password: hashedPassword,
                status: 'active'
            });

            // Link user and role
            await testUser.addRole(testRole);
        });

        it('should login successfully with correct credentials', async () => {
            const response = await request(app)
                .post('/api/v1/login')
                .send({
                    email: 'testadmin@example.com',
                    password: 'password123'
                });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('auth_token');
            expect(response.body.data.user).toHaveProperty('email', 'testadmin@example.com');
        });

        it('should fail to login with incorrect password', async () => {
            const response = await request(app)
                .post('/api/v1/login')
                .send({
                    email: 'testadmin@example.com',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);
            expect(response.body.status).toBe('error');
            expect(response.body).toHaveProperty('message');
        });

        it('should fail to login with non-existent email', async () => {
            const response = await request(app)
                .post('/api/v1/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'password123'
                });

            expect(response.status).toBe(401);
            expect(response.body.status).toBe('error');
        });
    });
});
