require('dotenv').config({ path: '.env' });
const shopifyService = require('../services/shopifyService');
const tokenManager = require('../services/shopifyTokenManager');
const { Organization, Setting, Product, ProductVariant, Stock } = require('../models');
const logger = require('../utils/logger');

// Mock fetch
global.fetch = async (url, options) => {
    console.log(`[MOCK FETCH] ${options.method || 'GET'} ${url}`);
    
    // Simulate Shopify responses
    if (url.includes('/admin/api/2024-10/shop.json')) {
        return {
            ok: true,
            status: 200,
            json: async () => ({ shop: { name: 'Test Shop' } })
        };
    }
    
    if (url.includes('/admin/api/2024-10/inventory_items.json')) {
        return {
            ok: true,
            status: 200,
            json: async () => ({ 
                inventory_items: [{ id: 'mock_inv_item_id', sku: 'MOCK-SKU' }] 
            })
        };
    }
    
    if (url.includes('/admin/api/2024-10/inventory_levels/adjust.json')) {
        return {
            ok: true,
            status: 200,
            json: async () => ({ inventory_level: { available: 10 } })
        };
    }

    if (url.includes('/admin/api/2024-10/inventory_levels/set.json')) {
        return {
            ok: true,
            status: 200,
            json: async () => ({ inventory_level: { available: 50 } })
        };
    }

    return {
        ok: true,
        status: 200,
        json: async () => ({})
    };
};

async function runTest() {
    console.log('--- STARTING SHOPIFY SYNC TEST ---');
    
    const orgId = 'fed43916-a78d-413e-8e39-e68cbebc7ca5'; // Use the existing org ID
    
    // Seed the token cache
    tokenManager.cacheToken(orgId, 'mock-shpat-token');
    
    try {
        // 1. Test Config Retrieval
        console.log('\n1. Testing getConfig...');
        const config = await shopifyService.getConfig(orgId);
        if (config) {
            console.log('✅ Config retrieved:', config.shop_name);
        } else {
            console.log('❌ Config retrieval failed or org-level sync disabled');
        }

        // 2. Test Real-time Sync (Adjustment)
        console.log('\n2. Testing syncInventory (Real-time adjustment)...');
        const sku = 'MOCK-SKU';
        // Mock a variant for this SKU
        const variant = await ProductVariant.findOne({ where: { organization_id: orgId } });
        if (variant) {
            const originalSku = variant.sku;
            await variant.update({ sku: sku, shopify_sync_enabled: true });
            
            await shopifyService.syncInventory(orgId, sku, -5);
            console.log('✅ syncInventory executed (check mock logs above)');
            
            // Revert SKU
            await variant.update({ sku: originalSku });
        } else {
            console.log('⚠️ No variant found to test syncInventory');
        }

        // 3. Test Bulk Push
        console.log('\n3. Testing pushAllInventory (Bulk push)...');
        const pushResults = await shopifyService.pushAllInventory(orgId);
        console.log('✅ Bulk push results:', pushResults);

        console.log('\n--- TEST COMPLETED ---');
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
    }
}

runTest().then(() => process.exit(0));
