/**
 * Global Error Handler Middleware
 * Catches all errors and sends standardized error responses
 */

const errorHandler = (err, req, res, next) => {
    // Log error for debugging
    console.error('Error:', err);

    // Default error status and message
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let errors = err.errors || null;

    // Handle Sequelize validation errors
    if (err.name === 'SequelizeValidationError') {
        statusCode = 400;
        message = 'Validation Error';
        errors = err.errors.map(e => ({
            field: e.path,
            message: e.message
        }));
    }

    // Handle Sequelize unique constraint errors
    if (err.name === 'SequelizeUniqueConstraintError') {
        statusCode = 409;
        message = 'Duplicate Entry';
        errors = err.errors.map(e => ({
            field: e.path,
            message: `${e.path} already exists`
        }));
    }

    // Handle Sequelize foreign key constraint errors
    if (err.name === 'SequelizeForeignKeyConstraintError') {
        statusCode = 400;
        message = 'Invalid reference';
    }

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
    }

    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired';
    }

    // Handle Multer errors (file upload)
    if (err.name === 'MulterError') {
        statusCode = 400;
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = 'File size too large';
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            message = 'Too many files';
        } else {
            message = err.message;
        }
    }

    // Send error response
    res.status(statusCode).json({
        status: 'error',
        message,
        ...(errors && { errors }),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
