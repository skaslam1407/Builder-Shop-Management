# Project Charter

## Name
Construction Material Management & Billing System

## Product type
Offline-first Windows desktop business application.

## Target business
A construction material retail/wholesale shop selling materials such as cement, sand, bricks, steel, stone chips, tiles, paint, pipes, and related products.

## Users
- Owner / Administrator
- Manager
- Billing Staff
- Viewer / Accountant

The application supports multiple user accounts inside the app on one computer. This does not imply simultaneous multi-computer access.

## Primary objectives
- Replace manual billing and scattered spreadsheets.
- Keep customer, supplier, purchase, sales, stock, and payment data in one local database.
- Create printable GST and non-GST invoices.
- Track customer outstanding balances and supplier dues.
- Provide useful operational and financial reports.
- Preserve data integrity and enable recovery after hardware or software failure.

## Scope boundaries for version 1
Included:
- Single shop/company configuration
- One Windows computer
- Multiple local application accounts
- Local SQLite database
- GST and non-GST invoice modes
- Basic inventory and purchase tracking
- Reports, exports, printing, and backup

Not included in the first release:
- Cloud synchronization
- Multi-branch operations
- Concurrent multi-computer access
- Online payment gateway
- E-invoice/e-way bill integration unless separately specified and legally validated

## Success criteria
- A user can create and print an invoice without internet access.
- Invoice totals and balances are reproducible and accurate.
- A finalized invoice cannot be silently altered or deleted.
- Stock and payment changes are traceable.
- A backup can be restored successfully on a clean installation.
- User permissions prevent unauthorized access to sensitive operations.
