const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');
const authenticate = require('../middleware/auth');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authenticate);

// Only Super Admin can manage plans
router.get('/', planController.getAllPlans);
router.post('/', roleMiddleware(['Super Admin']), planController.createPlan);
router.get('/:id', planController.getPlanById);
router.put('/:id', roleMiddleware(['Super Admin']), planController.updatePlan);
router.delete('/:id', roleMiddleware(['Super Admin']), planController.deletePlan);

module.exports = router;
