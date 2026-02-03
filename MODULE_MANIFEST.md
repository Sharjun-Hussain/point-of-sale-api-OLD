# System Modules Manifest

This document provides a technical map of all business modules currently implemented in the POS backend, linking them to their corresponding Sequelize models and API routes.

## Core Infrastructure

### 1. Multi-Branch & Multi-Tenant
*   **Purpose**: Handles organization-level and branch-level isolation.
*   **Models**: 
    *   `Organization` ([Organization.js](file:///home/joon/pos-web/backend/src/models/Organization.js))
    *   `Branch` ([Branch.js](file:///home/joon/pos-web/backend/src/models/Branch.js))
*   **Routes**: 
    *   `/organizations` ([organizations.js](file:///home/joon/pos-web/backend/src/routes/organizations.js))
    *   `/branches` ([branches.js](file:///home/joon/pos-web/backend/src/routes/branches.js))

### 2. Authentication & Authorization (RBAC)
*   **Purpose**: User management, session handling, and role-based permissions.
*   **Models**: 
    *   `User` ([User.js](file:///home/joon/pos-web/backend/src/models/User.js))
    *   `Role` ([Role.js](file:///home/joon/pos-web/backend/src/models/Role.js))
    *   `Permission` ([Permission.js](file:///home/joon/pos-web/backend/src/models/Permission.js))
*   **Routes**: 
    *   `/auth` (Base routes: `/login`, `/register`, `/me`) ([auth.js](file:///home/joon/pos-web/backend/src/routes/auth.js))
    *   `/users` ([users.js](file:///home/joon/pos-web/backend/src/routes/users.js))
    *   `/roles` ([roles.js](file:///home/joon/pos-web/backend/src/routes/roles.js))

---

## Product & Inventory Management

### 3. Catalog Management
*   **Purpose**: Managing products, variants, and their physical attributes.
*   **Models**: 
    *   `Product`, `ProductVariant` ([Product.js](file:///home/joon/pos-web/backend/src/models/Product.js), [ProductVariant.js](file:///home/joon/pos-web/backend/src/models/ProductVariant.js))
    *   `MainCategory`, `SubCategory`
    *   `Brand`, `Unit`, `MeasurementUnit`, `Container`
*   **Routes**: 
    *   `/products`, `/brands`, `/main-categories`, `/sub-categories`, `/units`, `/measurement-units`, `/containers`
    *   Note: Variant management is nested within `/products`.

### 4. Stock & Inventory
*   **Purpose**: Tracking stock levels per branch and recording adjustments.
*   **Models**: 
    *   `Stock` ([Stock.js](file:///home/joon/pos-web/backend/src/models/Stock.js))
    *   `StockAdjustment` ([StockAdjustment.js](file:///home/joon/pos-web/backend/src/models/StockAdjustment.js))
*   **Logic**: Integrated primarily into the GRN flow in `supplierController.js`.

---

## Procurement & CRM

### 5. Supplier Management & GRN
*   **Purpose**: Procurement cycles from Purchase Orders to receiving goods (GRN).
*   **Models**: 
    *   `Supplier` ([Supplier.js](file:///home/joon/pos-web/backend/src/models/Supplier.js))
    *   `GRN`, `GRNItem` ([GRN.js](file:///home/joon/pos-web/backend/src/models/GRN.js), [GRNItem.js](file:///home/joon/pos-web/backend/src/models/GRNItem.js))
    *   `PurchaseOrder`, `PurchaseOrderItem` ([PurchaseOrder.js](file:///home/joon/pos-web/backend/src/models/PurchaseOrder.js))
*   **Routes**: 
    *   `/suppliers` (includes `/grn` and `/ledger`) ([suppliers.js](file:///home/joon/pos-web/backend/src/routes/suppliers.js))
    *   `/purchase-orders` ([purchaseOrders.js](file:///home/joon/pos-web/backend/src/routes/purchaseOrders.js))

### 6. Customer Management
*   **Purpose**: Tracking customer accounts and specialized credit ledgers.
*   **Models**: 
    *   `Customer` ([Customer.js](file:///home/joon/pos-web/backend/src/models/Customer.js))
*   **Routes**: 
    *   `/customers` (includes `/ledger`) ([customers.js](file:///home/joon/pos-web/backend/src/routes/customers.js))

---

## Finance & Accounting

### 7. Core Accounting
*   **Purpose**: General Ledger, Charts of Accounts, and Transaction logging.
*   **Models**: 
    *   `Account` ([Account.js](file:///home/joon/pos-web/backend/src/models/Account.js))
    *   `Transaction` ([Transaction.js](file:///home/joon/pos-web/backend/src/models/Transaction.js))
*   **Logic**: Core transaction logs are created during Sales and GRN processes.

### 8. Expense Tracking
*   **Purpose**: Managing operational overhead and classifying costs.
*   **Models**: 
    *   `Expense`, `ExpenseCategory` ([Expense.js](file:///home/joon/pos-web/backend/src/models/Expense.js))
*   **Routes**: 
    *   `/expenses`, `/expense-categories`

---

## Sales (POS Engine)

### 9. Point of Sale
*   **Purpose**: Recording sales transactions and individual line items.
*   **Models**: 
    *   `Sale`, `SaleItem` ([Sale.js](file:///home/joon/pos-web/backend/src/models/Sale.js), [SaleItem.js](file:///home/joon/pos-web/backend/src/models/SaleItem.js))
*   **Status**: Models and Associations are defined. *Controller implementation in progress.*
