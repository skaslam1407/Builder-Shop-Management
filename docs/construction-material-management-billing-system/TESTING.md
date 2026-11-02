# Testing Strategy

## Test levels
- Unit tests: money calculations, tax calculations, permissions, validation, invoice numbering.
- Repository tests: SQL constraints, joins, migrations, foreign keys.
- Service/integration tests: invoice finalization, payment allocation, stock movements, reversals.
- UI tests: forms, search, navigation, validation feedback.
- End-to-end tests: login through invoice printing and backup/restore.
- Release tests: clean Windows install, upgrade, and recovery.

## Critical financial test cases
- Zero quantity and negative quantity are rejected.
- Invalid or inactive items cannot be added.
- Discounts cannot exceed allowed limits.
- Tax is recalculated by the backend.
- Rounding is deterministic and documented.
- Partial payments produce correct outstanding balances.
- Multiple payments cannot over-allocate without an explicit advance/credit workflow.
- Failed invoice finalization rolls back invoice, stock, payment, and audit writes.
- Cancelled invoices do not remain counted as active sales.
- Reversal restores stock and balances correctly where applicable.

## Security test cases
- Unauthorized user cannot invoke protected backend commands.
- Disabled users cannot log in.
- Passwords are not present in logs or database as plaintext.
- User cannot export data outside their permissions.
- Restore requires authorization and confirmation.

## Data integrity tests
- Foreign keys are enforced.
- Invoice numbers are unique.
- Finalized invoice snapshots remain unchanged after customer/item master edits.
- Migrations work from an empty database and from the previous released schema.
- Backup passes integrity validation and restores correctly.

## Definition of Done
A task is done only when:
1. Requirements and edge cases are understood.
2. Code is implemented in the correct architectural layer.
3. Tests pass.
4. Lint/type checks pass.
5. Permissions and audit requirements are addressed.
6. UI states include loading, empty, success, and error handling.
7. Evidence is recorded in the task or pull request.
