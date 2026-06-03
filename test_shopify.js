const variants = [
    { name: 'Sunsilk 100g', sku: 'SKU-1' },
    { name: 'Sunsilk 250g', sku: 'SKU-2' }
];

const shopifyVariants = [];
const optionsMap = new Map();

for (const v of variants) {
    const fallbackOptionName = variants.length > 1 ? "Style" : "Title";
    optionsMap.set(fallbackOptionName, true);
    
    // Ensure uniqueness for option1
    let opt1 = v.name && v.name !== 'Default' ? v.name : `Variant ${v.sku}`;
    if (shopifyVariants.some(sv => sv.option1 === opt1)) {
        opt1 = `${opt1} (${v.sku})`;
    }
    
    shopifyVariants.push({ option1: opt1, sku: v.sku });
}

console.log(optionsMap);
console.log(shopifyVariants);
