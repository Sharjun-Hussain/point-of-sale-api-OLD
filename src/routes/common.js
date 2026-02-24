const express = require('express');
const router = express.Router();
const commonController = require('../controllers/commonController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/measurement-units', checkPermission('unit:view'), commonController.getMeasurementUnits);
router.get('/containers', checkPermission('unit:view'), commonController.getContainers);
router.get('/bulk-options', checkPermission('product:view'), commonController.getBulkOptions);

module.exports = router;
