# Architecture Decision Records

## ADR-001: Offline-first desktop application
**Decision:** Use Tauri 2 for a Windows desktop application.

**Reason:** Small desktop footprint and access to native capabilities through a controlled Rust backend.

## ADR-002: React and TypeScript frontend
**Decision:** Use React + TypeScript for the UI.

**Reason:** Component-based UI and strong ecosystem for forms, tables, charts, and desktop workflows.

## ADR-003: SQLite local database
**Decision:** Use SQLite for the initial single-computer deployment.

**Reason:** No separate database server is required and the application can operate offline.

**Constraint:** Do not use a shared SQLite file on a network share for concurrent multi-computer access.

## ADR-004: Rust-owned database access
**Decision:** Use SQLx in the Rust backend and expose typed Tauri commands.

**Reason:** Keeps database access, validation, and authorization behind a single controlled boundary.

## ADR-005: Financial amounts in minor units
**Decision:** Store INR amounts as integer paise or a rigorously decimal-safe representation.

**Reason:** Avoid binary floating-point rounding errors.

## ADR-006: Reversal instead of deletion
**Decision:** Finalized invoices, posted payments, and stock movements are not hard-deleted.

**Reason:** Preserve auditability and financial history.

## Pending decisions
- Shared data directory across multiple Windows OS user profiles.
- GST invoice rules, tax rates, and print template.
- Stock-negative policy and return workflows.
- Unit conversion rules.
- Invoice numbering series.
