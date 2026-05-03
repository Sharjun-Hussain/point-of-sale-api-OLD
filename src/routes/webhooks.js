const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopifyService');
const logger = require('../utils/logger');

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

module.exports = router;
