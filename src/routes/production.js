const express = require('express');
const router = express.Router();
const productionController = require('../controllers/productionController');
const protect = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(protect);

router.post('/orders', checkPermission('production:create'), productionController.createProductionOrder);
router.post('/orders/:id/complete', checkPermission('production:manage'), productionController.completeProductionOrder);
router.get('/orders', checkPermission('production:view'), productionController.getProductionOrders);

module.exports = router;
