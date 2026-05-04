const { Recipe, RecipeItem, Product, ProductVariant, Unit, sequelize } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');

/**
 * Recipe Controller
 * Handles Bill of Materials (BOM) management
 */

// --- Recipe CRUD ---

const createRecipe = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const {
            product_id,
            product_variant_id,
            name,
            description,
            batch_size,
            instructions,
            items // Array of { raw_material_id, raw_material_variant_id, quantity, unit_id, waste_percentage }
        } = req.body;

        // 1. Create Recipe Header
        const recipe = await Recipe.create({
            product_id,
            product_variant_id,
            name,
            description,
            batch_size,
            instructions,
            organization_id: req.user.organization_id,
            total_cost: 0 // Will update after items
        }, { transaction });

        let totalCost = 0;

        // 2. Create Recipe Items
        if (items && items.length > 0) {
            const recipeItems = [];
            for (const item of items) {
                // Fetch cost from variant
                const variant = await ProductVariant.findByPk(item.raw_material_variant_id);
                const costPrice = variant ? parseFloat(variant.cost_price || 0) : 0;
                const itemTotalCost = costPrice * parseFloat(item.quantity);
                
                totalCost += itemTotalCost;

                recipeItems.push({
                    recipe_id: recipe.id,
                    raw_material_id: item.raw_material_id,
                    raw_material_variant_id: item.raw_material_variant_id,
                    quantity: item.quantity,
                    unit_id: item.unit_id,
                    waste_percentage: item.waste_percentage || 0,
                    cost_at_creation: costPrice
                });
            }
            await RecipeItem.bulkCreate(recipeItems, { transaction });
        }

        // 3. Update Recipe Total Cost
        await recipe.update({ total_cost: totalCost }, { transaction });

        await transaction.commit();

        // Fetch full recipe for response
        const fullRecipe = await Recipe.findByPk(recipe.id, {
            include: [
                { model: RecipeItem, as: 'items', include: [{ model: Product, as: 'raw_material' }] },
                { model: Product, as: 'product' }
            ]
        });

        return successResponse(res, fullRecipe, 'Recipe created successfully', 201);
    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};

const getRecipes = async (req, res, next) => {
    try {
        const { page, size, search, product_id } = req.query;
        const { limit, offset } = getPagination(page, size);

        const whereClause = { organization_id: req.user.organization_id };
        if (product_id) whereClause.product_id = product_id;
        if (search) {
            const { Op } = require('sequelize');
            whereClause.name = { [Op.like]: `%${search}%` };
        }

        const recipes = await Recipe.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            include: [
                { model: Product, as: 'product', attributes: ['name', 'code'] },
                { model: ProductVariant, as: 'variant', attributes: ['name', 'code'] }
            ],
            order: [['created_at', 'DESC']]
        });

        return paginatedResponse(res, recipes.rows, {
            total: recipes.count,
            page: parseInt(page) || 1,
            limit
        }, 'Recipes fetched successfully');
    } catch (error) { next(error); }
};

const getRecipeById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const recipe = await Recipe.findOne({
            where: { id, organization_id: req.user.organization_id },
            include: [
                { 
                    model: RecipeItem, 
                    as: 'items', 
                    include: [
                        { model: Product, as: 'raw_material' },
                        { model: ProductVariant, as: 'raw_material_variant' },
                        { model: Unit, as: 'unit' }
                    ] 
                },
                { model: Product, as: 'product' },
                { model: ProductVariant, as: 'variant' }
            ]
        });

        if (!recipe) return errorResponse(res, 'Recipe not found', 404);
        return successResponse(res, recipe, 'Recipe details fetched');
    } catch (error) { next(error); }
};

const updateRecipe = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const {
            name,
            description,
            batch_size,
            instructions,
            items,
            is_active
        } = req.body;

        const recipe = await Recipe.findOne({
            where: { id, organization_id: req.user.organization_id }
        });

        if (!recipe) return errorResponse(res, 'Recipe not found', 404);

        await recipe.update({
            name,
            description,
            batch_size,
            instructions,
            is_active
        }, { transaction });

        if (items) {
            // Rebuild items (Simple approach: delete and recreate)
            await RecipeItem.destroy({ where: { recipe_id: id }, transaction });
            
            let totalCost = 0;
            const recipeItems = [];
            for (const item of items) {
                const variant = await ProductVariant.findByPk(item.raw_material_variant_id);
                const costPrice = variant ? parseFloat(variant.cost_price || 0) : 0;
                totalCost += costPrice * parseFloat(item.quantity);

                recipeItems.push({
                    recipe_id: recipe.id,
                    raw_material_id: item.raw_material_id,
                    raw_material_variant_id: item.raw_material_variant_id,
                    quantity: item.quantity,
                    unit_id: item.unit_id,
                    waste_percentage: item.waste_percentage || 0,
                    cost_at_creation: costPrice
                });
            }
            await RecipeItem.bulkCreate(recipeItems, { transaction });
            await recipe.update({ total_cost: totalCost }, { transaction });
        }

        await transaction.commit();
        return successResponse(res, recipe, 'Recipe updated successfully');
    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};

const deleteRecipe = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await Recipe.destroy({
            where: { id, organization_id: req.user.organization_id }
        });

        if (!result) return errorResponse(res, 'Recipe not found', 404);
        return successResponse(res, null, 'Recipe deleted successfully');
    } catch (error) { next(error); }
};

module.exports = {
    createRecipe,
    getRecipes,
    getRecipeById,
    updateRecipe,
    deleteRecipe
};
