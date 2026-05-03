const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/settings', checkPermission('crm:view'), whatsappController.getSettings);
router.post('/settings', checkPermission('crm:manage'), whatsappController.updateSettings);
router.get('/templates', checkPermission('crm:view'), whatsappController.getTemplates);
router.post('/send-po', checkPermission('crm:manage'), whatsappController.sendPurchaseOrder);

module.exports = router;
