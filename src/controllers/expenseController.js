const { Expense, ExpenseCategory, Organization, Branch, User, Cheque, Transaction, Account } = require('../models');
const db = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');

// --- Expense Categories ---
const getAllExpenseCategories = async (req, res, next) => {
    try {
        const categories = await ExpenseCategory.findAll({ order: [['name', 'ASC']] });
        return successResponse(res, categories, 'Expense categories fetched');
    } catch (error) { next(error); }
};

const createExpenseCategory = async (req, res, next) => {
    try {
        const { organization_id } = req.user; // Use organization from logged in user
        const category = await ExpenseCategory.create({ ...req.body, organization_id });
        return successResponse(res, category, 'Expense category created', 201);
    } catch (error) { next(error); }
};

// --- Expenses ---
const getAllExpenses = async (req, res, next) => {
    try {
        const { page, size, from_date, to_date } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = {};
        if (from_date && to_date) {
            where.expense_date = { [Op.between]: [new Date(from_date), new Date(to_date)] };
        }

        const expenses = await Expense.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                { model: ExpenseCategory, as: 'category' },
                { model: Branch, as: 'branch' },
                { model: User, as: 'recorded_by_user' }
            ],
            order: [['expense_date', 'DESC']]
        });

        return paginatedResponse(res, expenses.rows, {
            total: expenses.count,
            page: parseInt(page) || 1,
            limit
        }, 'Expenses fetched successfully');
    } catch (error) { next(error); }
};

const createExpense = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { organization_id, id: user_id } = req.user;
        const { payment_method, amount, expense_date, category_id, branch_id: payload_branch_id, cheque_details, reference_no, note } = req.body;

        const branch_id = payload_branch_id || req.user.branch_id;

        const expense = await Expense.create({
            ...req.body,
            organization_id,
            user_id,
            branch_id
        }, { transaction: t });

        // Create Cheque if payment method is cheque
        if (payment_method === 'cheque' && cheque_details) {
            const { bank_name, cheque_number, cheque_date, payee_payor_name } = cheque_details;
            await Cheque.create({
                organization_id,
                branch_id,
                type: 'payable',
                bank_name,
                cheque_number,
                cheque_date,
                amount,
                received_issued_date: expense_date || new Date(),
                status: 'pending',
                payee_payor_name: payee_payor_name || null,
                reference_type: 'expense',
                reference_id: expense.id
            }, { transaction: t });
        }

        // Financial Transaction (Optional but recommended for consistency)
        // Find Expense Account and Cash/Cheque Account
        const [expenseAccount] = await Account.findOrCreate({
            where: { organization_id, code: '5000' },
            defaults: { name: 'General Expenses', type: 'expense' },
            transaction: t
        });

        const [cashAccount] = await Account.findOrCreate({
            where: { organization_id, code: '1000' },
            defaults: { name: 'Cash', type: 'asset' },
            transaction: t
        });

        const [chequesPayableAccount] = await Account.findOrCreate({
            where: { organization_id, code: '2100' },
            defaults: { name: 'Cheques Payable', type: 'liability' },
            transaction: t
        });

        // Debit Expense
        await Transaction.create({
            organization_id,
            branch_id,
            account_id: expenseAccount.id,
            amount,
            type: 'debit',
            reference_type: 'Expense',
            reference_id: expense.id,
            transaction_date: expense_date || new Date(),
            description: `Expense: ${reference_no || expense.id}`
        }, { transaction: t });

        // Credit Cash or Cheques Payable
        const targetAccountId = payment_method === 'cheque' ? chequesPayableAccount.id : cashAccount.id;
        const accountName = payment_method === 'cheque' ? 'Cheques Payable' : 'Cash';

        await Transaction.create({
            organization_id,
            branch_id,
            account_id: targetAccountId,
            amount,
            type: 'credit', // Asset decrease
            reference_type: 'Expense',
            reference_id: expense.id,
            transaction_date: expense_date || new Date(),
            description: `Payment for Expense via ${accountName}`
        }, { transaction: t });

        // --- ACCOUNT BALANCE UPDATES ---
        // 1. Expense Account (Debit - Increase Expense) -> Use custom method or convention
        // For 'expense' type, usually Debits increase the balance (total expense).
        await Account.increment('balance', { by: amount, where: { id: expenseAccount.id }, transaction: t });

        // 2. Cash/Bank Account (Credit - Decrease Asset)
        // For 'asset' type, Credits decrease the balance.
        await Account.decrement('balance', { by: amount, where: { id: targetAccountId }, transaction: t });

        await t.commit();
        return successResponse(res, expense, 'Expense recorded successfully', 201);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

const updateExpense = async (req, res, next) => {
    try {
        const expense = await Expense.findByPk(req.params.id);
        if (!expense) return errorResponse(res, 'Expense not found', 404);
        await expense.update(req.body);
        return successResponse(res, expense, 'Expense updated successfully');
    } catch (error) { next(error); }
};

const deleteExpense = async (req, res, next) => {
    try {
        const expense = await Expense.findByPk(req.params.id);
        if (!expense) return errorResponse(res, 'Expense not found', 404);
        await expense.destroy();
        return successResponse(res, null, 'Expense deleted successfully');
    } catch (error) { next(error); }
};

module.exports = {
    getAllExpenseCategories, createExpenseCategory,
    getAllExpenses, createExpense, updateExpense, deleteExpense
};
