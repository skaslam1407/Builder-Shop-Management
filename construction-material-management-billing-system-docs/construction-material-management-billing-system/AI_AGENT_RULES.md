# AI Coding Agent Rules

## Project context
Build an offline-first Windows desktop Construction Material Management & Billing System using Tauri 2, React, TypeScript, Rust, SQLx, and SQLite.

## Non-negotiable architecture
- React is presentation and interaction layer.
- Rust owns business rules, authorization, and database access.
- SQLx is the only database access layer.
- Use typed Tauri commands; never expose arbitrary SQL execution.
- Use migrations for every schema change.
- Keep modules small and responsibilities explicit.

## Financial correctness
- Use integer paise or a decimal-safe type for money.
- Never use JavaScript or Rust binary floating-point for authoritative money calculations.
- Recalculate all totals and taxes in the backend.
- Use transactions for invoices, payments, purchases, and stock changes.
- Preserve finalized document snapshots.
- Never hard-delete finalized invoices or posted payments.
- Use cancellation/reversal workflows with reason and audit record.

## Security
- Use Argon2id for password hashing.
- Enforce permissions in backend commands.
- Apply least-privilege Tauri capabilities.
- Use parameterized queries.
- Do not log passwords, secrets, or unnecessary personal data.

## Working method
1. Read relevant project docs before coding.
2. Inspect existing code before changing it.
3. Implement one small task at a time.
4. State assumptions and unresolved questions.
5. Add tests with every business feature.
6. Run formatting, lint, type checking, and relevant tests.
7. Report files changed, commands run, results, and known limitations.
8. Do not claim a feature works without test evidence.
9. Do not silently change the architecture or add dependencies.
10. Update documentation when behavior or schema changes.

## Suggested specialist workflow
- Project Manager: break requirements into verifiable tasks.
- Architect/UX: review architecture and interaction flows.
- Frontend Developer: implement React UI.
- Backend Architect: implement Rust commands and services.
- Database Engineer: design migrations and query/index strategy.
- QA: verify acceptance criteria and regression cases.
- Security Reviewer: inspect permissions, data handling, and Tauri capabilities.
- Documentation: maintain setup, user, and deployment docs.

Use a developer → evidence-based QA loop for each task. Fix failures before moving on. Do not attempt to generate the entire application in one large step.
