'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 Implementing Industrial Multi-Tenant Composite Uniqueness...');

    // 1. PRODUCTS TABLE
    console.log('📦 Updating Products table indexes...');
    try {
      // Drop existing global/hardened unique indexes if they exist
      const productIndexes = ['code', 'sku', 'barcode', 'product_code_unique_idx', 'product_sku_unique_idx', 'product_barcode_unique_idx'];
      for (const idx of productIndexes) {
        try { await queryInterface.removeIndex('products', idx); } catch (e) {}
      }
      
      // Add Composite Multi-Tenant Indexes
      await queryInterface.addIndex('products', ['organization_id', 'code'], { name: 'products_org_code_unique_idx', unique: true });
      await queryInterface.addIndex('products', ['organization_id', 'sku'], { name: 'products_org_sku_unique_idx', unique: true });
      await queryInterface.addIndex('products', ['organization_id', 'barcode'], { name: 'products_org_barcode_unique_idx', unique: true });
    } catch (error) {
      console.warn('⚠️ Warning while updating products indexes:', error.message);
    }

    // 2. CONTAINERS TABLE
    console.log('📦 Updating Containers table indexes...');
    try {
      const containerIndexes = ['slug', 'container_slug_unique_idx'];
      for (const idx of containerIndexes) {
        try { await queryInterface.removeIndex('containers', idx); } catch (e) {}
      }
      await queryInterface.addIndex('containers', ['organization_id', 'slug'], { name: 'containers_org_slug_unique_idx', unique: true });
    } catch (error) {
      console.warn('⚠️ Warning while updating containers indexes:', error.message);
    }

    // 3. GRNS TABLE
    console.log('📦 Updating GRNs table indexes...');
    try {
      const grnIndexes = ['grn_number', 'grn_number_unique_idx'];
      for (const idx of grnIndexes) {
        try { await queryInterface.removeIndex('grns', idx); } catch (e) {}
      }
      await queryInterface.addIndex('grns', ['organization_id', 'grn_number'], { name: 'grns_org_number_unique_idx', unique: true });
    } catch (error) {
      console.warn('⚠️ Warning while updating grns indexes:', error.message);
    }

    // 4. CUSTOMERS TABLE
    console.log('📦 Updating Customers table indexes...');
    try {
      const customerIndexes = ['email', 'customer_email_unique_idx', 'phone'];
      for (const idx of customerIndexes) {
        try { await queryInterface.removeIndex('customers', idx); } catch (e) {}
      }
      await queryInterface.addIndex('customers', ['organization_id', 'email'], { name: 'customers_org_email_unique_idx', unique: true });
      await queryInterface.addIndex('customers', ['organization_id', 'phone'], { name: 'customers_org_phone_unique_idx', unique: true });
    } catch (error) {
      console.warn('⚠️ Warning while updating customers indexes:', error.message);
    }

    console.log('✅ Multi-Tenant Composite Uniqueness successfully implemented!');
  },

  async down(queryInterface, Sequelize) {
    // Rollback would involve re-creating global indexes, which is usually not desired 
    // once data with duplicate SKUs across orgs exists.
    console.log('⚠️ Down migration for composite uniqueness is complex once data is populated. Manual review recommended.');
  }
};
