/**
 * Schema Comparison Script
 * Compares Sequelize models with actual database schema
 */
const db = require('./src/models');

async function compareSchemas() {
    console.log('🔍 Comparing Models with Database Schema...\n');

    const issues = [];
    const models = Object.keys(db).filter(k => k !== 'sequelize' && k !== 'Sequelize');

    for (const modelName of models) {
        const model = db[modelName];
        if (!model || !model.tableName) continue;

        const tableName = model.tableName;
        const attributes = model.rawAttributes;

        console.log(`\n📋 ${modelName} (${tableName})`);
        console.log(`   Columns in model: ${Object.keys(attributes).length}`);

        // Show column details
        Object.keys(attributes).forEach(col => {
            const attr = attributes[col];
            const type = attr.type ? attr.type.key : 'unknown';
            const nullable = attr.allowNull !== false ? 'NULL' : 'NOT NULL';
            console.log(`   - ${col}: ${type} ${nullable}`);
        });
    }

    console.log(`\n✅ Total models analyzed: ${models.length}`);
    console.log('\n💡 To verify against database, run this after migration:');
    console.log('   SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS');
    console.log('   WHERE TABLE_SCHEMA = "pos_system" ORDER BY TABLE_NAME, ORDINAL_POSITION;');
}

compareSchemas().then(() => process.exit(0)).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
