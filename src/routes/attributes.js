const express = require('express');
const router = express.Router();
const attributeController = require('../controllers/attributeController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Product View'), attributeController.getAllAttributes);
router.post('/', checkPermission('Product Create'), attributeController.createAttribute);
router.put('/:id', checkPermission('Product Edit'), attributeController.updateAttribute);
router.delete('/:id', checkPermission('Product Edit'), attributeController.deleteAttribute);

module.exports = router;
