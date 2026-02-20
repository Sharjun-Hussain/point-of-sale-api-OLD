const { validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');

/**
 * Middleware to handle express-validator errors
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return next();
    }

    const extractedErrors = [];
    errors.array().map(err => extractedErrors.push({ [err.path]: err.msg }));

    return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: extractedErrors
    });
};

module.exports = validate;
