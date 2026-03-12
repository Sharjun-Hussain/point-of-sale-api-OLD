const { Expense, ExpenseCategory, Organization, Branch, User, Cheque, Transaction, Account } = require('../models');
const db = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');
const accountingService = require('../services/accountingService');
const auditService = require('../services/auditService');

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

        const where = { organization_id: req.user.organization_id };
        if (from_date && to_date) {
            where.expense_date = { [Op.between]: [new Date(from_date), new Date(to_date)] };
        }

        const { branch_id, category_id } = req.query;
        if (branch_id) where.branch_id = branch_id;
        if (category_id) where.expense_category_id = category_id;

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

        // Handle potentially stringified data from FormData
        let bodyData = req.body;
        if (req.body.data) {
            try {
                bodyData = JSON.parse(req.body.data);
            } catch (e) {
                console.error("Failed to parse req.body.data", e);
            }
        }

        const {
            payment_method,
            amount,
            expense_date,
            category_id,
            expense_category_id,
            branch_id: payload_branch_id,
            cheque_details,
            reference_no,
            note,
            notes
        } = bodyData;

        let branch_id = payload_branch_id || req.user.branch_id;

        // Fallback to main branch if no branch_id is found
        if (!branch_id) {
            const mainBranch = await Branch.findOne({
                where: { organization_id, is_main: true }
            });
            if (mainBranch) {
                branch_id = mainBranch.id;
            } else {
                // Last resort: find any active branch for this org
                const anyBranch = await Branch.findOne({
                    where: { organization_id, is_active: true }
                });
                if (anyBranch) branch_id = anyBranch.id;
            }
        }

        if (!branch_id) {
            return errorResponse(res, 'No branch associated with user or organization', 400);
        }

        const actual_category_id = category_id || expense_category_id;
        const actual_notes = note || notes;

        const expense = await Expense.create({
            ...bodyData,
            expense_category_id: actual_category_id,
            notes: actual_notes,
            receipt_image: req.file ? req.file.path : null,
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
        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: expenseAccount.id,
            amount,
            type: 'debit',
            reference_type: 'Expense',
            reference_id: expense.id,
            transaction_date: expense_date || new Date(),
            description: `Expense: ${reference_no || expense.id}`
        }, t);

        // Credit Cash or Cheques Payable
        const targetAccountId = payment_method === 'cheque' ? chequesPayableAccount.id : cashAccount.id;
        const accountName = payment_method === 'cheque' ? 'Cheques Payable' : 'Cash';

        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: targetAccountId,
            amount,
            type: 'credit',
            reference_type: 'Expense',
            reference_id: expense.id,
            transaction_date: expense_date || new Date(),
            description: `Payment for Expense via ${accountName}`
        }, t);

        await t.commit();

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            organization_id,
            user_id,
            'Expense',
            expense.id,
            {
                amount,
                expense_date: expense.expense_date,
                payment_method,
                expense_category_id: actual_category_id,
                reference_no,
                branch_id
            },
            ipAddress,
            userAgent
        );

        return successResponse(res, expense, 'Expense recorded successfully', 201);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

const updateExpense = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { organization_id } = req.user;
        const { id } = req.params;

        const expense = await Expense.findOne({
            where: { id, organization_id },
            transaction: t
        });

        if (!expense) {
            await t.rollback();
            return errorResponse(res, 'Expense not found', 404);
        }

        const oldValues = expense.toJSON();
        const {
            amount: newAmount,
            payment_method: newPaymentMethod,
            branch_id: newBranchId,
            expense_date: newExpenseDate,
            category_id,
            expense_category_id,
            note,
            notes
        } = req.body;

        const actual_category_id = category_id || expense_category_id;
        const actual_notes = note || notes;

        // Fields that affect accounting
        const amountChanged = newAmount !== undefined && parseFloat(newAmount) !== parseFloat(expense.amount);
        const paymentMethodChanged = newPaymentMethod !== undefined && newPaymentMethod !== expense.payment_method;
        const branchChanged = newBranchId !== undefined && newBranchId !== expense.branch_id;
        const dateChanged = newExpenseDate !== undefined && new Date(newExpenseDate).getTime() !== new Date(expense.expense_date).getTime();

        await expense.update({
            ...req.body,
            expense_category_id: actual_category_id,
            notes: actual_notes
        }, { transaction: t });

        if (amountChanged || paymentMethodChanged || branchChanged || dateChanged) {
            // Re-calculate accounting transactions
            // 1. Delete old transactions
            await Transaction.destroy({
                where: {
                    organization_id,
                    reference_type: 'Expense',
                    reference_id: expense.id
                },
                transaction: t
            });

            // 2. Record new transactions
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

            const amount = newAmount || expense.amount;
            const branch_id = newBranchId || expense.branch_id;
            const payment_method = newPaymentMethod || expense.payment_method;
            const expense_date = newExpenseDate || expense.expense_date;

            // Debit Expense
            await accountingService.recordTransaction({
                organization_id,
                branch_id,
                account_id: expenseAccount.id,
                amount,
                type: 'debit',
                reference_type: 'Expense',
                reference_id: expense.id,
                transaction_date: expense_date,
                description: `Expense Update: ${expense.reference_no || expense.id}`
            }, t);

            // Credit Asset/Liability
            const targetAccountId = payment_method === 'cheque' ? chequesPayableAccount.id : cashAccount.id;
            const accountName = payment_method === 'cheque' ? 'Cheques Payable' : 'Cash';

            await accountingService.recordTransaction({
                organization_id,
                branch_id,
                account_id: targetAccountId,
                amount,
                type: 'credit',
                reference_type: 'Expense',
                reference_id: expense.id,
                transaction_date: expense_date,
                description: `Payment for Updated Expense via ${accountName}`
            }, t);
        }

        await t.commit();

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logUpdate(
            organization_id,
            req.user.id,
            'Expense',
            expense.id,
            oldValues,
            expense.toJSON(),
            ipAddress,
            userAgent
        );

        return successResponse(res, expense, 'Expense updated successfully');
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

const deleteExpense = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { organization_id } = req.user;
        const { id } = req.params;

        const expense = await Expense.findOne({
            where: { id, organization_id },
            transaction: t
        });

        if (!expense) {
            await t.rollback();
            return errorResponse(res, 'Expense not found', 404);
        }

        const oldValues = expense.toJSON();

        // 1. Delete associated transactions
        await Transaction.destroy({
            where: {
                organization_id,
                reference_type: 'Expense',
                reference_id: expense.id
            },
            transaction: t
        });

        // 2. Delete associated cheques if any
        await Cheque.destroy({
            where: {
                organization_id,
                reference_type: 'expense',
                reference_id: expense.id
            },
            transaction: t
        });

        // 3. Delete expense
        await expense.destroy({ transaction: t });

        await t.commit();

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logDelete(
            organization_id,
            req.user.id,
            'Expense',
            expense.id,
            oldValues,
            ipAddress,
            userAgent
        );

        return successResponse(res, null, 'Expense deleted successfully');
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

module.exports = {
    getAllExpenseCategories, createExpenseCategory,
    getAllExpenses, createExpense, updateExpense, deleteExpense
};
