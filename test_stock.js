const { Sequelize, DataTypes, Op } = require('sequelize');

const sequelize = new Sequelize('pos_system', 'root', '1234', {
  host: '127.0.0.1',
  dialect: 'mysql',
  logging: false
});

async function run() {
  try {
    const [stocks] = await sequelize.query(`
      SELECT s.id, s.quantity, 
             p.name as product_name, p.code as product_code, p.sku as product_sku, p.barcode as product_barcode,
             v.name as variant_name, v.sku as variant_sku, v.code as variant_code, v.barcode as variant_barcode,
             p.is_active as product_active, v.is_active as variant_active
      FROM stocks s
      LEFT JOIN products p ON s.product_id = p.id
      LEFT JOIN product_variants v ON s.product_variant_id = v.id
      WHERE p.name LIKE '%Nivea%' OR v.barcode = '8904256002820' OR p.sku = '8904256002820' OR v.sku = '8904256002820' OR p.barcode = '8904256002820' OR p.code = '8904256002820';
    `);
    
    console.log(JSON.stringify(stocks, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await sequelize.close();
  }
}

run();
