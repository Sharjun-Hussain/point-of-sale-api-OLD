const express = require('express');
const router = express.Router();
const textLkController = require('../controllers/textLkController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');


router.use(auth);

router.get('/config', textLkController.getConfig);
router.post('/config', checkPermission('system:settings'), textLkController.saveConfig);
router.post('/test', checkPermission('system:settings'), textLkController.testConnection);
router.get('/stats', textLkController.getStats);
router.get('/contacts', textLkController.getContacts);
router.post('/contacts', checkPermission('crm:manage'), textLkController.createContactGroup);
router.patch('/contacts/:uid', checkPermission('crm:manage'), textLkController.updateContactGroup);
router.delete('/contacts/:uid', checkPermission('crm:manage'), textLkController.deleteContactGroup);
router.post('/sync', checkPermission('crm:manage'), textLkController.syncCustomers);
router.post('/send', textLkController.sendSms);

// Templates
router.get('/templates', textLkController.getTemplates);
router.post('/templates', checkPermission('crm:manage'), textLkController.createTemplate);
router.delete('/templates/:id', checkPermission('crm:manage'), textLkController.deleteTemplate);

// Campaigns
router.get('/campaigns', textLkController.getCampaigns);
router.post('/campaigns', checkPermission('crm:manage'), textLkController.createCampaign);

module.exports = router;
