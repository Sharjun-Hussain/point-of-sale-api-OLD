const { body } = require('express-validator');

const updateOrganizationValidationRules = [
    body('name')
        .optional()
        .trim()
        .notEmpty().withMessage('Building name cannot be explicitly empty')
        .isLength({ min: 2 }).withMessage('Legal name basis must be at least 2 characters'),
    
    body('email')
        .optional()
        .trim()
        .isEmail().withMessage('Institutional email format failure')
        .normalizeEmail(),

    body('phone')
        .optional()
        .trim()
        .matches(/^[\d+() -]+$/).withMessage('Contact basis contains invalid structural characters'),

    body('website')
        .optional({ checkFalsy: true })
        .trim()
        .isURL().withMessage('Digital portal URL format failure'),

    body('tax_id')
        .optional()
        .trim(),

    body('business_type')
        .optional()
        .trim()
        .toLowerCase(),

    body('address')
        .optional()
        .trim(),

    body('city')
        .optional()
        .trim(),

    body('state')
        .optional()
        .trim(),

    body('zip_code')
        .optional()
        .trim()
];

module.exports = {
    updateOrganizationValidationRules
};
