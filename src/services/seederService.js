const db = require('../models');
const crypto = require('crypto');

/**
 * Seeder Service
 * Handles initialization of default data for new organizations
 */
const seederService = {
    /**
     * Seed all default data for an organization
     * @param {string} organizationId 
     */
    seedAllDefaults: async (organizationId) => {
        try {
            console.log(`🌱 Seeding essential data for Organization: ${organizationId}`);
            
            await seederService.seedAccounts(organizationId);
            await seederService.seedMeasurementUnits(organizationId);
            await seederService.seedUnits(organizationId);
            await seederService.seedContainers(organizationId);
            
            console.log(`✅ All essential data seeded for Organization: ${organizationId}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to seed organization [${organizationId}]:`, error);
            throw error;
        }
    },

    /**
     * Seed Chart of Accounts
     */
    seedAccounts: async (organizationId) => {
        const accounts = [
            { code: '1000', name: 'Cash on Hand', type: 'asset' },
            { code: '1010', name: 'Bank Account', type: 'asset' },
            { code: '1100', name: 'Accounts Receivable', type: 'asset' },
            { code: '1200', name: 'Inventory Asset', type: 'asset' },
            { code: '2100', name: 'Accounts Payable', type: 'liability' },
            { code: '2200', name: 'VAT Payable', type: 'liability' },
            { code: '3000', name: 'Owner\'s Equity', type: 'equity' },
            { code: '4000', name: 'Sales Revenue', type: 'revenue' },
            { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
            { code: '6000', name: 'General Expenses', type: 'expense' },
            { code: '6010', name: 'Rent Expense', type: 'expense' },
            { code: '6020', name: 'Utility Expense', type: 'expense' },
            { code: '6030', name: 'Salary Expense', type: 'expense' }
        ];

        for (const acc of accounts) {
            await db.Account.findOrCreate({
                where: { code: acc.code, organization_id: organizationId },
                defaults: { ...acc, organization_id: organizationId, is_active: true }
            });
        }
        console.log(`   ✅ Seeded ${accounts.length} Chart of Accounts.`);
    },

    /**
     * Seed Measurement Units (Base units like kg, l, pcs)
     */
    seedMeasurementUnits: async (organizationId) => {
        const mUnits = [
            { name: 'Piece', short_name: 'pcs' },
            { name: 'Kilogram', short_name: 'kg' },
            { name: 'Gram', short_name: 'g' },
            { name: 'Liter', short_name: 'l' },
            { name: 'Milliliter', short_name: 'ml' },
            { name: 'Meter', short_name: 'm' },
            { name: 'Foot', short_name: 'ft' }
        ];

        for (const u of mUnits) {
            await db.MeasurementUnit.findOrCreate({
                where: { short_name: u.short_name, organization_id: organizationId },
                defaults: { ...u, organization_id: organizationId, is_active: true }
            });
        }
        console.log(`   ✅ Seeded ${mUnits.length} Measurement Units.`);
    },

    /**
     * Seed Units (Selling units like Box, Pack)
     */
    seedUnits: async (organizationId) => {
        const units = [
            { name: 'Piece', short_name: 'pcs' },
            { name: 'Pack', short_name: 'pk' },
            { name: 'Box', short_name: 'bx' },
            { name: 'Case', short_name: 'cs' },
            { name: 'Dozen', short_name: 'dz' },
            { name: 'Bag', short_name: 'bg' },
            { name: 'Bottle', short_name: 'bt' }
        ];

        for (const u of units) {
            await db.Unit.findOrCreate({
                where: { short_name: u.short_name, organization_id: organizationId },
                defaults: { ...u, organization_id: organizationId, is_active: true }
            });
        }
        console.log(`   ✅ Seeded ${units.length} Units.`);
    },

    /**
     * Seed Containers (Storage/Packaging types)
     */
    seedContainers: async (organizationId) => {
        // Fetch Piece unit to use as default base unit for containers
        const pieceUnit = await db.Unit.findOne({ 
            where: { short_name: 'pcs', organization_id: organizationId } 
        });
        const pieceMUnit = await db.MeasurementUnit.findOne({ 
            where: { short_name: 'pcs', organization_id: organizationId } 
        });

        const containers = [
            { name: 'Box', slug: 'box', description: 'Standard storage box', capacity: 1 },
            { name: 'Packet', slug: 'packet', description: 'Small packet', capacity: 1 },
            { name: 'Bottle', slug: 'bottle', description: 'Liquid container bottle', capacity: 1 },
            { name: 'Can', slug: 'can', description: 'Aluminum or tin can', capacity: 1 },
            { name: 'Jar', slug: 'jar', description: 'Glass or plastic jar', capacity: 1 },
            { name: 'Bag', slug: 'bag', description: 'Generic bag or pouch', capacity: 1 },
            { name: 'Crate', slug: 'crate', description: 'Large distribution crate', capacity: 1 },
            { name: 'Sachet', slug: 'sachet', description: 'Small single-use sachet', capacity: 1 }
        ];

        for (const c of containers) {
            await db.Container.findOrCreate({
                where: { slug: c.slug, organization_id: organizationId },
                defaults: { 
                    ...c, 
                    organization_id: organizationId, 
                    is_active: true,
                    base_unit_id: pieceUnit?.id,
                    measurement_unit_id: pieceMUnit?.id
                }
            });
        }
        console.log(`   ✅ Seeded ${containers.length} Containers.`);
    }
};

module.exports = seederService;
