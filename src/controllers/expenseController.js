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
        const categories = await ExpenseCategory.findAll({ 
            where: { organization_id: req.user.organization_id },
            order: [['name', 'ASC']] 
        });
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
            payments, // Array of { payment_method, amount, reference_number, notes, cheque_details }
            total_amount: payload_total,
            expense_date,
            category_id,
            expense_category_id,
            branch_id: payload_branch_id,
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
                const anyBranch = await Branch.findOne({
                    where: { organization_id, is_active: true }
                });
                if (anyBranch) branch_id = anyBranch.id;
            }
        }

        if (!branch_id) return errorResponse(res, 'Branch ID is required', 400);

        const actual_category_id = category_id || expense_category_id;
        const actual_notes = note || notes;
        const total_amount = payload_total || payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        if (total_amount <= 0) return errorResponse(res, 'Expense amount must be greater than zero', 400);

        // --- 1. CREATE EXPENSE HEADER ---
        const expense = await Expense.create({
            ...bodyData,
            amount: total_amount,
            expense_category_id: actual_category_id,
            notes: actual_notes,
            receipt_image: req.file ? req.file.path : null,
            organization_id,
            user_id,
            branch_id
        }, { transaction: t });

        // --- 2. ACCOUNTING: DEBIT THE EXPENSE ACCOUNT ---
        const [expenseAccount] = await Account.findOrCreate({
            where: { organization_id, code: '5000' },
            defaults: { name: 'General Expenses', type: 'expense' },
            transaction: t
        });

        await accountingService.recordTransaction({
            organization_id,
            branch_id,
            account_id: expenseAccount.id,
            amount: total_amount,
            type: 'debit',
            reference_type: 'Expense',
            reference_id: expense.id,
            transaction_date: expense_date || new Date(),
            description: `Expense: ${reference_no || expense.id} | ${actual_notes || 'N/A'}`
        }, t);

        // --- 3. PROCESS SPLIT PAYMENTS & CREDITS ---
        for (const pmt of payments) {
            const amt = parseFloat(pmt.amount || 0);
            if (amt <= 0) continue;

            const method = pmt.payment_method.toLowerCase();
            
            let accountCode = '1010'; // Default Cash
            let accountName = 'Cash in Hand';
            let accountType = 'asset';

            if (method === 'bank' || method === 'bank_transfer' || method === 'card' || method === 'credit_card') {
                accountCode = '1020';
                accountName = 'Bank';
            } else if (method === 'cheque') {
                accountCode = '2110';
                accountName = 'Cheques Payable';
                accountType = 'liability';
            }

            const [paymentAccount] = await Account.findOrCreate({
                where: { organization_id, code: accountCode },
                defaults: { name: accountName, type: accountType },
                transaction: t
            });

            // Credit Entry
            const ledgerCreditTx = await accountingService.recordTransaction({
                organization_id,
                branch_id,
                account_id: paymentAccount.id,
                amount: amt,
                type: 'credit',
                reference_type: 'Expense',
                reference_id: expense.id,
                transaction_date: expense_date || new Date(),
                description: `Payment for Expense ${reference_no || expense.id} via ${method}`
            }, t);

            // Record Breakdown
            await db.ExpensePaymentMethod.create({
                organization_id,
                expense_id: expense.id,
                payment_method: method,
                amount: amt,
                reference_number: pmt.reference_number,
                transaction_id: ledgerCreditTx.id,
                notes: pmt.notes
            }, { transaction: t });

            // Handle Cheque
            if (method === 'cheque' && pmt.cheque_details) {
                const { bank_name, cheque_number, cheque_date, payee_payor_name } = pmt.cheque_details;
                await Cheque.create({
                    organization_id,
                    branch_id,
                    type: 'payable',
                    bank_name,
                    cheque_number,
                    cheque_date,
                    amount: amt,
                    received_issued_date: expense_date || new Date(),
                    status: 'pending',
                    payee_payor_name: payee_payor_name || null,
                    reference_type: 'expense',
                    reference_id: expense.id
                }, { transaction: t });
            }
        }

        await t.commit();

        // Audit Log
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCreate(
            organization_id,
            user_id,
            'Expense',
            expense.id,
            { total_amount, expense_date, reference_no, methods: payments.map(p => p.payment_method) },
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
            amount: newAmount,
            payment_method: newPaymentMethod,
            branch_id: newBranchId,
            expense_date: newExpenseDate,
            category_id,
            expense_category_id,
            note,
            notes
        } = bodyData;

        const actual_category_id = category_id || expense_category_id;
        const actual_notes = note || notes;

        // Fields that affect accounting
        const amountChanged = newAmount !== undefined && parseFloat(newAmount) !== parseFloat(expense.amount);
        const paymentMethodChanged = newPaymentMethod !== undefined && newPaymentMethod !== expense.payment_method;
        const branchChanged = newBranchId !== undefined && newBranchId !== expense.branch_id;
        const dateChanged = newExpenseDate !== undefined && new Date(newExpenseDate).getTime() !== new Date(expense.expense_date).getTime();

        await expense.update({
            ...bodyData,
            expense_category_id: actual_category_id,
            notes: actual_notes,
            receipt_image: req.file ? req.file.path : expense.receipt_image
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

const getExpenseById = async (req, res, next) => {
    try {
        const { organization_id } = req.user;
        const { id } = req.params;

        const expense = await Expense.findOne({
            where: { id, organization_id },
            include: [
                { model: ExpenseCategory, as: 'category' },
                { model: Branch, as: 'branch' },
                { model: User, as: 'recorded_by_user' }
            ]
        });

        if (!expense) {
            return errorResponse(res, 'Expense not found', 404);
        }

        return successResponse(res, expense, 'Expense details fetched');
    } catch (error) { next(error); }
};

module.exports = {
    getAllExpenseCategories, createExpenseCategory,
    getAllExpenses, createExpense, updateExpense, deleteExpense,
    getExpenseById
};
