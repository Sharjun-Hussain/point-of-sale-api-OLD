const db = require('../models');
const { Shift, ShiftTransaction, User, Branch } = db;
const { successResponse, errorResponse } = require('../utils/responseHandler');
const auditService = require('../services/auditService');

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

        if (!targetBranchId) {
            return errorResponse(res, 'A branch must be selected to open a shift.', 400);
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
        for (const sale of sales) {
            if (sale.payments && sale.payments.length > 0) {
                const cashLine = sale.payments.filter(p => p.payment_method.toLowerCase() === 'cash');
                cashSales += cashLine.reduce((sum, p) => sum + parseFloat(p.amount), 0);
            } else if (sale.payment_method && sale.payment_method.toLowerCase() === 'cash') {
                // Fallback for legacy records created before SalePayment migration
                cashSales += parseFloat(sale.paid_amount || 0);
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

        const expected_cash = parseFloat(shift.opening_cash) + cashSales + payIns - drops - payouts;
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
