const db = require('../models');
const { Account, Transaction, Customer, Supplier } = db;
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Sequelize } = require('sequelize');
const accountingService = require('../services/accountingService');

/**
 * Account Controller
 */

// Get all accounts
const getAllAccounts = async (req, res, next) => {
    try {
        const { type, is_active } = req.query;
        const organization_id = req.user.organization_id;

        const where = { organization_id };
        if (type) where.type = type;
        if (is_active !== undefined) where.is_active = is_active === 'true';

        const accounts = await Account.findAll({
            where,
            order: [['code', 'ASC']]
        });

        return successResponse(res, accounts, 'Accounts fetched successfully');
    } catch (error) {
        next(error);
    }
};

// Create a new account
const createAccount = async (req, res, next) => {
    try {
        const organization_id = req.user.organization_id;
        const { name, code, type, balance } = req.body;

        const existingAccount = await Account.findOne({
            where: { organization_id, code }
        });

        if (existingAccount) {
            return errorResponse(res, 'Account code already exists', 400);
        }

        const account = await Account.create({
            organization_id,
            name,
            code,
            type,
            balance: balance || 0.00
        });

        return successResponse(res, account, 'Account created successfully', 201);
    } catch (error) {
        next(error);
    }
};

// Update an account
const updateAccount = async (req, res, next) => {
    try {
        const { id } = req.params;
        const organization_id = req.user.organization_id;

        const account = await Account.findOne({
            where: { id, organization_id }
        });

        if (!account) {
            return errorResponse(res, 'Account not found', 404);
        }

        await account.update(req.body);

        return successResponse(res, account, 'Account updated successfully');
    } catch (error) {
        next(error);
    }
};

// Get Account Ledger (Transactions)
const getAccountLedger = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { page, size, from_date, to_date } = req.query;
        const organization_id = req.user.organization_id;
        const { limit, offset } = getPagination(page, size);

        const account = await Account.findOne({
            where: { id, organization_id }
        });

        if (!account) {
            return errorResponse(res, 'Account not found', 404);
        }

        const where = { account_id: id, organization_id };
        if (from_date && to_date) {
            where.transaction_date = {
                [Sequelize.Op.between]: [new Date(from_date), new Date(to_date)]
            };
        }

        const transactions = await Transaction.findAndCountAll({
            where,
            include: [
                { model: Customer, as: 'customer', attributes: ['name'] },
                { model: Supplier, as: 'supplier', attributes: ['name'] }
            ],
            limit,
            offset,
            order: [['transaction_date', 'DESC']]
        });

        return paginatedResponse(res, transactions.rows, {
            total: transactions.count,
            page: parseInt(page) || 1,
            limit
        }, 'Account ledger fetched successfully');
    } catch (error) {
        next(error);
    }
};

// Set Opening Balance
const setOpeningBalance = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { id } = req.params;
        const { balance, date } = req.body;
        const organization_id = req.user.organization_id;
        const branch_id = req.user.branch_id;

        const account = await Account.findOne({
            where: { id, organization_id },
            transaction: t
        });

        if (!account) {
            return errorResponse(res, 'Account not found', 404);
        }

        // 1. Create a transaction for opening balance
        // Determine correct type based on account type and balance sign
        let transactionType;
        if (balance >= 0) {
            // Positive balance
            transactionType = (['asset', 'expense'].includes(account.type)) ? 'debit' : 'credit';
        } else {
            // Negative balance (rare but possible)
            transactionType = (['asset', 'expense'].includes(account.type)) ? 'credit' : 'debit';
        }

        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: account.id,
            amount: Math.abs(balance), // Use absolute value
            type: transactionType,
            reference_type: 'Opening Balance',
            transaction_date: date || new Date(),
            description: `Opening Balance for ${account.name}`
        }, t);

        await t.commit();
        return successResponse(res, account, 'Opening balance set successfully');
    } catch (error) {
        if (t) await t.rollback();
        next(error);
    }
};

// Transfer Funds between accounts
const transferFunds = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { from_account_id, to_account_id, amount, date, description } = req.body;
        const organization_id = req.user.organization_id;
        const branch_id = req.user.branch_id;

        if (from_account_id === to_account_id) {
            return errorResponse(res, 'Source and destination accounts must be different', 400);
        }

        const fromAccount = await Account.findOne({ where: { id: from_account_id, organization_id }, transaction: t });
        const toAccount = await Account.findOne({ where: { id: to_account_id, organization_id }, transaction: t });

        if (!fromAccount || !toAccount) {
            return errorResponse(res, 'One or both accounts not found', 404);
        }

        if (parseFloat(fromAccount.balance) < parseFloat(amount)) {
            // return errorResponse(res, 'Insufficient balance in source account', 400);
            // In accounting, we sometimes allow negative balance, but let's warn or restrict if needed.
            // For now, let's allow but we can add a check later.
        }

        // 1. Credit Source Account (Decrease Asset/Equity/Revenue or Increase Liability/Expense)
        // Usually Transfers are between Assets (Bank/Cash).
        // Credit Asset -> Decrease
        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: fromAccount.id,
            amount,
            type: 'credit',
            reference_type: 'Transfer',
            transaction_date: date || new Date(),
            description: description || `Transfer to ${toAccount.name}`
        }, t);

        // 2. Debit Destination Account (Increase Asset/Equity/Revenue or Decrease Liability/Expense)
        // Debit Asset -> Increase
        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: toAccount.id,
            amount,
            type: 'debit',
            reference_type: 'Transfer',
            transaction_date: date || new Date(),
            description: description || `Transfer from ${fromAccount.name}`
        }, t);

        await t.commit();
        return successResponse(res, null, 'Funds transferred successfully');
    } catch (error) {
        if (t) await t.rollback();
        next(error);
    }
};

// Create a Manual Journal Entry (Multi-line)
const createJournalEntry = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { date, description, entries } = req.body; // entries = [{ account_id, amount, type: 'debit'/'credit' }]
        const organization_id = req.user.organization_id;
        const branch_id = req.user.branch_id;

        if (!entries || entries.length < 2) {
            return errorResponse(res, 'At least two entries are required for a journal', 400);
        }

        // 1. Verify that debits and credits balance
        let totalDebit = 0;
        let totalCredit = 0;

        for (const entry of entries) {
            const amount = parseFloat(entry.amount);
            if (entry.type === 'debit') totalDebit += amount;
            else if (entry.type === 'credit') totalCredit += amount;
        }

        if (totalDebit.toFixed(2) !== totalCredit.toFixed(2)) {
            return errorResponse(res, `Journal does not balance. Total Debit: ${totalDebit.toFixed(2)}, Total Credit: ${totalCredit.toFixed(2)}`, 400);
        }

        // 2. Record transactions and update balances using AccountingService
        await accountingService.createDoubleEntry(organization_id, branch_id, entries, {
            date,
            description: description || 'Manual Journal Entry',
            reference_type: 'Journal Entry'
        }, t);

        await t.commit();
        return successResponse(res, null, 'Journal entry recorded successfully');
    } catch (error) {
        if (t) await t.rollback();
        next(error);
    }
};

module.exports = {
    getAllAccounts,
    createAccount,
    updateAccount,
    getAccountLedger,
    setOpeningBalance,
    transferFunds,
    createJournalEntry
};
