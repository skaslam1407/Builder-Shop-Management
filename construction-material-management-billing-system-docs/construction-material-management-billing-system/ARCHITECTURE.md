# System Architecture

## 1. Architecture overview

```text
Windows Desktop
└── Tauri 2 Application
    ├── React + TypeScript UI
    │   ├── Pages and components
    │   ├── Forms and client-side validation
    │   ├── State management
    │   └── Typed command client
    └── Rust Backend
        ├── Tauri commands
        ├── Authentication and authorization
        ├── Application services / business rules
        ├── Repositories
        └── SQLx
            └── Local SQLite database
```

## 2. Architectural rules
- React must not contain authoritative financial or inventory calculations.
- All business-critical validation and permission checks must run in Rust.
- All SQLite access must be through the Rust backend using SQLx.
- Tauri commands should expose narrow, typed operations, not arbitrary SQL execution.
- Keep UI, services, repositories, and database migrations separated.
- Use parameterized queries.
- Never trust values supplied by the frontend.

## 3. Backend layers
- Commands: validate command input shape, authenticate session, call services.
- Services: enforce business rules and coordinate transactions.
- Repositories: execute database queries.
- Models: typed domain and persistence structures.
- Migrations: versioned schema changes.

## 4. Transaction boundaries
Creating/finalizing a sales invoice should be atomic:
1. Validate user permission and invoice state.
2. Validate customer and item references.
3. Recalculate totals on the backend.
4. Validate stock policy.
5. Generate/allocate invoice number safely.
6. Insert invoice and invoice lines.
7. Insert stock movements.
8. Allocate any initial payment.
9. Write audit log.
10. Commit transaction.

If any step fails, roll back all changes.

## 5. Shared local database
Multiple app accounts on one computer should use one shared database, not separate databases per user profile. Choose a stable data directory with appropriate Windows ACL permissions. Do not store the database inside a temporary folder or the application installation directory.

If the application must work across separate Windows OS accounts, validate the chosen shared data directory and ACL behavior during installation. Avoid assuming that a per-user application data directory is shared.

## 6. Future multi-computer support
Do not place a SQLite database file on a network share for concurrent multi-computer usage. If LAN access becomes a requirement, introduce a central backend service and a server database designed for concurrent clients.
