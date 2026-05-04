const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/seeders/hardwareShopSeed.js');
let content = fs.readFileSync(filePath, 'utf8');

// Update Product creation defaults
const oldDefaults = `                    unit_id: unitMap[pData.unit],
                    supplier_id: supplierMap[pData.supplier],
                    is_variant: pData.is_variant`;

const newDefaults = `                    unit_id: unitMap[pData.unit],
                    supplier_id: supplierMap[pData.supplier],
                    is_variant: pData.is_variant,
                    product_type: pData.product_type || 'Standard',
                    can_be_manufactured: pData.can_be_manufactured || false`;

content = content.replace(oldDefaults, newDefaults);

fs.writeFileSync(filePath, content);
console.log('Successfully updated hardwareShopSeed.js');
