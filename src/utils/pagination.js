/**
 * Pagination Helper
 * Calculates offset and limit for database queries
 */

const getPagination = (page, size) => {
    const limit = size ? +size : parseInt(process.env.DEFAULT_PAGE_SIZE) || 20;
    const offset = page ? (page - 1) * limit : 0;

    return { limit, offset };
};

const getPaginationData = (data, page, limit) => {
    const { count: total, rows } = data;
    const currentPage = page ? +page : 1;

    return {
        data: rows,
        pagination: {
            total,
            page: currentPage,
            limit,
            pages: Math.ceil(total / limit)
        }
    };
};

module.exports = {
    getPagination,
    getPaginationData
};
