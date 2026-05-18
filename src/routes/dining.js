const express = require('express');
const router = express.Router();
const diningController = require('../controllers/diningController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

// Dining Areas
router.get('/areas', checkPermission('sale:view'), diningController.getAllDiningAreas);
router.post('/areas', checkPermission('sale:create'), diningController.createDiningArea);
router.put('/areas/:id', checkPermission('sale:create'), diningController.updateDiningArea);
router.delete('/areas/:id', checkPermission('sale:delete'), diningController.deleteDiningArea);

// Dining Tables
router.get('/tables', checkPermission('sale:view'), diningController.getAllDiningTables);
router.post('/tables', checkPermission('sale:create'), diningController.createDiningTable);
router.put('/tables/:id', checkPermission('sale:create'), diningController.updateDiningTable);
router.delete('/tables/:id', checkPermission('sale:delete'), diningController.deleteDiningTable);
router.get('/tables/:id/details', checkPermission('sale:view'), diningController.getTableDetailsWithSale);

module.exports = router;
