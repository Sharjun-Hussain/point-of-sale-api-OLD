const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Apply authentication to all report routes
router.use(authenticate);

// Sales Reports
router.get('/sales/daily', checkPermission('report:view'), reportController.getDailySales);
router.get('/sales/product', checkPermission('report:view'), reportController.getSalesByProduct);
router.get('/sales/returns', checkPermission('report:view'), reportController.getSalesReturnHistory);
router.get('/sales/categories', checkPermission('report:view'), reportController.getCategorySales);
router.get('/sales/item-count', checkPermission('report:view'), reportController.getSoldItemCount);
router.get('/sales/supplier-profit', checkPermission('report:view'), reportController.getSupplierProfit);
router.get('/sales/non-stock', checkPermission('report:view'), reportController.getNonStockSales);
router.get('/sales/card-reconciliation', checkPermission('report:view'), reportController.getCardReconciliation);

// Stock Reports
router.get('/stocks/value', checkPermission('report:view'), reportController.getStockValue);
router.get('/stocks/low-stock', checkPermission('report:view'), reportController.getLowStock);
router.get('/stocks/transfers', checkPermission('report:view'), reportController.getStockTransfers);
router.get('/stocks/summary', checkPermission('report:view'), reportController.getStockSummary);

// Financial Reports
router.get('/finance/profit-loss', checkPermission('report:view'), reportController.getProfitLoss);
router.get('/finance/tax', checkPermission('report:view'), reportController.getTaxReport);
router.get('/finance/capital-balance', checkPermission('report:view'), reportController.getCapitalBalance);
router.get('/finance/cheques', checkPermission('report:view'), reportController.getChequeSummary);
router.get('/finance/trial-balance', checkPermission('report:view'), reportController.getTrialBalance);

// Customer Reports
router.get('/customers/history', checkPermission('report:view'), reportController.getCustomerHistory);

// Purchase Reports
router.get('/purchase/supplier-performance', checkPermission('report:view'), reportController.getSupplierPerformance);

// Dashboard
router.get('/dashboard/summary', reportController.getDashboardSummary);

module.exports = router;
