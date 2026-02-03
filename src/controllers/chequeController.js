const { Cheque, Transaction, Account, Branch, Organization, User, Sale, GRN, Expense } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');
const db = require('../models');

/**
 * Get All Cheques
 */
const getAllCheques = async (req, res, next) => {
    try {
        const { page, size, type, status, from_date, to_date, branch_id } = req.query;
        const { limit, offset } = getPagination(page, size);

        const where = { organization_id: req.user.organization_id };
        if (type) where.type = type;
        if (status) where.status = status;
        if (branch_id) where.branch_id = branch_id;
        if (from_date && to_date) {
            where.cheque_date = { [Op.between]: [from_date, to_date] };
        }

        const cheques = await Cheque.findAndCountAll({
            where,
            limit,
            offset,
            include: [
                { model: Branch, as: 'branch', attributes: ['name'] },
                { model: Account, as: 'account', attributes: ['name'] }
            ],
            order: [['cheque_date', 'ASC']]
        });

        return paginatedResponse(res, cheques.rows, {
            total: cheques.count,
            page: parseInt(page) || 1,
            limit
        }, 'Cheques fetched successfully');
    } catch (error) { next(error); }
};

/**
 * Get Cheque By ID
 */
const getChequeById = async (req, res, next) => {
    try {
        const cheque = await Cheque.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id },
            include: [
                { model: Branch, as: 'branch' },
                { model: Account, as: 'account' }
            ]
        });
        if (!cheque) return errorResponse(res, 'Cheque not found', 404);
        return successResponse(res, cheque, 'Cheque fetched successfully');
    } catch (error) { next(error); }
};

/**
 * Create Cheque Manually
 */
const createCheque = async (req, res, next) => {
    try {
        const { organization_id } = req.user;
        const cheque = await Cheque.create({
            ...req.body,
            organization_id,
            branch_id: req.body.branch_id || req.user.branch_id
        });
        return successResponse(res, cheque, 'Cheque recorded successfully', 201);
    } catch (error) { next(error); }
};

/**
 * Update Cheque Status
 * Handles financial transaction creation when cleared
 */
const updateChequeStatus = async (req, res, next) => {
    const t = await db.sequelize.transaction();
    try {
        const { id } = req.params;
        const { status, account_id, cleared_date, note } = req.body;

        const cheque = await Cheque.findOne({
            where: { id, organization_id: req.user.organization_id },
            transaction: t
        });

        if (!cheque) {
            await t.rollback();
            return errorResponse(res, 'Cheque not found', 404);
        }

        if (cheque.status === 'cleared' || cheque.status === 'cancelled') {
            await t.rollback();
            return errorResponse(res, `Cannot update status from ${cheque.status}`, 400);
        }

        await cheque.update({
            status,
            account_id: account_id || cheque.account_id,
            cleared_date: cleared_date || cheque.cleared_date,
            note: note || cheque.note
        }, { transaction: t });

        // Financial Transaction logic if cleared
        if (status === 'cleared') {
            const finalAccountId = account_id || cheque.account_id;
            if (!finalAccountId) {
                await t.rollback();
                return errorResponse(res, 'Account ID is required for clearing a cheque', 400);
            }

            const bankAccount = await Account.findByPk(finalAccountId, { transaction: t });
            if (!bankAccount) {
                await t.rollback();
                return errorResponse(res, 'Bank Account not found', 404);
            }

            // Determine the offset account based on cheque type
            const offsetAccountCode = cheque.type === 'receivable' ? '1050' : '2110'; // Cheques in Hand or Cheques Payable
            const offsetAccountName = cheque.type === 'receivable' ? 'Cheques in Hand' : 'Cheques Payable';
            const offsetAccountType = cheque.type === 'receivable' ? 'asset' : 'liability';

            const [offsetAccount] = await Account.findOrCreate({
                where: { organization_id: cheque.organization_id, code: offsetAccountCode },
                defaults: { name: offsetAccountName, type: offsetAccountType },
                transaction: t
            });

            // 1. Transaction: Bank Side
            await Transaction.create({
                organization_id: cheque.organization_id,
                branch_id: cheque.branch_id,
                account_id: bankAccount.id,
                amount: cheque.amount,
                type: cheque.type === 'receivable' ? 'debit' : 'credit',
                transaction_date: cleared_date || new Date(),
                reference_type: 'Cheque',
                reference_id: cheque.id,
                description: `Cheque ${cheque.cheque_number} cleared - ${cheque.bank_name}`
            }, { transaction: t });

            // 2. Transaction: Offset Side (Cheques in Hand / Cheques Payable)
            await Transaction.create({
                organization_id: cheque.organization_id,
                branch_id: cheque.branch_id,
                account_id: offsetAccount.id,
                amount: cheque.amount,
                type: cheque.type === 'receivable' ? 'credit' : 'debit',
                transaction_date: cleared_date || new Date(),
                reference_type: 'Cheque',
                reference_id: cheque.id,
                description: `Cheque ${cheque.cheque_number} cleared - ${cheque.bank_name}`
            }, { transaction: t });

            // Update balances
            if (cheque.type === 'receivable') {
                await bankAccount.increment('balance', { by: cheque.amount, transaction: t });
                await offsetAccount.decrement('balance', { by: cheque.amount, transaction: t });
            } else {
                await bankAccount.decrement('balance', { by: cheque.amount, transaction: t });
                await offsetAccount.decrement('balance', { by: cheque.amount, transaction: t });
            }
        }

        await t.commit();
        return successResponse(res, cheque, `Cheque marked as ${status}`);
    } catch (error) {
        await t.rollback();
        next(error);
    }
};

/**
 * Delete Cheque
 */
const deleteCheque = async (req, res, next) => {
    try {
        const cheque = await Cheque.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!cheque) return errorResponse(res, 'Cheque not found', 404);

        if (cheque.status === 'cleared') {
            return errorResponse(res, 'Cannot delete a cleared cheque', 400);
        }

        await cheque.destroy();
        return successResponse(res, null, 'Cheque deleted successfully');
    } catch (error) { next(error); }
};

module.exports = {
    getAllCheques,
    getChequeById,
    createCheque,
    updateChequeStatus,
    deleteCheque
};
