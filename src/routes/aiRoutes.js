const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.post('/generate-units', checkPermission('system:settings'), aiController.generateUnits);

module.exports = router;
