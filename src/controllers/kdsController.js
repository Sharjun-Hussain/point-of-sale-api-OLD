const { Sale, SaleItem, Product, DiningTable } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { Op } = require('sequelize');

// Fetch all active cooking tickets in the kitchen
const getActiveTickets = async (req, res, next) => {
    try {
        const branch_id = req.query.branch_id || req.headers['x-branch-id'] || req.user.branch_id;
        const organization_id = req.user.organization_id;

        const whereClause = {
            organization_id,
            status: {
                [Op.in]: ['draft', 'active', 'completed']
            },
            kot_status: {
                [Op.in]: ['pending', 'sent_to_kitchen', 'preparing', 'ready']
            }
        };

        if (branch_id) {
            whereClause.branch_id = branch_id;
        }

        const tickets = await Sale.findAll({
            where: whereClause,
            include: [
                {
                    model: SaleItem,
                    as: 'items',
                    include: [
                        { model: Product, as: 'product', attributes: ['name', 'code'] }
                    ]
                },
                {
                    model: DiningTable,
                    as: 'table',
                    attributes: ['table_number', 'capacity']
                }
            ],
            order: [['created_at', 'ASC']] // FIFO queuing
        });

        return successResponse(res, tickets, 'Active kitchen tickets fetched successfully');
    } catch (error) {
        next(error);
    }
};

// Update cooking status of a specific single item on a ticket
const updateItemCookingStatus = async (req, res, next) => {
    try {
        const { itemId } = req.params;
        const { status } = req.body; // pending, preparing, ready, served

        if (!status) return errorResponse(res, 'Cooking status is required', 400);

        const item = await SaleItem.findOne({
            where: { id: itemId, organization_id: req.user.organization_id },
            include: [{ model: Sale, as: 'sale' }]
        });

        if (!item) return errorResponse(res, 'Order item not found', 404);

        await item.update({ cooking_status: status });

        // Auto-Escalation Check: 
        // If all items of the linked ticket are marked 'ready', promote the entire KOT ticket's status to 'ready'
        const siblingItems = await SaleItem.findAll({
            where: { sale_id: item.sale_id }
        });

        const allReady = siblingItems.every(sib => sib.cooking_status === 'ready' || sib.cooking_status === 'served');
        if (allReady && item.sale.kot_status === 'preparing') {
            await item.sale.update({ kot_status: 'ready' });
        }

        return successResponse(res, item, 'Item cooking status updated successfully');
    } catch (error) {
        next(error);
    }
};

// Update KOT status of an entire ticket
const updateTicketKOTStatus = async (req, res, next) => {
    try {
        const { ticketId } = req.params;
        const { status } = req.body; // pending, sent_to_kitchen, preparing, ready, served

        if (!status) return errorResponse(res, 'KOT ticket status is required', 400);

        const sale = await Sale.findOne({
            where: { id: ticketId, organization_id: req.user.organization_id }
        });

        if (!sale) return errorResponse(res, 'Kitchen ticket not found', 404);

        await sale.update({ kot_status: status });

        // Cascade updates to all items inside this ticket
        if (status === 'preparing') {
            await SaleItem.update(
                { cooking_status: 'preparing' },
                { where: { sale_id: sale.id, cooking_status: 'pending' } }
            );
        } else if (status === 'ready') {
            await SaleItem.update(
                { cooking_status: 'ready' },
                { where: { sale_id: sale.id, cooking_status: { [Op.in]: ['pending', 'preparing'] } } }
            );
        } else if (status === 'served') {
            await SaleItem.update(
                { cooking_status: 'served' },
                { where: { sale_id: sale.id } }
            );
        }

        return successResponse(res, sale, 'Kitchen ticket KOT status updated successfully');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getActiveTickets,
    updateItemCookingStatus,
    updateTicketKOTStatus
};
