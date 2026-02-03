const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authenticate = require('../middleware/auth');

// Apply authentication to all report routes
router.use(authenticate);

// Sales Reports
router.get('/sales/daily', reportController.getDailySales);
router.get('/sales/product', reportController.getSalesByProduct);
router.get('/sales/returns', reportController.getSalesReturnHistory);
router.get('/sales/categories', reportController.getCategorySales);
router.get('/sales/item-count', reportController.getSoldItemCount);
router.get('/sales/supplier-profit', reportController.getSupplierProfit);
router.get('/sales/non-stock', reportController.getNonStockSales);

// Stock Reports
router.get('/stocks/value', reportController.getStockValue);
router.get('/stocks/low-stock', reportController.getLowStock);
router.get('/stocks/transfers', reportController.getStockTransfers);
router.get('/stocks/summary', reportController.getStockSummary);

// Financial Reports
router.get('/finance/profit-loss', reportController.getProfitLoss);
router.get('/finance/tax', reportController.getTaxReport);
router.get('/finance/capital-balance', reportController.getCapitalBalance);
router.get('/finance/cheques', reportController.getChequeSummary);
router.get('/finance/trial-balance', reportController.getTrialBalance);

// Customer Reports
router.get('/customers/history', reportController.getCustomerHistory);

// Purchase Reports
router.get('/purchase/supplier-performance', reportController.getSupplierPerformance);

// Dashboard
router.get('/dashboard/summary', reportController.getDashboardSummary);

module.exports = router;
