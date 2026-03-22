require('dotenv').config();
const { Product, Supplier, Organization, User } = require('./src/models');

async function checkDb() {
    try {
        console.log('--- Supplier Data Verification ---');

        const suppliers = await Supplier.findAll({
            where: { organization_id: (await User.findOne({ where: { email: 'admin@emipos.com' } })).organization_id }
        });

        console.log(`Found ${suppliers.length} suppliers.`);
        for (const s of suppliers) {
            console.log(`- ${s.name} (Contact: ${s.contact_person}, Phone: ${s.phone})`);
        }

        const productsWithSupplier = await Product.findAll({
            where: { supplier_id: { [require('sequelize').Op.ne]: null } },
            include: [{ model: Supplier, as: 'supplier' }]
        });

        console.log(`\nProducts with linked suppliers: ${productsWithSupplier.length}`);
        for (const p of productsWithSupplier) {
            console.log(`- ${p.name} (Supplier: ${p.supplier ? p.supplier.name : 'None'})`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkDb();
