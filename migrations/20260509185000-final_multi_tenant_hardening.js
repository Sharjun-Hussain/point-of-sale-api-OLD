'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 Finalizing Multi-Tenant Hardening for Transactional and Master Data...');

    const tablesToUpdate = [
      {
        table: 'sales',
        oldIndexes: ['invoice_number', 'sales_invoice_number_unique_idx'],
        newIndex: { name: 'sales_org_invoice_unique_idx', fields: ['organization_id', 'invoice_number'] }
      },
      {
        table: 'sale_returns',
        oldIndexes: ['return_number', 'sale_returns_return_number_unique_idx'],
        newIndex: { name: 'sale_returns_org_number_unique_idx', fields: ['organization_id', 'return_number'] }
      },
      {
        table: 'purchase_orders',
        oldIndexes: ['po_number', 'purchase_orders_po_number_unique_idx'],
        newIndex: { name: 'purchase_orders_org_number_unique_idx', fields: ['organization_id', 'po_number'] }
      },
      {
        table: 'purchase_returns',
        oldIndexes: ['return_number', 'purchase_returns_return_number_unique_idx'],
        newIndex: { name: 'purchase_returns_org_number_unique_idx', fields: ['organization_id', 'return_number'] }
      },
      {
        table: 'stock_transfers',
        oldIndexes: ['transfer_number', 'stock_transfers_transfer_number_unique_idx'],
        newIndex: { name: 'stock_transfers_org_number_unique_idx', fields: ['organization_id', 'transfer_number'] }
      },
      {
        table: 'stock_openings',
        oldIndexes: ['reference_number', 'stock_openings_reference_number_unique_idx'],
        newIndex: { name: 'stock_openings_org_ref_unique_idx', fields: ['organization_id', 'reference_number'] }
      },
      {
        table: 'suppliers',
        oldIndexes: ['email', 'suppliers_email_unique_idx', 'phone'],
        newIndex: [
          { name: 'suppliers_org_email_unique_idx', fields: ['organization_id', 'email'] },
          { name: 'suppliers_org_phone_unique_idx', fields: ['organization_id', 'phone'] }
        ]
      },
      {
        table: 'distributors',
        oldIndexes: ['email', 'distributors_email_unique_idx', 'phone'],
        newIndex: [
          { name: 'distributors_org_email_unique_idx', fields: ['organization_id', 'email'] },
          { name: 'distributors_org_phone_unique_idx', fields: ['organization_id', 'phone'] }
        ]
      },
      {
        table: 'roles',
        oldIndexes: ['name', 'roles_name_unique_idx'],
        newIndex: { name: 'roles_org_name_unique_idx', fields: ['organization_id', 'name'] }
      },
      {
        table: 'stocks',
        oldIndexes: ['stocks_branch_id_product_id_product_variant_id_unique'],
        newIndex: { name: 'stocks_branch_prod_var_unique_idx', fields: ['organization_id', 'branch_id', 'product_id', 'product_variant_id'] }
      }
    ];

    for (const item of tablesToUpdate) {
      console.log(`📦 Updating ${item.table} table...`);
      for (const oldIdx of item.oldIndexes) {
        try { await queryInterface.removeIndex(item.table, oldIdx); } catch (e) {}
      }
      
      const indexes = Array.isArray(item.newIndex) ? item.newIndex : [item.newIndex];
      for (const newIdx of indexes) {
        try {
          await queryInterface.addIndex(item.table, newIdx.fields, { name: newIdx.name, unique: true });
        } catch (e) {
          console.warn(`  ⚠️ Could not add index ${newIdx.name} to ${item.table}: ${e.message}`);
        }
      }
    }

    console.log('✅ Final Multi-Tenant Hardening completed successfully!');
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️ Down migration is complex for multi-tenant data.');
  }
};
