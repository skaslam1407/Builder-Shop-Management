# Software Requirements Specification

## 1. Platform
- Windows 10/11, 64-bit, and modern 64-bit Linux distributions.
- Single physical computer in the initial release.
- Multiple application accounts.
- No internet dependency for core workflows.

## 2. Data and localization
- Currency: INR (₹). Currency settings affect display only; values are stored in INR paise.
- UI languages: English and Bengali, selectable per user; new users follow the company default.
- Dates displayed in a consistent configurable format.
- Store timestamps consistently and display local time.
- GST configuration must support the relevant Indian tax scenarios, subject to professional review.

## 3. Authentication and authorization
- Login with username and password.
- Store password hashes using Argon2id; never store plaintext passwords.
- Provide account activation/deactivation and password reset by an authorized admin.
- Enforce permissions in backend commands, not only by hiding frontend controls.
- Log security-sensitive events.

## 4. Invoice requirements
- Unique invoice number.
- Invoice date and customer details snapshot.
- Item description, HSN where applicable, unit, quantity, rate, discount, taxable value, tax, and line total.
- GST mode: configurable CGST/SGST or IGST calculation according to the transaction configuration.
- Non-GST mode: tax fields hidden or clearly marked according to approved business policy.
- Payment status: unpaid, partially paid, paid, or cancelled.
- Print layout must clearly identify the invoice type and company details.
- Preserve the original invoice snapshot after finalization.

## 5. Data integrity
- Foreign keys enabled in SQLite.
- Unique constraints for usernames, item codes where used, and invoice numbers.
- Use database transactions for multi-table business operations.
- Use migrations for schema changes.
- Avoid cascading deletion of financial records.
- Use reversal/cancellation records for posted financial activity.

## 6. Import/export
- Validate imported rows before committing.
- Show row-level errors and a preview.
- Provide a dry-run/preview stage for bulk imports.
- Export only data the current user is permitted to view.
- Protect against formula injection when exporting CSV/XLSX.

## 7. Performance and reliability
- Use indexes for common search and reporting fields.
- Paginate large lists.
- Avoid loading all transaction history into the UI at once.
- Handle database busy/locked errors gracefully.
- Validate backups before offering restore.

## 8. Open decisions
- Exact GST invoice format and tax rules.
- Whether stock may go negative.
- Whether sales returns and purchase returns are in MVP.
- Whether multiple units and conversion ratios are required per item.
- Whether separate invoice numbering sequences are required.
- Whether Windows user profiles share one database or the app is installed for a single Windows profile.

Resolve these decisions before finalizing implementation.
