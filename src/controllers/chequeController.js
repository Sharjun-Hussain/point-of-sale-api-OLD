const { Cheque, Transaction, Account, Branch, Organization, User, Sale, GRN, Expense } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');
const { Op } = require('sequelize');
const db = require('../models');
const accountingService = require('../services/accountingService');

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

        // Financial Transaction logic
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

            if (cheque.type === 'receivable') {
                // Customer Cheque Cleared: Bank (Debit +), Cheques In Hand (Credit -)
                await accountingService.recordTransaction({
                    organization_id: cheque.organization_id,
                    branch_id: cheque.branch_id,
                    account_id: bankAccount.id,
                    amount: cheque.amount,
                    type: 'debit',
                    reference_type: 'Cheque',
                    reference_id: cheque.id,
                    transaction_date: cleared_date || new Date(),
                    description: `Cheque Cleared: ${cheque.cheque_number} (${cheque.bank_name})`
                }, t);

                await accountingService.recordTransaction({
                    organization_id: cheque.organization_id,
                    branch_id: cheque.branch_id,
                    account_id: offsetAccount.id,
                    amount: cheque.amount,
                    type: 'credit',
                    reference_type: 'Cheque',
                    reference_id: cheque.id,
                    transaction_date: cleared_date || new Date(),
                    description: `Cheque Cleared: ${cheque.cheque_number}`
                }, t);

            } else {
                // Payable Cheque Cleared: Cheques Payable (Debit -), Bank (Credit -)
                await accountingService.recordTransaction({
                    organization_id: cheque.organization_id,
                    branch_id: cheque.branch_id,
                    account_id: offsetAccount.id,
                    amount: cheque.amount,
                    type: 'debit', // Reduce Liability
                    reference_type: 'Cheque',
                    reference_id: cheque.id,
                    transaction_date: cleared_date || new Date(),
                    description: `Cheque Cleared: ${cheque.cheque_number} (${cheque.bank_name})`
                }, t);

                await accountingService.recordTransaction({
                    organization_id: cheque.organization_id,
                    branch_id: cheque.branch_id,
                    account_id: bankAccount.id,
                    amount: cheque.amount,
                    type: 'credit', // Reduce Asset
                    reference_type: 'Cheque',
                    reference_id: cheque.id,
                    transaction_date: cleared_date || new Date(),
                    description: `Cheque Cleared: ${cheque.cheque_number}`
                }, t);
            }

        } else if (status === 'bounced') {
            // HANDLE BOUNCE: Reverse the payment
            // We need to look up the original transaction to find the customer/supplier
            // But we can infer accounts: AR/AP vs Cheques In Hand/Payable

            // Finds the Cheque Holding Account (Cheques in Hand / Cheques Payable)
            const offsetAccountCode = cheque.type === 'receivable' ? '1050' : '2110';
            const offsetAccountName = cheque.type === 'receivable' ? 'Cheques in Hand' : 'Cheques Payable';
            const offsetAccountType = cheque.type === 'receivable' ? 'asset' : 'liability';

            const [offsetAccount] = await Account.findOrCreate({
                where: { organization_id: cheque.organization_id, code: offsetAccountCode },
                defaults: { name: offsetAccountName, type: offsetAccountType },
                transaction: t
            });

            // Find the Counterparty Account (AR or AP)
            // Need customer/supplier ID from the original linked transaction usually
            let customer_id = null;
            let supplier_id = null;

            if (cheque.reference_id) {
                const linkedTx = await Transaction.findByPk(cheque.reference_id, { transaction: t });
                if (linkedTx) {
                    customer_id = linkedTx.customer_id;
                    supplier_id = linkedTx.supplier_id;
                }
            }

            if (cheque.type === 'receivable') {
                // Bounced Customer Cheque: 
                // Restore Debt: Debit AR
                // Remove Cheque: Credit Cheques in Hand

                const [arAccount] = await Account.findOrCreate({
                    where: { organization_id: cheque.organization_id, code: '1100' },
                    defaults: { name: 'Accounts Receivable', type: 'asset' },
                    transaction: t
                });

                await accountingService.recordTransaction({
                    organization_id: cheque.organization_id,
                    branch_id: cheque.branch_id,
                    account_id: arAccount.id,
                    customer_id,
                    amount: cheque.amount,
                    type: 'debit', // Increase Asset (Owes us again)
                    reference_type: 'Cheque',
                    reference_id: cheque.id,
                    transaction_date: new Date(),
                    description: `Cheque Bounced: ${cheque.cheque_number} - Payment Reversed`
                }, t);

                await accountingService.recordTransaction({
                    organization_id: cheque.organization_id,
                    branch_id: cheque.branch_id,
                    account_id: offsetAccount.id,
                    amount: cheque.amount,
                    type: 'credit', // Decrease Asset (Cheque is bad)
                    reference_type: 'Cheque',
                    reference_id: cheque.id,
                    transaction_date: new Date(),
                    description: `Cheque Bounced: ${cheque.cheque_number}`
                }, t);

            } else {
                // Bounced Supplier Cheque (We bounced it?):
                // Restore Liability: Credit AP
                // Remove Cheque: Debit Cheques Payable

                const [apAccount] = await Account.findOrCreate({
                    where: { organization_id: cheque.organization_id, code: '2100' },
                    defaults: { name: 'Accounts Payable', type: 'liability' },
                    transaction: t
                });

                await accountingService.recordTransaction({
                    organization_id: cheque.organization_id,
                    branch_id: cheque.branch_id,
                    account_id: offsetAccount.id, // Cheques Payable
                    amount: cheque.amount,
                    type: 'debit', // Reduce Liability (Remove the payable cheque)
                    reference_type: 'Cheque',
                    reference_id: cheque.id,
                    transaction_date: new Date(),
                    description: `Cheque Bounced: ${cheque.cheque_number}`
                }, t);

                await accountingService.recordTransaction({
                    organization_id: cheque.organization_id,
                    branch_id: cheque.branch_id,
                    account_id: apAccount.id,
                    supplier_id,
                    amount: cheque.amount,
                    type: 'credit', // Increase Liability (We owe supplier again)
                    reference_type: 'Cheque',
                    reference_id: cheque.id,
                    transaction_date: new Date(),
                    description: `Cheque Bounced: ${cheque.cheque_number} - Payment Reversed`
                }, t);
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
