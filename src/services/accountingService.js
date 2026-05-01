const db = require('../models');
const { Transaction, Account } = db;

/**
 * Accounting Service
 * Handles all financial transactions and ensures account balances are updated correctly 
 * according to standard double-entry accounting rules.
 */
class AccountingService {
    /**
     * Record a financial transaction and update account balance
     * 
     * Accounting Rules for Balance Updates:
     * - Assets: Debit (+), Credit (-)
     * - Liabilities: Credit (+), Debit (-)
     * - Equity: Credit (+), Debit (-)
     * - Revenue: Credit (+), Debit (-)
     * - Expense: Debit (+), Credit (-)
     */
    async recordTransaction(data, transaction = null) {
        const {
            organization_id,
            branch_id,
            account_id,
            amount,
            type, // 'debit' or 'credit'
            reference_type,
            reference_id,
            customer_id,
            supplier_id,
            transaction_date,
            description
        } = data;

        // Validate amount is positive
        if (!amount || amount <= 0) {
            throw new Error(`Transaction amount must be a positive number. Received: ${amount}`);
        }

        // 1. Find the account to check its type
        const account = await Account.findByPk(account_id, { transaction });
        if (!account) {
            throw new Error(`Account with ID ${account_id} not found`);
        }

        // 2. Create the transaction record
        const record = await Transaction.create({
            organization_id,
            branch_id,
            account_id,
            amount,
            type,
            reference_type,
            reference_id,
            customer_id: customer_id || null,
            supplier_id: supplier_id || null,
            transaction_date: transaction_date || new Date(),
            description
        }, { transaction });

        // 3. Update account balance based on rules
        const isIncrease = (
            (['asset', 'expense'].includes(account.type) && type === 'debit') ||
            (['liability', 'equity', 'revenue'].includes(account.type) && type === 'credit')
        );

        if (isIncrease) {
            await account.increment('balance', { by: amount, transaction });
        } else {
            await account.decrement('balance', { by: amount, transaction });
        }

        return record;
    }

    /**
     * Create a double-entry journal entry
     * Ensure total debits equal total credits
     */
    async createDoubleEntry(organization_id, branch_id, entries, metadata, transaction = null) {
        const { date, description, reference_type, reference_id, customer_id, supplier_id } = metadata;

        let totalDebit = 0;
        let totalCredit = 0;

        for (const entry of entries) {
            const amount = parseFloat(entry.amount);
            if (entry.type === 'debit') totalDebit += amount;
            else if (entry.type === 'credit') totalCredit += amount;
        }

        // Use a small epsilon for float comparison
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            throw new Error(`Transaction does not balance. Total Debit: ${totalDebit.toFixed(2)}, Total Credit: ${totalCredit.toFixed(2)}`);
        }

        const results = [];
        for (const entry of entries) {
            const result = await this.recordTransaction({
                organization_id,
                branch_id,
                account_id: entry.account_id,
                amount: entry.amount,
                type: entry.type,
                reference_type,
                reference_id,
                customer_id,
                supplier_id,
                transaction_date: date,
                description: entry.description || description
            }, transaction);
            results.push(result);
        }

        return results;
    }
 
    /**
     * Get current AR balance for a customer
     */
    async getCustomerBalance(organization_id, customer_id, transaction = null) {
        const arAccount = await Account.findOne({
            where: { organization_id, code: '1100' },
            transaction
        });
        if (!arAccount) return 0;
 
        const totals = await Transaction.findAll({
            attributes: [
                'type',
                [db.Sequelize.fn('SUM', db.Sequelize.col('amount')), 'total']
            ],
            where: { organization_id, customer_id, account_id: arAccount.id },
            group: ['type'],
            transaction
        });
 
        let balance = 0;
        totals.forEach(t => {
            const amount = parseFloat(t.get('total') || 0);
            if (t.type === 'debit') balance += amount;
            else balance -= amount;
        });
 
        // Add opening balance from customer record
        const customer = await db.Customer.findByPk(customer_id, { transaction });
        if (customer) {
            balance += parseFloat(customer.opening_balance || 0);
        }
 
        return balance;
    }
}

module.exports = new AccountingService();
