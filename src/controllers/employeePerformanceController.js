const db = require('../models');
const { Sale, SaleEmployee, User, Customer, Sequelize } = db;
const { Op } = Sequelize;
const { successResponse, errorResponse } = require('../utils/responseHandler');

const getEmployeePerformance = async (req, res, next) => {
    try {
        const { start_date, end_date, user_id, page = 1, limit = 10 } = req.query;
        const organization_id = req.user.organization_id;

        const whereClause = {
            organization_id,
            status: 'completed'
        };

        if (start_date && end_date) {
            whereClause.created_at = {
                [Op.between]: [new Date(start_date + 'T00:00:00'), new Date(end_date + 'T23:59:59')]
            };
        }

        const employeeWhere = {};
        if (user_id) {
            employeeWhere.user_id = user_id;
        }

        // Get all employees who have sales
        const employees = await User.findAll({
            where: {
                organization_id,
                ...(user_id ? { id: user_id } : {})
            },
            attributes: ['id', 'name', 'email', 'profile_image'],
            include: [
                {
                    model: Sale,
                    as: 'sales',
                    where: whereClause,
                    attributes: ['id', 'total_amount', 'created_at', 'customer_id'],
                    through: {
                        attributes: ['contribution_percentage']
                    },
                    required: false // Left join to include employees with 0 sales if specific user requested
                }
            ],
            // Use subquery or grouping for scalability in production, but JS aggregation is fine for now
        });

        const performanceData = employees.map(emp => {
            const sales = emp.sales || [];
            const totalSales = sales.length;
            const totalAmount = sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);

            // Calculate unique customers
            const uniqueCustomers = new Set(sales.filter(s => s.customer_id).map(s => s.customer_id)).size;

            return {
                id: emp.id,
                name: emp.name,
                email: emp.email,
                profile_image: emp.profile_image,
                total_sales: totalSales,
                total_amount: totalAmount,
                total_customers: uniqueCustomers,
                average_sale_value: totalSales > 0 ? totalAmount / totalSales : 0
            };
        });

        // Filter out employees with 0 sales if we are looking for leaderboard/all
        // unless a specific user was requested
        let filteredResults = user_id
            ? performanceData
            : performanceData.filter(p => p.total_sales > 0);

        // Sort by total amount descending
        filteredResults.sort((a, b) => b.total_amount - a.total_amount);

        // Calculate Summary Stats for the whole filtered set
        const summary = filteredResults.reduce((acc, curr) => ({
            totalSales: acc.totalSales + curr.total_sales,
            totalRevenue: acc.totalRevenue + Number(curr.total_amount),
            totalCustomers: acc.totalCustomers + curr.total_customers
        }), { totalSales: 0, totalRevenue: 0, totalCustomers: 0 });

        // Pagination
        const total = filteredResults.length;
        const totalPages = Math.ceil(total / limit);
        const offset = (page - 1) * limit;
        const paginatedData = filteredResults.slice(offset, offset + Number(limit));

        return successResponse(res, {
            data: paginatedData,
            summary,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages
            }
        }, 'Employee performance fetched successfully');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getEmployeePerformance
};
