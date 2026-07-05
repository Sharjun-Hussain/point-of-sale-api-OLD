/**
 * CLEANUP SCRIPT: Remove Orphaned Product Variants
 *
 * Problem: When products were hard-deleted without cascading, their child
 * variants were left behind as "orphans" — no parent product exists, but
 * the variant rows remain in product_variants table. These ghost variants
 * appear in the POS product picker.
 *
 * This script:
 * 1. Identifies all orphaned variants (product_id not in products table)
 * 2. Shows a preview first (DRY RUN)
 * 3. If you confirm, permanently deletes them
 *
 * Run: node scratch/cleanup-orphan-variants.js
 * Run (live): node scratch/cleanup-orphan-variants.js --execute
 */

const { Sequelize } = require('sequelize');

const DRY_RUN = !process.argv.includes('--execute');

async function run() {
  const sequelize = new Sequelize('pos_system', 'root', '1234', {
    host: 'localhost',
    dialect: 'mysql',
    logging: false
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    if (DRY_RUN) {
      console.log('⚠️  DRY RUN MODE — No data will be deleted.');
      console.log('    To execute deletion, run with: --execute\n');
    }

    // 1. Find all orphaned variants
    const [orphans] = await sequelize.query(`
      SELECT
        pv.id,
        pv.name,
        pv.sku,
        pv.product_id,
        pv.organization_id,
        pv.created_at
      FROM product_variants pv
      LEFT JOIN products p ON pv.product_id = p.id
      WHERE p.id IS NULL
      ORDER BY pv.created_at DESC
    `);

    if (orphans.length === 0) {
      console.log('🎉 No orphaned variants found. Your database is clean!');
      return;
    }

    console.log(`🔍 Found ${orphans.length} orphaned variant(s):\n`);
    orphans.forEach((v, i) => {
      console.log(`  ${i + 1}. SKU: ${v.sku || '(none)'} | Name: ${v.name || '(none)'} | ID: ${v.id}`);
    });

    if (DRY_RUN) {
      console.log(`\n📋 SUMMARY: ${orphans.length} variants would be permanently deleted.`);
      console.log('   Run with --execute to perform the actual cleanup.');
      return;
    }

    // 2. Also clean up their dependent records first
    const orphanIds = orphans.map(v => `'${v.id}'`).join(', ');

    console.log('\n🧹 Cleaning up dependent records first...');

    const [vadResult] = await sequelize.query(`
      DELETE FROM variant_attribute_values WHERE product_variant_id IN (${orphanIds})
    `);
    console.log(`   ✅ Removed variant attribute values`);

    // Clean up stock entries for orphans
    await sequelize.query(`
      DELETE FROM stocks WHERE product_variant_id IN (${orphanIds})
    `);
    console.log(`   ✅ Removed orphaned stock entries`);

    // Clean up batches for orphans
    await sequelize.query(`
      DELETE FROM product_batches WHERE product_variant_id IN (${orphanIds})
    `).catch(() => console.log('   ℹ️  No orphaned batches found'));

    // 3. Delete the orphaned variants themselves
    const [result] = await sequelize.query(`
      DELETE FROM product_variants
      WHERE id IN (${orphanIds})
    `);

    console.log(`\n✅ SUCCESS: Permanently deleted ${orphans.length} orphaned variant(s).`);
    console.log('   Your database is now clean. Ghost variants will no longer appear in POS.');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

run();
