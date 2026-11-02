# Build, Install, and Deployment

## Target
Windows 10/11, 64-bit desktop installer.

## Development prerequisites
- Supported Node.js LTS version.
- Rust toolchain supported by the selected Tauri 2 release.
- Tauri Windows build prerequisites (including Microsoft C++ Build Tools and WebView2 runtime as required by the target environment).
- Project package manager and lockfiles.

Check the current official Tauri documentation before pinning exact toolchain versions.

## Build process
1. Install dependencies from lockfiles.
2. Run frontend lint and type checks.
3. Run Rust formatting, clippy, and tests.
4. Run database migration tests.
5. Build the Tauri Windows bundle.
6. Test the installer on a clean Windows environment.
7. Verify database creation, shared-user access requirements, printing, backup, and restore.

## Data storage
- Store the live database in a stable application data directory, not beside the executable.
- Confirm whether the app is installed per-user or machine-wide.
- If multiple Windows OS accounts must share data, provision a protected shared directory and validate ACLs.
- Keep backups outside the live database directory where practical.

## Updates
- Back up the database before schema upgrades.
- Run versioned migrations at startup or through a controlled upgrade step.
- If migration fails, stop safely and preserve the original database.
- Test upgrade paths from every supported released schema.

## Release checklist
- [ ] Version and changelog updated.
- [ ] Tests and security checks pass.
- [ ] Installer tested on clean Windows.
- [ ] Upgrade tested from previous version.
- [ ] Backup/restore tested.
- [ ] GST invoice reviewed by a qualified professional.
- [ ] User guide included.
