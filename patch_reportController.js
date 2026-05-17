const fs = require('fs');
const filePath = '/home/joon/pos/backend/src/controllers/reportController.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add getSalePaymentMethods before getDailySales
if (!content.includes('getSalePaymentMethods: async')) {
    content = content.replace('getDailySales: async (req, res, next) => {', `getSalePaymentMethods: async (req, res, next) => {
        try {
            const organization_id = req.user.organization_id;
            
            const methodsFromPayments = await db.SalePayment.findAll({
                where: { organization_id },
                attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('payment_method')), 'payment_method']],
                raw: true
            });
            
            const methodsFromSales = await db.Sale.findAll({
                where: { 
                    organization_id,
                    payment_method: { [Op.not]: null, [Op.ne]: '' }
                },
                attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('payment_method')), 'payment_method']],
                raw: true
            });
            
            const allMethods = new Set();
            methodsFromPayments.forEach(m => {
                if (m.payment_method && m.payment_method !== 'split') allMethods.add(m.payment_method);
            });
            methodsFromSales.forEach(m => {
                if (m.payment_method && m.payment_method !== 'split') allMethods.add(m.payment_method);
            });
            
            ['cash', 'card', 'bank_transfer', 'cheque'].forEach(m => allMethods.add(m));
            
            return successResponse(res, Array.from(allMethods).map(m => ({ id: m, name: m.charAt(0).toUpperCase() + m.slice(1) })), 'Payment methods fetched successfully');
        } catch (error) { next(error); }
    },

    getDailySales: async (req, res, next) => {`);
}

// 2. Add payment_methods filtering in getDailySales
if (!content.includes('const { start_date, end_date, branch_id, main_category_ids, sub_category_ids, brand_ids, payment_methods } = req.query;')) {
    content = content.replace(
        'const { start_date, end_date, branch_id, main_category_ids, sub_category_ids, brand_ids } = req.query;',
        'const { start_date, end_date, branch_id, main_category_ids, sub_category_ids, brand_ids, payment_methods } = req.query;'
    );
}

const paymentFilterBlock = `
            if (payment_methods && payment_methods !== '') {
                const methodsArray = payment_methods.split(',');
                
                const matchingPayments = await db.SalePayment.findAll({
                    where: { 
                        organization_id,
                        payment_method: { [Op.in]: methodsArray }
                    },
                    attributes: ['sale_id'],
                    raw: true
                });
                
                const saleIdsFromPayments = matchingPayments.map(p => p.sale_id);
                
                whereClause[Op.and] = whereClause[Op.and] || [];
                whereClause[Op.and].push({
                    [Op.or]: [
                        { id: { [Op.in]: saleIdsFromPayments } },
                        { payment_method: { [Op.in]: methodsArray } }
                    ]
                });
            }
`;

if (!content.includes('if (payment_methods && payment_methods !==')) {
    content = content.replace(
        'const sales = await Sale.findAll({',
        paymentFilterBlock + '\n            const sales = await Sale.findAll({'
    );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('reportController patched');
