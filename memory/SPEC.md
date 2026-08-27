# CRM Sales Management — Spec

## What the app does
Web CRM for a B2B industrial-automation distributor: customer database, sales pipeline,
quotations (with line items + PDF/print), purchase orders, order monitoring to delivery,
sales activities, per-sales KPI, user/role admin, product master, audit log.
UI language: Bahasa Indonesia. Currency: IDR.

## Auth
- httpOnly cookie session (`crm_session`, JWT HS256, 12h expiry) set by `POST /api/auth/login`.
- `GET /api/auth/me` answers "who am I"; `POST /api/auth/logout` clears it.
- Passwords hashed with passlib pbkdf2_sha256. No tokens in JSON, none stored client-side.
- Frontend: `beginSession()` after login, `endSession()` on logout (clears react-query cache).

## Roles & data scope
- `SUPER_ADMIN` — unrestricted.
- `SALES_MANAGER` — own records + all direct reports (users with `manager_id` = their `user_id`).
- `SALES` — only records where `sales_id` = own `user_id`.
Scope is enforced server-side in `lib/auth.scope_filter()` on every list/detail/mutation query.

## Collections (Mongo, string uuid/human ids, never ObjectId)
- `users`: user_id (USR-000n, primary identifier), name, email, password_hash, role, manager_id,
  manager_name, phone, status, must_change_password, last_login, created_date, updated_date
- `customers`: customer_id (CUS-000n), customer_name, company, industry, address, city, province,
  phone, email, pic_name, pic_position, source, sales_id, sales_name, status, notes, dates
- `products`: product_id (PRD-000n), product_code, product_name, brand, category, description,
  unit, default_price, supplier, distributor, status, dates
- `opportunities`: opportunity_id (OPP-000n), opportunity_name, customer_id/_name, sales_id/_name,
  value, probability, weighted_value (= value × probability / 100), stage, expected_close_date,
  source, notes, dates. Stages: Lead, Qualification, Proposal, Negotiation, Won, Lost
- `quotations`: quotation_id (QTN-000n), quotation_number (QT-YYYY-0001), quotation_date,
  customer_id/_name, opportunity_id, sales_id/_name, validity_date, payment_term, delivery_term,
  notes, items[] (quotation_item_id, product_id, description, qty, unit, unit_price, discount,
  subtotal), subtotal, discount, tax_percent, tax, grand_total, status, dates.
  Statuses: Draft, Sent, Negotiation, Approved, Rejected, Expired, Converted
- `purchase_orders`: po_id (POR-000n), po_number (PO-YYYY-0001), po_date, customer_id/_name,
  quotation_id/_number, sales_id/_name, po_value, delivery_address, payment_term, notes, status,
  document_name, items[] (po_item_id, product_id, description, qty, unit, unit_price, subtotal).
  Statuses: Draft, Received, Confirmed, Processing, Completed, Cancelled
- `order_monitoring`: monitoring_id (MON-000n), po_id, po_number, customer_id/_name,
  sales_id/_name, product_id, product_name, qty, status, supplier, distributor, eta,
  actual_delivery_date, notes, last_update, dates.
  Statuses: Waiting Order, Processing, Indent, Ready Stock, Delivery, Completed, Cancelled.
  Derived `eta_flag`: OVERDUE (eta < today & not Completed/Cancelled), DUE_SOON (eta ≤ today+3),
  COMPLETED, ON_TIME.
- `activities`: activity_id (ACT-000n), sales_id/_name, customer_id/_name, opportunity_id,
  activity_type, activity_date, subject, description, next_followup, status, dates
- `audit_logs`: user_id, user_name, action, module, record_id, old_value, new_value, timestamp
- `counters`: atomic sequence per id prefix

Relationship chain: Customer → Opportunity → Quotation → PO → Order Monitoring, all linked by
the same ids. Convert-to-PO and create-monitoring reuse existing customer_id/sales_id/product_id.

## Key flows
1. Login → dashboard (aggregated KPI only, filterable by period/sales/stage/customer).
2. Customers list (server pagination/search/filter/sort) → detail with lazy-loaded tabs
   (pipeline, quotations, POs, activities, order monitoring — fetched only on tab open).
3. Pipeline: table view + kanban view; stage change recomputes probability + weighted_value.
4. Quotation: create with line items → totals computed server-side → status change →
   `POST /api/quotations/{id}/convert-to-po` creates the PO and marks quotation Converted.
5. PO detail → `POST /api/purchase-orders/{id}/create-monitoring` creates one monitoring row per
   PO item and moves the PO to Processing. Marking all rows Completed completes the PO.
6. Order Monitoring: inline status + ETA edit, ETA indicator badges, summary counters.
7. Sales Team: per-sales KPI via grouped aggregations (not one query per person).

## Performance strategy
Server-side pagination (default 25, max 100), server-side search (regex on indexed fields) and
filters, startup-created indexes on all filter/sort fields, strict projections, denormalised
names (no N+1), aggregation-only dashboard/summary endpoints, lazy tabs, 10-minute client cache
for master option lists, skeleton loaders everywhere.

## API surface (all under /api)
auth: POST /auth/login, POST /auth/logout, GET /auth/me
users: GET /users, GET /users/options, POST /users, PUT /users/{id}, POST /users/{id}/reset-password
customers: GET /customers, GET /customers/options, GET /customers/{id},
  GET /customers/{id}/{pipeline|quotations|purchase-orders|activities|order-monitoring},
  POST /customers, PUT /customers/{id}, DELETE /customers/{id}
products: GET /products, GET /products/options, POST/PUT/DELETE
pipeline: GET /pipeline, /pipeline/summary, /pipeline/kanban, /pipeline/{id}, POST, PUT,
  PATCH /pipeline/{id}/stage, DELETE
quotations: GET /quotations, /quotations/{id}, POST, PUT, PATCH /{id}/status,
  POST /{id}/duplicate, POST /{id}/convert-to-po, DELETE
purchase-orders: GET, GET /{id}, POST, PUT, PATCH /{id}/status, POST /{id}/create-monitoring, DELETE
order-monitoring: GET, GET /summary, PATCH /{id}
activities: GET, GET /summary, POST, PUT, DELETE
audit-log: GET (SUPER_ADMIN + SALES_MANAGER)
dashboard: GET /dashboard, GET /sales-team

## Seed data (backend/seed.py — idempotent, wipes then reseeds)
7 users (1 admin, 1 manager, 5 sales), 20 customers, 30 products, 20 opportunities across all
stages, 20 quotations (first 10 Converted), 10 POs, 10 order-monitoring rows with mixed ETAs
(overdue / due-soon / on-time / completed), 50 activities (today / upcoming / overdue /
completed), 12 audit-log entries.
