const db = require('../models');
const { Shift, ShiftTransaction, User, Branch } = db;
const { successResponse, errorResponse } = require('../utils/responseHandler');
const auditService = require('../services/auditService');
const accountingService = require('../services/accountingService');

/**
 * Open a new shift
 */
const openShift = async (req, res, next) => {
    try {
        const { branch_id, opening_cash } = req.body;
        const organization_id = req.user.organization_id;
        const user_id = req.user.id;

        // Determine the branch: Request Body > User context > Branch list
        let targetBranchId = branch_id || req.user.branch_id;
        
        if (!targetBranchId && req.user.branches && req.user.branches.length > 0) {
            targetBranchId = req.user.branches[0].id;
        }

        // Fallback: If still no branch, try to find the only active branch for this organization
        if (!targetBranchId) {
            const organizationBranches = await Branch.findAll({ 
                where: { organization_id, is_active: true } 
            });
            if (organizationBranches.length === 1) {
                targetBranchId = organizationBranches[0].id;
            }
        }

        if (!targetBranchId) {
            return errorResponse(res, 'A branch must be selected to open a shift.', 400);
        }

        // Validate that the branch exists and belongs to the organization
        const branch = await Branch.findOne({ 
            where: { id: targetBranchId, organization_id } 
        });

        if (!branch) {
            // If the provided branch_id is invalid (stale session), try to find a valid one for this organization
            const validBranch = await Branch.findOne({ 
                where: { organization_id, is_active: true } 
            });

            if (validBranch) {
                targetBranchId = validBranch.id;
            } else {
                return errorResponse(res, 'The selected branch is invalid or no longer exists.', 400);
            }
        }

        // Check if there is an existing open shift for this user
        const existingShift = await Shift.findOne({
            where: { user_id, status: 'open' }
        });

        if (existingShift) {
            return errorResponse(res, 'You already have an open shift.', 400);
        }

        const shift = await Shift.create({
            organization_id,
            branch_id: targetBranchId,
            user_id,
            opening_cash: opening_cash || 0.00,
            status: 'open'
        });

        // Audit Log: Shift Opened
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.log({
            organizationId: organization_id,
            userId: user_id,
            action: 'SHIFT_OPEN',
            entityType: 'Shift',
            entityId: shift.id,
            description: `Shift opened with opening cash: ${opening_cash || 0.00}`,
            newValues: { opening_cash: shift.opening_cash, branch_id: targetBranchId },
            ipAddress,
            userAgent
        });

        return successResponse(res, shift, 'Shift opened successfully', 201);
    } catch (error) {
        next(error);
    }
};

/**
 * Get active shift for current user
 */
const getActiveShift = async (req, res, next) => {
    try {
        const user_id = req.user.id;

        const shift = await Shift.findOne({
            where: { user_id, status: 'open' },
            include: [{ model: ShiftTransaction, as: 'transactions' }]
        });

        if (!shift) {
            return errorResponse(res, 'No active shift found', 404);
        }

        return successResponse(res, shift, 'Active shift fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Add a transaction (pay-in, drop, payout)
 */
const addTransaction = async (req, res, next) => {
    try {
        const { shift_id } = req.params;
        const { type, amount, notes } = req.body;
        const user_id = req.user.id;

        const shift = await Shift.findOne({
            where: { id: shift_id, user_id, status: 'open' }
        });

        if (!shift) {
            return errorResponse(res, 'Active shift not found', 404);
        }

        const transaction = await ShiftTransaction.create({
            shift_id,
            type,
            amount,
            notes
        });

        // --- ACCOUNTING INTEGRATION ---
        const [cashAccount] = await db.Account.findOrCreate({
            where: { organization_id: req.user.organization_id, code: '1000' },
            defaults: { name: 'Cash', type: 'asset' }
        });

        // pay_in = Cash increases, drop/payout = Cash decreases
        const accountingType = type === 'pay_in' ? 'debit' : 'credit';
        
        await accountingService.recordTransaction({
            organization_id: req.user.organization_id,
            branch_id: shift.branch_id,
            account_id: cashAccount.id,
            amount,
            type: accountingType,
            reference_type: 'ShiftTransaction',
            reference_id: transaction.id,
            description: `Shift ${type}: ${notes || ''}`
        });

        // Audit Log: Shift Transaction
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.log({
            organizationId: req.user.organization_id,
            userId: user_id,
            action: 'SHIFT_TRANSACTION',
            entityType: 'ShiftTransaction',
            entityId: transaction.id,
            description: `Recorded shift ${type.replace('_', ' ')}: ${amount}`,
            newValues: transaction,
            ipAddress,
            userAgent,
            metadata: { shift_id }
        });

        return successResponse(res, transaction, 'Transaction recorded successfully', 201);
    } catch (error) {
        next(error);
    }
};

/**
 * Close shift
 */
const closeShift = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { shift_id } = req.params;
        const { closing_cash } = req.body;
        const user_id = req.user.id;

        const shift = await Shift.findOne({
            where: { id: shift_id, user_id, status: 'open' },
            include: [{ model: ShiftTransaction, as: 'transactions' }],
            transaction: t
        });

        if (!shift) {
            await t.rollback();
            return errorResponse(res, 'Active shift not found', 404);
        }

        // Calculate expected cash
        const sales = await db.Sale.findAll({
            where: { shift_id },
            include: [{ model: db.SalePayment, as: 'payments' }],
            transaction: t
        });
        
        let cashSales = 0;
        const saleIds = [];
        for (const sale of sales) {
            saleIds.push(sale.id);
            if (sale.payments && sale.payments.length > 0) {
                // Cap to payable_amount to exclude change given back to customer
                let remaining_payable = parseFloat(sale.payable_amount);
                for (const p of sale.payments) {
                    if (p.payment_method.toLowerCase() === 'cash') {
                        const effective = Math.min(parseFloat(p.amount), remaining_payable);
                        cashSales += effective;
                        remaining_payable -= effective;
                    }
                }
            } else if (sale.payment_method && sale.payment_method.toLowerCase() === 'cash') {
                // Fallback for legacy records created before SalePayment migration
                cashSales += Math.min(parseFloat(sale.paid_amount || 0), parseFloat(sale.payable_amount));
            }
        }

        // Subtract cash refunds issued during this shift
        let cashRefunds = 0;
        if (saleIds.length > 0) {
            const saleReturns = await db.SaleReturn.findAll({
                where: { sale_id: saleIds },
                include: [{ model: db.SaleReturnPayment, as: 'payments' }],
                transaction: t
            });
            for (const ret of saleReturns) {
                if (ret.payments && ret.payments.length > 0) {
                    cashRefunds += ret.payments
                        .filter(p => p.payment_method && p.payment_method.toLowerCase() === 'cash')
                        .reduce((sum, p) => sum + parseFloat(p.amount), 0);
                }
            }
        }

        let payIns = 0;
        let drops = 0;
        let payouts = 0;
        for (const tx of shift.transactions) {
            if (tx.type === 'pay_in') payIns += parseFloat(tx.amount);
            if (tx.type === 'drop') drops += parseFloat(tx.amount);
            if (tx.type === 'payout') payouts += parseFloat(tx.amount);
        }

        // Subtract cash expenses issued during this shift
        let cashExpenses = 0;
        const shiftExpenses = await db.Expense.findAll({
            where: {
                user_id,
                branch_id: shift.branch_id,
                created_at: {
                    [db.Sequelize.Op.gte]: shift.opening_time,
                    [db.Sequelize.Op.lte]: new Date()
                }
            },
            include: [{ model: db.ExpensePaymentMethod, as: 'payments' }],
            transaction: t
        });

        for (const exp of shiftExpenses) {
            if (exp.payments && exp.payments.length > 0) {
                cashExpenses += exp.payments
                    .filter(p => p.payment_method && p.payment_method.toLowerCase() === 'cash')
                    .reduce((sum, p) => sum + parseFloat(p.amount), 0);
            } else if (exp.payment_method && exp.payment_method.toLowerCase() === 'cash') {
                cashExpenses += parseFloat(exp.amount || 0);
            }
        }

        const expected_cash = parseFloat(shift.opening_cash) + cashSales - cashRefunds + payIns - drops - payouts - cashExpenses;
        const variance = parseFloat(closing_cash) - expected_cash;

        shift.closing_cash = closing_cash;
        shift.expected_cash = expected_cash;
        shift.variance = variance;
        shift.closing_time = new Date();
        shift.status = 'closed';

        await shift.save({ transaction: t });
        
        // Audit Log: Shift Closed
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.log({
            organizationId: req.user.organization_id,
            userId: user_id,
            action: 'SHIFT_CLOSE',
            entityType: 'Shift',
            entityId: shift.id,
            description: `Shift closed. Expected: ${expected_cash}, Actual: ${closing_cash}, Variance: ${variance}`,
            newValues: { closing_cash, expected_cash, variance },
            ipAddress,
            userAgent
        });

        await t.commit();

        return successResponse(res, shift, 'Shift closed successfully');
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

module.exports = {
    openShift,
    getActiveShift,
    addTransaction,
    closeShift
};
