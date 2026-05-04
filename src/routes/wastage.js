const express = require('express');
const router = express.Router();
const wastageController = require('../controllers/wastageController');
const protect = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(protect);

router.get('/', checkPermission('production:view'), wastageController.getWastages);
router.post('/', checkPermission('production:manage'), wastageController.createWastage);

module.exports = router;
