const express = require('express');
const router = express.Router();
const recipeController = require('../controllers/recipeController');
const protect = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All recipe routes are protected and require specific permissions
router.use(protect);

router.post('/', checkPermission('production:create'), recipeController.createRecipe);
router.get('/', checkPermission('production:view'), recipeController.getRecipes);
router.get('/:id', checkPermission('production:view'), recipeController.getRecipeById);
router.patch('/:id', checkPermission('production:edit'), recipeController.updateRecipe);
router.delete('/:id', checkPermission('production:delete'), recipeController.deleteRecipe);

module.exports = router;
