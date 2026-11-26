# Security Policy

## Supported Versions

| Version | Supported |
| :--- | :--- |
| Current Release | Yes |

## Reporting a Vulnerability

If you discover a security issue in the **University Students Information Management System**, please report it responsibly to the project maintainers before disclosing it publicly.

When submitting a report, please include:

- A clear description of the issue and the affected module or workflow.
- Steps to reproduce the behavior safely without exposing live user accounts, student records, or financial data.
- Any suggested mitigation or patch details, if available.

Please **do not** include passwords, session tokens, database dumps, or personally identifiable student data in bug reports or public issue threads.

## Operational Security Guidelines

- **Keep Secrets Out of Source Control**: Never commit `.env` files, database files containing real user data, API keys, or private credentials to version control. Configure runtime environment variables strictly through your deployment platform's secret manager.
- **Transport Encryption**: Serve production deployments behind HTTPS/TLS so sign-in credentials and session headers are encrypted in transit.
- **Strong Account Credentials**: Enforce strong, unique passwords for all portal user accounts and rotate passwords promptly via **Settings → Security & Sessions** if unauthorized access is suspected.
- **Database Backups**: Store exported `.sql` snapshots securely with restricted access and verify their integrity before restoring into a production environment.
