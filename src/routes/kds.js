const express = require('express');
const router = express.Router();
const kdsController = require('../controllers/kdsController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/tickets', checkPermission('sale:view'), kdsController.getActiveTickets);
router.put('/items/:itemId/cooking-status', checkPermission('sale:create'), kdsController.updateItemCookingStatus);
router.put('/tickets/:ticketId/kot-status', checkPermission('sale:create'), kdsController.updateTicketKOTStatus);

module.exports = router;
