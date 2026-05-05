const db = require('../models');
const { Distributor, Transaction, Account, Sale } = db;
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Sequelize } = require('sequelize');
const auditService = require('../services/auditService');
const accountingService = require('../services/accountingService');

/**
 * Distributor Controller
 */
const getAllDistributors = async (req, res, next) => {
    try {
        const { page, size, name } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = {};
        if (name) {
            where.name = { [Sequelize.Op.like]: `%${name}%` };
        }

        const distributors = await Distributor.findAndCountAll({
            attributes: {
                include: [
                    [
                        Sequelize.literal(`(
                            SELECT COALESCE(SUM(payable_amount), 0)
                            FROM sales AS sale
                            WHERE
                                sale.distributor_id = Distributor.id
                                AND sale.status = 'completed'
                        )`),
                        'totalSpent'
                    ],
                    [
                        Sequelize.literal(`(
                            SELECT COUNT(*)
                            FROM sales AS sale
                            WHERE
                                sale.distributor_id = Distributor.id
                                AND sale.status = 'completed'
                        )`),
                        'visits'
                    ]
                ]
            },
            where: { ...where, organization_id: req.user.organization_id },
            limit,
            offset,
            order: [['name', 'ASC']]
        });

        return paginatedResponse(res, distributors.rows, {
            total: distributors.count,
            page: parseInt(page) || 1,
            limit
        }, 'Distributors fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Distributor Ledger
 */
const getDistributorLedger = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { from_date, to_date } = req.query;

        const distributor = await Distributor.findOne({
            where: { id, organization_id: req.user.organization_id }
        });
        if (!distributor) {
            return errorResponse(res, 'Distributor not found', 404);
        }

        const arAccount = await Account.findOne({
            where: {
                organization_id: req.user.organization_id,
                code: '1100' // Accounts Receivable
            }
        });

        if (!arAccount) {
            return errorResponse(res, 'Accounts Receivable account not found.', 500);
        }

        const where = {
            distributor_id: id,
            account_id: arAccount.id
        };
        if (from_date && to_date) {
            where.transaction_date = {
                [Sequelize.Op.between]: [new Date(from_date), new Date(to_date)]
            };
        }

        const transactions = await Transaction.findAll({
            where,
            include: [{ model: Account, as: 'account' }],
            order: [['transaction_date', 'ASC'], ['id', 'ASC']]
        });

        let balance = parseFloat(distributor.opening_balance || 0);
        const ledger = transactions.map(t => {
            if (t.type === 'debit') {
                balance += parseFloat(t.amount);
            } else {
                balance -= parseFloat(t.amount);
            }
            return {
                ...t.toJSON(),
                balance
            };
        });

        return successResponse(res, {
            distributor,
            ledger,
            current_balance: balance
        }, 'Distributor ledger fetched successfully');
    } catch (error) {
        next(error);
    }
};

const getDistributorById = async (req, res, next) => {
    try {
        const distributor = await Distributor.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!distributor) return errorResponse(res, 'Distributor not found', 404);
        return successResponse(res, distributor, 'Distributor details fetched');
    } catch (error) { next(error); }
};

const createDistributor = async (req, res, next) => {
    try {
        const organization_id = req.user.organization_id;
        const distributor = await Distributor.create({ ...req.body, organization_id });

        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            organization_id,
            req.user.id,
            'Distributor',
            distributor.id,
            { name: distributor.name, email: distributor.email, phone: distributor.phone },
            ipAddress,
            userAgent
        );

        return successResponse(res, distributor, 'Distributor created successfully', 201);
    } catch (error) { next(error); }
};

const updateDistributor = async (req, res, next) => {
    try {
        const distributor = await Distributor.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!distributor) return errorResponse(res, 'Distributor not found', 404);

        const oldValues = { name: distributor.name, email: distributor.email, phone: distributor.phone };
        await distributor.update(req.body);

        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            req.user.organization_id,
            req.user.id,
            'Distributor',
            distributor.id,
            oldValues,
            req.body,
            ipAddress,
            userAgent
        );

        return successResponse(res, distributor, 'Distributor updated successfully');
    } catch (error) { next(error); }
};

const deleteDistributor = async (req, res, next) => {
    try {
        const distributor = await Distributor.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!distributor) return errorResponse(res, 'Distributor not found', 404);

        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logDelete(
            req.user.organization_id,
            req.user.id,
            'Distributor',
            distributor.id,
            { name: distributor.name, email: distributor.email },
            ipAddress,
            userAgent
        );

        await distributor.destroy();
        return successResponse(res, null, 'Distributor deleted successfully');
    } catch (error) { next(error); }
};

const getActiveDistributorsList = async (req, res, next) => {
    try {
        const distributors = await Distributor.findAll({
            where: { is_active: true, organization_id: req.user.organization_id },
            order: [['name', 'ASC']]
        });
        return successResponse(res, distributors, 'Active distributors list fetched');
    } catch (error) { next(error); }
};

const createDistributorPayment = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { id: distributor_id } = req.params;
        const { amount, payment_method, reference_number, transaction_date, description, cheque_details, branch_id: payload_branch_id } = req.body;
        const organization_id = req.user.organization_id;
        
        let branch_id = payload_branch_id || req.user.branch_id;

        if (!branch_id) {
            const mainBranch = await db.Branch.findOne({ where: { organization_id, is_main: true } });
            branch_id = mainBranch?.id;
        }

        if (!branch_id) {
            if (t) await t.rollback();
            return errorResponse(res, 'Branch ID is required.', 400);
        }

        const distributor = await Distributor.findOne({
            where: { id: distributor_id, organization_id }
        });
        if (!distributor) {
            return errorResponse(res, 'Distributor not found', 404);
        }

        const [arAccount] = await Account.findOrCreate({
            where: { organization_id, code: '1100' },
            defaults: { name: 'Accounts Receivable', type: 'asset' },
            transaction: t
        });

        const [paymentAccount] = await Account.findOrCreate({
            where: {
                organization_id,
                code: payment_method === 'cash' ? '1000' : (payment_method === 'cheque' ? '1050' : '1020'),
            },
            defaults: {
                name: payment_method === 'cash' ? 'Cash' : (payment_method === 'cheque' ? 'Cheques in Hand' : 'Bank'),
                type: 'asset'
            },
            transaction: t
        });

        const creditTransaction = await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: arAccount.id,
            distributor_id,
            amount,
            type: 'credit',
            reference_type: 'Payment',
            reference_id: reference_number || null,
            transaction_date: transaction_date || new Date(),
            description: description || `Wholesale Payment from ${distributor.name}`
        }, t);

        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: paymentAccount.id,
            distributor_id,
            amount,
            type: 'debit',
            reference_type: 'Payment',
            reference_id: creditTransaction.id,
            transaction_date: transaction_date || new Date(),
            description: `Wholesale Payment from ${distributor.name} via ${payment_method}`
        }, t);

        if (payment_method === 'cheque' && cheque_details) {
            const { bank_name, cheque_number, cheque_date, payee_payor_name } = cheque_details;
            await db.Cheque.create({
                organization_id,
                branch_id,
                type: 'receivable',
                bank_name,
                cheque_number,
                cheque_date,
                amount,
                received_issued_date: transaction_date || new Date(),
                status: 'pending',
                payee_payor_name: payee_payor_name || distributor.name,
                reference_type: 'sale',
                reference_id: creditTransaction.id
            }, { transaction: t });
        }

        await t.commit();
        return successResponse(res, creditTransaction, 'Wholesale payment recorded successfully', 201);
    } catch (error) {
        if (t) await t.rollback();
        next(error);
    }
};

const getDistributorPurchasedItems = async (req, res, next) => {
    try {
        const { id } = req.params;
        const organization_id = req.user.organization_id;

        const items = await db.SaleItem.findAll({
            attributes: [
                'product_id',
                [Sequelize.fn('SUM', Sequelize.col('SaleItem.quantity')), 'purchase_count'],
                [Sequelize.fn('MAX', Sequelize.col('sale.sale_date')), 'last_purchase_date'],
            ],
            include: [
                {
                    model: db.Sale,
                    as: 'sale',
                    attributes: [],
                    where: { distributor_id: id, organization_id, status: 'completed' }
                },
                {
                    model: db.Product,
                    as: 'product',
                    attributes: ['name']
                }
            ],
            group: ['product_id', 'product.id'],
            order: [[Sequelize.literal('last_purchase_date'), 'DESC']]
        });

        const formatted = items.map(item => ({
            product_id: item.product_id,
            product_name: item.product ? item.product.name : 'Unknown Product',
            purchase_count: parseFloat(item.get('purchase_count') || 0),
            last_purchase_date: item.get('last_purchase_date')
        }));

        return successResponse(res, formatted, 'Wholesale purchased items fetched');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAllDistributors,
    getDistributorById,
    createDistributor,
    updateDistributor,
    deleteDistributor,
    getActiveDistributorsList,
    getDistributorLedger,
    createDistributorPayment,
    getDistributorPurchasedItems
};
