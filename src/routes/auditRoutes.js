const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const authenticate = require('../middleware/auth');

/**
 * @route   GET /api/v1/audit-logs
 * @desc    Get all audit logs with filtering
 * @access  Authenticated users
 */
router.get(
    '/',
    authenticate,
    auditController.getAllAuditLogs
);

/**
 * @route   GET /api/v1/audit-logs/stats
 * @desc    Get audit statistics
 * @access  Authenticated users
 */
router.get(
    '/stats',
    authenticate,
    auditController.getAuditStats
);

/**
 * @route   GET /api/v1/audit-logs/entity/:entityType/:entityId
 * @desc    Get audit trail for a specific entity
 * @access  Authenticated users
 */
router.get(
    '/entity/:entityType/:entityId',
    authenticate,
    auditController.getEntityAuditTrail
);

/**
 * @route   GET /api/v1/audit-logs/user/:userId
 * @desc    Get user activity history
 * @access  Authenticated users
 */
router.get(
    '/user/:userId',
    authenticate,
    auditController.getUserActivity
);

/**
 * @route   GET /api/v1/audit-logs/:id
 * @desc    Get audit log by ID
 * @access  Authenticated users
 */
router.get(
    '/:id',
    authenticate,
    auditController.getAuditLogById
);

module.exports = router;
