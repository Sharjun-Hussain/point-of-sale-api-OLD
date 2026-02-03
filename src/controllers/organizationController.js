const { Organization, Branch } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/responseHandler');
const { getPagination } = require('../utils/pagination');

// --- Organization ---
const getOrganization = async (req, res, next) => {
    try {
        const organization = await Organization.findByPk(req.user.organization_id, {
            include: [{ model: Branch, as: 'branches' }]
        });
        return successResponse(res, organization, 'Organization fetched');
    } catch (error) { next(error); }
};

const updateOrganization = async (req, res, next) => {
    try {
        const organization = await Organization.findByPk(req.user.organization_id);
        await organization.update(req.body);
        return successResponse(res, organization, 'Organization updated');
    } catch (error) { next(error); }
};

// --- Branches ---
const getAllBranches = async (req, res, next) => {
    try {
        const { page, size } = req.query;
        const { limit, offset } = getPagination(page, size);

        // Filter by organization of the logged in user
        const branches = await Branch.findAndCountAll({
            where: { organization_id: req.user.organization_id },
            limit,
            offset,
            order: [['name', 'ASC']]
        });

        return paginatedResponse(res, branches.rows, {
            total: branches.count,
            page: parseInt(page) || 1,
            limit
        }, 'Branches fetched successfully');
    } catch (error) { next(error); }
};

const getActiveBranchesList = async (req, res, next) => {
    try {
        const branches = await Branch.findAll({
            where: {
                organization_id: req.user.organization_id,
                is_active: true
            },
            order: [['name', 'ASC']]
        });
        return successResponse(res, branches, 'Active branches fetched');
    } catch (error) { next(error); }
};

const createBranch = async (req, res, next) => {
    try {
        const branch = await Branch.create({
            ...req.body,
            organization_id: req.user.organization_id
        });
        return successResponse(res, branch, 'Branch created successfully', 201);
    } catch (error) { next(error); }
};

const updateBranch = async (req, res, next) => {
    try {
        const branch = await Branch.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!branch) return errorResponse(res, 'Branch not found', 404);

        await branch.update(req.body);
        return successResponse(res, branch, 'Branch updated successfully');
    } catch (error) { next(error); }
};

const toggleBranchStatus = async (req, res, next) => {
    try {
        const branch = await Branch.findOne({
            where: { id: req.params.id, organization_id: req.user.organization_id }
        });
        if (!branch) return errorResponse(res, 'Branch not found', 404);

        const action = req.params.action || (branch.is_active ? 'deactivate' : 'activate');
        branch.is_active = (action === 'activate');
        await branch.save();

        return successResponse(res, branch, `Branch ${action}d successfully`);
    } catch (error) { next(error); }
};

module.exports = {
    getOrganization, updateOrganization,
    getAllBranches, getActiveBranchesList, createBranch, updateBranch, toggleBranchStatus
};
