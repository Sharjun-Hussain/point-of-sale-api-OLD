const express = require('express');
const router = express.Router();
const attributeController = require('../controllers/attributeController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('attr:view'), attributeController.getAllAttributes);
router.post('/', checkPermission('attr:create'), attributeController.createAttribute);
router.put('/:id', checkPermission('attr:edit'), attributeController.updateAttribute);
router.delete('/:id', checkPermission('attr:delete'), attributeController.deleteAttribute);

module.exports = router;
