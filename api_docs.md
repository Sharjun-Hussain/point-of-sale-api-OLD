# POS System API Documentation (Complete Reference)

This document provides exact request payloads and JSON response structures for every module in the POS backend.

## Base URL
`{{NEXT_PUBLIC_API_BASE_URL}}` (e.g., `http://localhost:5000/api`)

---

## 1. Authentication

### Login
*   **Method**: `POST /login`
*   **Payload**: `{ "email": "...", "password": "..." }`
*   **Response**:
    ```json
    {
      "status": "success",
      "message": "Login successful",
      "data": {
        "user": { "id": "...", "name": "...", "email": "...", "roles": [...] },
        "auth_token": "eyJhbG...",
        "refresh_token": "def456..."
      }
    }
    ```

### Register
*   **Method**: `POST /register`
*   **Payload**: `{ "name": "...", "email": "...", "password": "..." }`
*   **Response**: 
    ```json
    {
      "status": "success",
      "message": "Registration successful",
      "data": { "user": { "id": "...", "name": "...", "email": "..." } }
    }
    ```

---

## 2. User & Access Management

### Users List (Paginated)
*   **Method**: `GET /users`
*   **Response**:
    ```json
    {
      "status": "success",
      "data": {
        "data": [
          { "id": "...", "name": "...", "email": "...", "is_active": true, "roles": [...] }
        ],
        "pagination": { "page": 1, "limit": 10, "total": 1, "pages": 1 }
      }
    }
    ```

### Roles & Permissions
*   **Get Permissions**: `GET /roles/permissions`
*   **Response**:
    ```json
    {
      "status": "success",
      "data": {
        "data": [
          { "id": "...", "name": "Product View", "group_name": "Product Management" }
        ]
      }
    }
    ```

---

## 3. Product & Inventory

### Create Product
*   **Method**: `POST /products`
*   **Payload**:
    ```json
    {
      "name": "Sony Headphones",
      "is_variant": true,
      "variants": [
        { "name": "Black", "sku": "SH-01", "price": 5000 }
      ]
    }
    ```
*   **Response**:
    ```json
    {
      "status": "success",
      "data": { "id": "...", "name": "Sony Headphones", "variants": [...] }
    }
    ```

### Active Master Data (Dropdowns)
Used for Populating Selectors. All follow this structure:
*   **URL**: `/brands/active/list`, `/main-categories/active/list`, etc.
*   **Response**:
    ```json
    {
      "status": "success",
      "message": "Active items fetched",
      "data": {
        "data": [
          { "id": "...", "name": "Sample Brand", "is_active": true }
        ]
      }
    }
    ```

---

## 4. Procurement & GRN

### Create GRN
*   **Method**: `POST /suppliers/grn`
*   **Payload**:
    ```json
    {
      "supplier_id": "...",
      "purchase_order_id": "...",
      "grn_number": "GRN-001",
      "received_date": "2024-02-01",
      "total_amount": 1000,
      "items": [
        { "product_id": "...", "product_variant_id": "...", "quantity_received": 10, "unit_cost": 100 }
      ]
    }
    ```
*   **Response**: Standard success with GRN object.

### List GRNs (Reports)
*   **Method**: `GET /suppliers/grn`
*   **Query Params**: `page, size, supplier_id, branch_id, start_date, end_date`
*   **Response**: Paginated list of GRNs.

### GRN Details
*   **Method**: `GET /suppliers/grn/:id`
*   **Response**: Detailed GRN object with items, product names, and supplier info.

---

## 5. Finnance & Ledgers

### Supplier Ledger
*   **Method**: `GET /suppliers/:id/ledger`
*   **Response**:
    ```json
    {
      "status": "success",
      "data": {
        "supplier": { "id": "...", "name": "..." },
        "ledger": [
          { "date": "...", "type": "GRN", "amount": 1000, "balance": 1000 },
          { "date": "...", "type": "PAYMENT", "amount": 200, "balance": 800 }
        ],
        "current_balance": 800
      }
    }
    ```

---

## 6. Expenses

### Expenses Record
*   **Method**: `POST /expenses`
*   **Response**:
    ```json
    {
      "status": "success",
      "data": { "id": "...", "amount": 500, "description": "Stationery" }
    }
    ```

---

## Global Response Structure Details

### Error Response (400, 401, 403, 404, 500)
```json
{
  "status": "error",
  "message": "Direct error explanation",
  "errors": [ "Detailed", "Technical", "Errors" ]
}
```

### Success (Standard)
```json
{
  "status": "success",
  "message": "Optional feedback",
  "data": { ... OBJECT OR LIST ... }
}
```

### Success (Frontend-Aligned Lists)
Used primarily in `/active/list` endpoints to allow `const items = res.data.data.data` in React.
```json
{
  "status": "success",
  "data": {
    "data": [ ... ARRAY ... ]
  }
}
```
