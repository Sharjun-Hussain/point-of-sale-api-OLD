const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const checkModule = require('../middleware/checkModule');

// Apply authentication to all report routes
router.use(authenticate);

// Sales Reports
router.get('/sales/daily', checkPermission('report:view'), reportController.getDailySales);
router.get('/sales/payment-methods', checkPermission('report:view'), reportController.getSalePaymentMethods);
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
router.get('/stocks/insights', checkPermission('report:view'), checkModule('dashboard_kpi_live'), reportController.getInventoryInsights);
router.get('/stocks/expiring', checkPermission('report:view'), reportController.getExpiringProducts);
router.get('/stocks/batches/list', checkPermission('report:view'), reportController.getUniqueBatches);

// Financial Reports
router.get('/finance/profit-loss', checkPermission('report:view'), checkModule('reports_advanced'), reportController.getProfitLoss);
router.get('/finance/tax', checkPermission('report:view'), reportController.getTaxReport);
router.get('/finance/capital-balance', checkPermission('report:view'), reportController.getCapitalBalance);
router.get('/finance/cheques', checkPermission('report:view'), reportController.getChequeSummary);
router.get('/finance/trial-balance', checkPermission('report:view'), reportController.getTrialBalance);
router.get('/finance/payments', checkPermission('report:view'), reportController.getPaymentRegister);


// Customer Reports
router.get('/customers/history', checkPermission('report:view'), reportController.getCustomerHistory);
router.get('/customers/loyalty', checkPermission('report:view'), reportController.getLoyaltyReport);

// Purchase Reports
router.get('/purchase/supplier-performance', checkPermission('report:view'), checkModule('dashboard_kpi_live'), reportController.getSupplierPerformance);
router.get('/purchase/history', checkPermission('report:view'), reportController.getPurchaseHistoryReport);

// Dashboard
router.get('/dashboard/summary', reportController.getDashboardSummary);
router.get('/dashboard/charts', reportController.getDashboardCharts);

// Shift Reports
router.get('/shifts/history', checkPermission('report:view'), reportController.getShiftHistory);
router.get('/shifts/:id/detail', checkPermission('report:view'), reportController.getShiftReport);

// Manufacturing Reports
router.get('/manufacturing/summary', checkPermission('report:view'), reportController.getProductionSummary);
router.get('/manufacturing/raw-material-usage', checkPermission('report:view'), reportController.getRawMaterialUsage);
router.get('/manufacturing/distribution', checkPermission('report:view'), reportController.getDistributionReport);

// Advanced Reports
router.get('/advanced/transactions', checkPermission('report:view'), checkModule('reports_advanced'), reportController.getStockTransactions);
router.get('/advanced/stocks', checkPermission('report:view'), checkModule('reports_advanced'), reportController.getAdvancedStockReport);
router.get('/advanced/sales', checkPermission('report:view'), checkModule('reports_advanced'), reportController.getAdvancedSalesReport);
router.get('/advanced/batch-sales', checkPermission('report:view'), checkModule('reports_advanced'), reportController.getBatchWiseSalesReport);

module.exports = router;
