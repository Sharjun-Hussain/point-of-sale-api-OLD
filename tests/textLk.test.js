const request = require('supertest');
const app = require('../server');
const db = require('../src/models');
const bcrypt = require('bcryptjs');

describe('Text.lk CRM Integration Tests', () => {
    let authHeader;
    let testUser;
    let testOrg;
    let testBranch;

    beforeEach(async () => {
        try {
            // Clear tables
            await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
            await db.User.destroy({ where: {} });
            await db.Role.destroy({ where: {} });
            await db.Organization.destroy({ where: {} });
            await db.Branch.destroy({ where: {} });
            await db.Setting.destroy({ where: {} });
            await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

            // Seed Organization & Branch
            testOrg = await db.Organization.create({
                name: 'Text.lk Test Org',
                textlk_enabled: true
            });

            testBranch = await db.Branch.create({
                organization_id: testOrg.id,
                name: 'Text.lk Test Branch',
                branch_code: 'TTB001'
            });

            // Seed Admin role and permissions
            const adminRole = await db.Role.create({
                name: 'Super Admin',
                is_system_role: true
            });

            const hashedPassword = await bcrypt.hash('password123', 10);
            testUser = await db.User.create({
                organization_id: testOrg.id,
                branch_id: testBranch.id,
                name: 'Text.lk Admin',
                username: 'lkadmin',
                email: 'lkadmin@example.com',
                password: hashedPassword
            });
            await testUser.addRole(adminRole);
        } catch (e) {
            console.error('DATABASE SEEDING FAILED IN TEST:', e);
        }

        // Login to get token
        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({
                email: 'lkadmin@example.com',
                password: 'password123'
            });

        if (loginRes.status !== 200) {
            console.error('Test Login Failed:', loginRes.status, loginRes.body);
        }

        authHeader = `Bearer ${loginRes.body?.data?.auth_token || ''}`;
    });

    describe('Text.lk Settings Configuration', () => {
        it('should return initial config when not configured yet', async () => {
            const response = await request(app)
                .get('/api/v1/crm/text-lk/config')
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('enabled', true);
            expect(response.body.data.config).toEqual({});
        });

        it('should successfully save and mask Text.lk API credentials', async () => {
            const saveRes = await request(app)
                .post('/api/v1/crm/text-lk/config')
                .set('Authorization', authHeader)
                .send({
                    apiKey: '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d',
                    senderId: 'TextLKDemo',
                    enabled: true
                });

            expect(saveRes.status).toBe(200);
            expect(saveRes.body.status).toBe('success');
            expect(saveRes.body.data).toHaveProperty('apiKey', '********');

            // Verify settings retrieved via GET are properly masked
            const getRes = await request(app)
                .get('/api/v1/crm/text-lk/config')
                .set('Authorization', authHeader);

            expect(getRes.status).toBe(200);
            expect(getRes.body.data.config).toHaveProperty('apiKey', '********');
            expect(getRes.body.data.config).toHaveProperty('senderId', 'TextLKDemo');
        });
    });

    describe('Text.lk Account Balance and Message Stats', () => {
        it('should return live dashboard statistics and balance', async () => {
            // First save config
            await request(app)
                .post('/api/v1/crm/text-lk/config')
                .set('Authorization', authHeader)
                .send({
                    apiKey: '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d',
                    senderId: 'TextLKDemo',
                    enabled: true
                });

            const response = await request(app)
                .get('/api/v1/crm/text-lk/stats')
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.data).toHaveProperty('balance');
            expect(response.body.data).toHaveProperty('totalSent');
            expect(response.body.data).toHaveProperty('delivered');
            expect(response.body.data).toHaveProperty('failed');
            expect(response.body.data).toHaveProperty('logs');
            expect(Array.isArray(response.body.data.logs)).toBe(true);
        });
    });
});
