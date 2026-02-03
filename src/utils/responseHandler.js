/**
 * Standardized API Response Handler
 */

/**
 * Send success response
 */
const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
    const response = {
        status: 'success',
        message
    };

    if (data !== null) {
        response.data = data;
    }

    return res.status(statusCode).json(response);
};

/**
 * Send error response
 */
const errorResponse = (res, message = 'Error', statusCode = 500, errors = null) => {
    const response = {
        status: 'error',
        message
    };

    if (errors) {
        response.errors = errors;
    }

    return res.status(statusCode).json(response);
};

/**
 * Send paginated response
 */
const paginatedResponse = (res, data, pagination, message = 'Success') => {
    return res.status(200).json({
        status: 'success',
        message,
        data: {
            data,
            pagination: {
                page: pagination.page,
                limit: pagination.limit,
                total: pagination.total,
                pages: Math.ceil(pagination.total / pagination.limit)
            }
        }
    });
};

module.exports = {
    successResponse,
    errorResponse,
    paginatedResponse
};
