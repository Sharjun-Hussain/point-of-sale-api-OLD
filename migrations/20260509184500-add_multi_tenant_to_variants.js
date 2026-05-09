'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 Implementing Multi-Tenant Composite Uniqueness for Product Variants...');

    try {
      // 1. Drop existing global unique indexes
      const variantIndexes = ['sku', 'barcode', 'product_variants_sku_unique_idx', 'product_variants_barcode_unique_idx'];
      for (const idx of variantIndexes) {
        try { await queryInterface.removeIndex('product_variants', idx); } catch (e) {}
      }
      
      // 2. Add Composite Multi-Tenant Indexes
      await queryInterface.addIndex('product_variants', ['organization_id', 'sku'], { name: 'product_variants_org_sku_unique_idx', unique: true });
      await queryInterface.addIndex('product_variants', ['organization_id', 'barcode'], { name: 'product_variants_org_barcode_unique_idx', unique: true });
      
      console.log('✅ Product Variants updated successfully!');
    } catch (error) {
      console.warn('⚠️ Warning while updating product_variants indexes:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️ Down migration for composite uniqueness is complex once data is populated.');
  }
};
