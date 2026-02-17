const { Organization } = require('../models');
const { Op } = require('sequelize');

/**
 * Middleware to check subscription expiry for all organizations
 * This should be called on critical routes or run as a scheduled job
 */
const checkSubscriptionExpiry = async (req, res, next) => {
    try {
        const now = new Date();

        // Find all organizations with expired subscriptions that are still active
        const expiredOrgs = await Organization.findAll({
            where: {
                subscription_expiry_date: {
                    [Op.lt]: now
                },
                subscription_status: {
                    [Op.in]: ['Active', 'Trial']
                }
            }
        });

        // Update expired organizations
        if (expiredOrgs.length > 0) {
            await Promise.all(expiredOrgs.map(async (org) => {
                await org.update({
                    subscription_status: 'Expired',
                    is_active: false // Suspend access
                });
                console.log(`Organization ${org.name} (${org.id}) subscription expired and suspended.`);
            }));
        }

        next();
    } catch (error) {
        console.error('Error checking subscription expiry:', error);
        next(); // Continue even if check fails
    }
};

/**
 * Check if the current user's organization subscription is valid
 * Blocks access if subscription is expired
 */
const requireActiveSubscription = async (req, res, next) => {
    try {
        // Skip for Super Admins
        const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
        if (isSuperAdmin) {
            return next();
        }

        const organization = await Organization.findByPk(req.user.organization_id);

        if (!organization) {
            return res.status(404).json({ error: 'Organization not found' });
        }

        // Check if subscription is expired
        if (organization.subscription_status === 'Expired' || organization.subscription_status === 'Suspended') {
            return res.status(403).json({
                error: 'Subscription expired',
                message: 'Your subscription has expired. Please contact support to renew.',
                subscription_status: organization.subscription_status,
                expiry_date: organization.subscription_expiry_date
            });
        }

        // Check if expiry date has passed (in case status wasn't updated)
        if (organization.subscription_expiry_date && new Date(organization.subscription_expiry_date) < new Date()) {
            await organization.update({
                subscription_status: 'Expired',
                is_active: false
            });

            return res.status(403).json({
                error: 'Subscription expired',
                message: 'Your subscription has expired. Please contact support to renew.',
                subscription_status: 'Expired',
                expiry_date: organization.subscription_expiry_date
            });
        }

        next();
    } catch (error) {
        console.error('Error checking subscription:', error);
        next(error);
    }
};

module.exports = {
    checkSubscriptionExpiry,
    requireActiveSubscription
};
