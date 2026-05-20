const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopifyService');
const logger = require('../utils/logger');
const { Setting, Organization, User, Product, ProductVariant, Customer } = require('../models');
const { Op } = require('sequelize');
const saleController = require('../controllers/saleController');

// Webhooks are usually unauthenticated but verified using HMAC
router.post('/shopify', async (req, res) => {
    try {
        const topic = req.headers['x-shopify-topic'];
        const shop = req.headers['x-shopify-shop-domain'];
        
        logger.info(`Shopify Webhook Received: ${topic} from ${shop}`);

        // TODO: Verify HMAC for security

        if (topic === 'orders/paid' || topic === 'orders/create') {
            // Handle order sync to POS
            const orderData = req.body;
            logger.info(`Processing Shopify Order: ${orderData.id}`);
            // sync logic here
        }

        return res.status(200).send('OK');
    } catch (error) {
        logger.error(`Webhook Processing Error: ${error.message}`);
        return res.status(500).send('Error');
    }
});

// Token verification middleware for Custom E-Commerce
const verifyCustomEcommerceToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        let token = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else {
            token = req.headers['x-custom-ecommerce-token'] || req.query.token;
        }

        if (!token) {
            return res.status(401).json({ success: false, error: 'Unauthorized: Missing token' });
        }

        // Find the custom ecommerce setting containing this inbound_token
        const settings = await Setting.findAll({ where: { category: 'custom_ecommerce' } });
        const setting = settings.find(s => {
            let data = s.settings_data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) { return false; }
            }
            return data && data.inbound_token === token;
        });

        if (!setting) {
            return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
        }

        // Find and check organization
        const organization = await Organization.findByPk(setting.organization_id);
        if (!organization || !organization.custom_ecommerce_enabled) {
            return res.status(403).json({ success: false, error: 'Forbidden: Custom e-commerce integration is not enabled for this organization' });
        }

        // Find a user from the organization to act as the e-commerce cashier
        const cashier = await User.findOne({
            where: { organization_id: organization.id },
            order: [['created_at', 'ASC']]
        });

        if (!cashier) {
            return res.status(400).json({ success: false, error: 'Failed: No user found for this organization to process the e-commerce transaction' });
        }

        // Extract settings config
        let config = setting.settings_data;
        if (typeof config === 'string') {
            try { config = JSON.parse(config); } catch (e) { config = {}; }
        }

        // Attach organization, config, and system cashier to request
        req.customEcommerce = {
            organization,
            config,
            cashier
        };

        // Populate req.user so that nested controller logic works out-of-the-box
        req.user = {
            id: cashier.id,
            organization_id: organization.id,
            branch_id: config.pos_branch_id || null
        };

        next();
    } catch (error) {
        logger.error(`Custom E-commerce Verification Error: ${error.message}`);
        return res.status(500).json({ success: false, error: 'Internal Server Error during verification' });
    }
};

// Custom E-commerce Inbound Webhook
router.post('/custom-ecommerce/order-created', verifyCustomEcommerceToken, async (req, res, next) => {
    try {
        const { order_id, customer, items, payment, notes } = req.body;

        if (!order_id) {
            return res.status(400).json({ success: false, error: 'Missing order_id' });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing items array or array is empty' });
        }

        // 1. Map items to POS variants & products
        const mappedItems = [];
        for (const item of items) {
            const sku = item.sku || item.barcode;
            if (!sku) {
                return res.status(400).json({ success: false, error: 'Each item must have a sku or barcode' });
            }

            const variant = await ProductVariant.findOne({
                where: {
                    [Op.or]: [
                        { sku: sku },
                        { barcode: sku }
                    ],
                    organization_id: req.user.organization_id
                },
                include: [{ model: Product, as: 'product' }]
            });

            if (!variant || !variant.product) {
                return res.status(400).json({ success: false, error: `Product variant not found for SKU/Barcode: ${sku}` });
            }

            mappedItems.push({
                product_id: variant.product_id,
                product_variant_id: variant.id,
                quantity: parseFloat(item.quantity || 1),
                discount_amount: parseFloat(item.discount_amount || item.discount || 0)
            });
        }

        // 2. Resolve Customer (Find or Create dynamically)
        let customerId = null;
        if (customer) {
            let dbCustomer = null;
            if (customer.phone) {
                dbCustomer = await Customer.findOne({
                    where: { phone: customer.phone, organization_id: req.user.organization_id }
                });
            }
            if (!dbCustomer && customer.email) {
                dbCustomer = await Customer.findOne({
                    where: { email: customer.email, organization_id: req.user.organization_id }
                });
            }

            if (!dbCustomer) {
                dbCustomer = await Customer.create({
                    organization_id: req.user.organization_id,
                    name: customer.name || 'E-commerce Customer',
                    phone: customer.phone || null,
                    email: customer.email || null,
                    address: customer.address || null,
                    credit_limit: 10000000 // 10 million limit to avoid credit limit restrictions on COD
                });
            } else {
                // Ensure customer has credit limit set to allow post to general ledger accounts receivable
                if (!dbCustomer.credit_limit || dbCustomer.credit_limit <= 0) {
                    await dbCustomer.update({ credit_limit: 10000000 });
                }
            }
            customerId = dbCustomer.id;
        } else {
            // General walkin fallback
            let walkinCustomer = await Customer.findOne({
                where: { phone: 'ecommerce-walkin', organization_id: req.user.organization_id }
            });
            if (!walkinCustomer) {
                walkinCustomer = await Customer.create({
                    organization_id: req.user.organization_id,
                    name: 'E-commerce Walk-in',
                    phone: 'ecommerce-walkin',
                    credit_limit: 10000000
                });
            }
            customerId = walkinCustomer.id;
        }

        // 3. Map Payments payload
        let paymentsPayload = [];
        if (payment) {
            const amountPaid = parseFloat(payment.amount_paid || payment.amount || 0);
            const rawMethod = payment.method ? payment.method.toLowerCase() : 'online';
            const paymentMethod = (rawMethod === 'cod' || rawMethod === 'cash') ? 'cash' : 'card';
            
            if (amountPaid > 0) {
                paymentsPayload.push({
                    payment_method: paymentMethod,
                    amount: amountPaid,
                    notes: `E-commerce Payment Reference: ${payment.reference || 'N/A'}`
                });
            }
        }

        // 4. Construct sale req.body payload for createSale
        const config = req.customEcommerce.config;
        req.body = {
            customer_id: customerId,
            branch_id: config.pos_branch_id || req.user.branch_id,
            items: mappedItems,
            payments: paymentsPayload,
            notes: `E-commerce Order ID: #${order_id}.${notes ? ' ' + notes : ''}`,
            source: 'ecommerce',
            status: 'completed'
        };

        // 5. Delegate to saleController.createSale
        await saleController.createSale(req, res, next);
    } catch (error) {
        logger.error(`E-commerce Webhook Order Creation Error: ${error.message}`);
        return res.status(500).json({ success: false, error: `Internal Server Error: ${error.message}` });
    }
});

module.exports = router;
