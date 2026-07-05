/**
 * Diagnostic: Check variants for mrjoon005@gmail.com organization
 */
const { Sequelize } = require('sequelize');

async function run() {
  const sequelize = new Sequelize('pos_system', 'root', '1234', {
    host: 'localhost',
    dialect: 'mysql',
    logging: false
  });

  try {
    await sequelize.authenticate();

    // 1. Find the organization
    const [orgs] = await sequelize.query(`
      SELECT o.id, o.name, o.business_type
      FROM organizations o
      JOIN users u ON u.organization_id = o.id
      WHERE u.email = 'mrjoon005@gmail.com'
      LIMIT 1
    `);

    if (!orgs.length) {
      console.log('❌ User not found');
      return;
    }

    const org = orgs[0];
    console.log(`\n✅ Organization: ${org.name} (${org.id})`);
    console.log(`   Business Type: ${org.business_type}\n`);

    // 2. Check products status
    const [products] = await sequelize.query(`
      SELECT id, name, is_active, is_variant, product_type
      FROM products
      WHERE organization_id = '${org.id}'
      ORDER BY is_active DESC, name
    `);
    console.log(`📦 Total Products: ${products.length}`);
    const activeProds = products.filter(p => p.is_active);
    const inactiveProds = products.filter(p => !p.is_active);
    console.log(`   Active: ${activeProds.length} | Suspended: ${inactiveProds.length}\n`);

    // 3. Check variants status - the key query
    const [variants] = await sequelize.query(`
      SELECT
        pv.id,
        pv.sku,
        pv.is_active AS variant_active,
        p.name AS parent_name,
        p.is_active AS parent_active,
        p.id AS parent_id
      FROM product_variants pv
      LEFT JOIN products p ON pv.product_id = p.id
      WHERE pv.organization_id = '${org.id}'
      ORDER BY p.is_active DESC, p.name
    `);

    console.log(`🔀 Total Variants: ${variants.length}`);
    
    // Key problem: variants that are active but their parent is suspended
    const leakingVariants = variants.filter(v => v.variant_active && !v.parent_active);
    const orphanVariants = variants.filter(v => !v.parent_id);
    const healthyVariants = variants.filter(v => v.variant_active && v.parent_active);
    const correctlySuspended = variants.filter(v => !v.variant_active && !v.parent_active);

    console.log(`   ✅ Healthy (both active): ${healthyVariants.length}`);
    console.log(`   ✅ Correctly suspended (both inactive): ${correctlySuspended.length}`);
    console.log(`   🚨 LEAKING (variant active, parent suspended): ${leakingVariants.length}`);
    console.log(`   👻 Orphans (no parent product): ${orphanVariants.length}`);

    if (leakingVariants.length > 0) {
      console.log('\n🚨 LEAKING VARIANTS (these appear in POS even though product is suspended):');
      leakingVariants.forEach(v => {
        console.log(`   SKU: ${v.sku || '(none)'} | Parent: "${v.parent_name}" | parent_active=${v.parent_active}`);
      });

      console.log('\n💡 FIX: Run with --fix to sync variant status to match parent status');
    }

    if (process.argv.includes('--fix')) {
      console.log('\n🔧 Applying fix — syncing variant active status to match parent...');
      const [result] = await sequelize.query(`
        UPDATE product_variants pv
        JOIN products p ON pv.product_id = p.id
        SET pv.is_active = p.is_active
        WHERE pv.organization_id = '${org.id}'
          AND pv.is_active != p.is_active
      `);
      console.log(`✅ Fixed! Updated ${result.affectedRows} variant(s) to match their parent product status.`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await sequelize.close();
  }
}

run();
