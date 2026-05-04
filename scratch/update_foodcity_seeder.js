const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../src/seeders/foodCitySeed.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update foodCityData with new category and item types
const newCategory = `            { category: 'Manufacturing Inputs', subs: ['Raw Materials', 'Packaging'], items: [
                { name: 'Sugar (Industrial)', brand: 'Generic', unit: 'kg', product_type: 'Raw Material' },
                { name: 'Carbon Dioxide Gas', brand: 'Generic', unit: 'btl', product_type: 'Raw Material' },
                { name: 'Flavor Concentrate', brand: 'Generic', unit: 'btl', product_type: 'Raw Material' },
                { name: 'Empty PET Bottles', brand: 'Generic', unit: 'box', product_type: 'Raw Material' }
            ]},
            { category: 'Beverages'`;

content = content.replace(/{ category: 'Beverages'/, newCategory);

// 2. Update Product creation defaults
const oldDefaults = `                        unit_id: unitMap[item.unit],
                        is_active: true,
                        is_variant: isMultiVariant`;

const newDefaults = `                        unit_id: unitMap[item.unit],
                        is_active: true,
                        is_variant: isMultiVariant,
                        product_type: item.product_type || 'Standard',
                        can_be_manufactured: item.can_be_manufactured || false`;

content = content.replace(oldDefaults, newDefaults);

fs.writeFileSync(filePath, content);
console.log('Successfully updated foodCitySeed.js');
