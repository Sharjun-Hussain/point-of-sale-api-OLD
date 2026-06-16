const express = require('express');
const router = express.Router();
const draftController = require('../controllers/draftController');
const authenticate = require('../middleware/auth');

router.use(authenticate);

router.post('/', draftController.saveDraft);
router.get('/', draftController.getDrafts);
router.delete('/:id', draftController.deleteDraft);

module.exports = router;
