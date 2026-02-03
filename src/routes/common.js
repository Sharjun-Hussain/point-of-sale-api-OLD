const express = require('express');
const router = express.Router();
const commonController = require('../controllers/commonController');
const authenticate = require('../middleware/auth');

router.use(authenticate);

router.get('/measurement-units', commonController.getMeasurementUnits);
router.get('/containers', commonController.getContainers);
router.get('/bulk-options', commonController.getBulkOptions);

module.exports = router;
