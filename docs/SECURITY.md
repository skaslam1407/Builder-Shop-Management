# Security and Data Protection

## Authentication
- Hash passwords with Argon2id and a unique salt.
- Never log or store plaintext passwords.
- Apply sensible login throttling.
- Provide secure password reset by an authorized administrator.
- Do not rely on frontend route guards as the security boundary.

## Authorization
- Enforce permissions in Rust commands and services.
- Deny by default when permission is missing.
- Protect user management, invoice cancellation, settings, exports, and restore operations.
- Audit privileged actions.

## Database
- Use parameterized SQL queries.
- Enable SQLite foreign keys.
- Keep database and backups in protected data directories.
- Do not expose arbitrary SQL execution to the frontend.
- Avoid destructive cascades on financial records.
- Encrypt backups if they may be moved outside the protected computer; manage encryption keys safely.

## Tauri
- Apply least-privilege capabilities.
- Restrict filesystem access to required directories.
- Validate all command inputs.
- Avoid shell execution unless strictly required.
- Keep dependencies updated and review permissions when adding plugins.

## Import/export
- Validate file type, size, structure, and row values.
- Preview imports before committing.
- Prevent spreadsheet formula injection in exported files.
- Do not export fields the user is not allowed to access.

## Audit
Record login events, user/role changes, invoice finalization/cancellation, payment creation/reversal, stock adjustments, settings changes, imports, exports, and backup/restore actions.

## Privacy
Collect only necessary customer/supplier information. Protect backups and exported files because they may contain personal and financial information.
