const db = require('../models');
const { Customer, Transaction, Account, Sale } = db;
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Sequelize } = require('sequelize');
const auditService = require('../services/auditService');
const accountingService = require('../services/accountingService');

/**
 * Customer Controller
 */
const getAllCustomers = async (req, res, next) => {
    try {
        const { page, size, name } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = {};
        if (name) {
            where.name = { [Sequelize.Op.like]: `%${name}%` };
        }

        const customers = await Customer.findAndCountAll({
            where: { ...where, organization_id: req.user.organization_id },
            limit,
            offset,
            order: [['name', 'ASC']]
        });

        return paginatedResponse(res, customers.rows, {
            total: customers.count,
            page: parseInt(page) || 1,
            limit
        }, 'Customers fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Customer Ledger
 */
const getCustomerLedger = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { from_date, to_date } = req.query;

        const customer = await Customer.findOne({
            where: { id, organization_id: req.user.organization_id }
        });
        if (!customer) {
            return errorResponse(res, 'Customer not found', 404);
        }

        // Get the AR Account
        const arAccount = await Account.findOne({
            where: {
                organization_id: req.user.organization_id,
                code: '1100' // Accounts Receivable
            }
        });

        if (!arAccount) {
            return errorResponse(res, 'Accounts Receivable account not found. Please set up your chart of accounts.', 500);
        }

        // Build where clause for AR transactions only
        const where = {
            customer_id: id,
            account_id: arAccount.id  // CRITICAL FIX: Only AR transactions
        };
        if (from_date && to_date) {
            where.transaction_date = {
                [Sequelize.Op.between]: [new Date(from_date), new Date(to_date)]
            };
        }

        const transactions = await Transaction.findAll({
            where,
            include: [{ model: Account, as: 'account' }],
            order: [['transaction_date', 'ASC']]
        });

        // Calculate running balance (what customer owes)
        let balance = 0;
        const ledger = transactions.map(t => {
            if (t.type === 'debit') { // Sale or charge - customer owes MORE
                balance += parseFloat(t.amount);
            } else { // Payment - customer owes LESS
                balance -= parseFloat(t.amount);
            }
            return {
                ...t.toJSON(),
                balance
            };
        });

        return successResponse(res, {
            customer,
            ledger,
            current_balance: balance
        }, 'Customer ledger fetched successfully');
    } catch (error) {
        next(error);
    }
};

const getCustomerById = async (req, res, next) => {
    try {
        const customer = await Customer.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!customer) return errorResponse(res, 'Customer not found', 404);
        return successResponse(res, customer, 'Customer details fetched');
    } catch (error) { next(error); }
};

const createCustomer = async (req, res, next) => {
    try {
        const organization_id = req.user.organization_id;
        const customer = await Customer.create({ ...req.body, organization_id });

        // Log customer creation
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            organization_id,
            req.user.id,
            'Customer',
            customer.id,
            { name: customer.name, email: customer.email, phone: customer.phone },
            ipAddress,
            userAgent
        );

        return successResponse(res, customer, 'Customer created successfully', 201);
    } catch (error) { next(error); }
};

const updateCustomer = async (req, res, next) => {
    try {
        const customer = await Customer.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!customer) return errorResponse(res, 'Customer not found', 404);

        const oldValues = { name: customer.name, email: customer.email, phone: customer.phone };
        await customer.update(req.body);

        // Log customer update
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            req.user.organization_id,
            req.user.id,
            'Customer',
            customer.id,
            oldValues,
            req.body,
            ipAddress,
            userAgent
        );

        return successResponse(res, customer, 'Customer updated successfully');
    } catch (error) { next(error); }
};

const deleteCustomer = async (req, res, next) => {
    try {
        const customer = await Customer.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!customer) return errorResponse(res, 'Customer not found', 404);

        // Log customer deletion
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logDelete(
            req.user.organization_id,
            req.user.id,
            'Customer',
            customer.id,
            { name: customer.name, email: customer.email },
            ipAddress,
            userAgent
        );

        await customer.destroy();
        return successResponse(res, null, 'Customer deleted successfully');
    } catch (error) { next(error); }
};

const getActiveCustomersList = async (req, res, next) => {
    try {
        const customers = await Customer.findAll({
            where: { is_active: true, organization_id: req.user.organization_id },
            order: [['name', 'ASC']]
        });
        return successResponse(res, customers, 'Active customers list fetched');
    } catch (error) { next(error); }
};

const createCustomerPayment = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { id: customer_id } = req.params;
        const { amount, payment_method, reference_number, transaction_date, description, cheque_details } = req.body;
        const organization_id = req.user.organization_id;
        const branch_id = req.user.branch_id;

        const customer = await Customer.findOne({
            where: { id: customer_id, organization_id }
        });
        if (!customer) {
            return errorResponse(res, 'Customer not found', 404);
        }

        // 1. Get Accounts Receivable account
        const [arAccount] = await Account.findOrCreate({
            where: {
                organization_id,
                code: '1100', // Accounts Receivable
                name: 'Accounts Receivable'
            },
            defaults: { type: 'asset' },
            transaction: t
        });

        // 2. Get Cash/Bank/Cheque account based on payment method
        const [paymentAccount] = await Account.findOrCreate({
            where: {
                organization_id,
                code: payment_method === 'cash' ? '1000' : (payment_method === 'cheque' ? '1050' : '1020'),
                name: payment_method === 'cash' ? 'Cash' : (payment_method === 'cheque' ? 'Cheques in Hand' : 'Bank')
            },
            defaults: { type: 'asset' },
            transaction: t
        });

        // 3. Record CREDIT in AR (decreases asset)
        const creditTransaction = await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: arAccount.id,
            customer_id,
            amount,
            type: 'credit',
            reference_type: 'Payment',
            reference_id: reference_number || null,
            transaction_date: transaction_date || new Date(),
            description: description || `Payment from ${customer.name}`
        }, t);

        // 4. Record DEBIT in Cash/Bank/Cheque (increases asset)
        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: paymentAccount.id,
            customer_id,
            amount,
            type: 'debit',
            reference_type: 'Payment',
            reference_id: creditTransaction.id,
            transaction_date: transaction_date || new Date(),
            description: `Payment from ${customer.name} via ${payment_method}`
        }, t);

        // Create Cheque record if needed
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
                payee_payor_name: payee_payor_name || customer.name,
                reference_type: 'sale',
                reference_id: creditTransaction.id
            }, { transaction: t });
        }

        // Log payment
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCustom(
            organization_id,
            req.user.id,
            'CUSTOMER_PAYMENT',
            `Payment of ${amount} recorded for customer ${customer.name} via ${payment_method}`,
            ipAddress,
            userAgent,
            { customer_id, amount, payment_method, reference_number }
        );

        await t.commit();
        return successResponse(res, creditTransaction, 'Payment recorded successfully', 201);
    } catch (error) {
        if (t) await t.rollback();
        next(error);
    }
};

module.exports = {
    getAllCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    getActiveCustomersList,
    getCustomerLedger,
    createCustomerPayment
};
