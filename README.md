# University Student Information Management System

PHP + MySQL website for the Advanced DBMS project. Runs on XAMPP.

## Setup (about 5 minutes)

1. Install and start **Apache** and **MySQL** in the XAMPP control panel.
2. Copy this folder to `C:\xampp\htdocs\university_sis`.
3. Open **http://localhost/phpmyadmin** > **Import** tab > choose `sql/install_all.sql` > **Import**.
   This creates the database, 7 tables, sample data, the function, triggers,
   stored procedures, views and the two MySQL accounts.
4. Open **http://localhost/university_sis/** and sign in.

| Role | Username | Password |
|---|---|---|
| Administrator | `admin` | `Admin@123` |
| Lecturer | `lecturer1` / `lecturer2` | `Lecturer@123` |

If you change the MySQL passwords in `sql/04_security.sql`, update `config.php` too.

## What each role can do

| | Administrator | Lecturer |
|---|---|---|
| Students, courses | add / edit / delete | view only |
| Course registration | register / remove | view only |
| Examination marks | enter for any course | enter for own courses only |
| Fees and payments | full access | no access |
| Backup and restore | yes | no |
| Users (create, disable, reset password) | yes | no |
| Change own password | yes | yes |

This is enforced twice: by the website, and by MySQL itself (the site connects as
`sis_admin` or `sis_lecturer`, and the lecturer account has no access to the
`payments` or `users` tables).

## Where each required concept lives

| Concept | Where |
|---|---|
| 7 tables, 3NF | `sql/01_schema.sql` (departments, users, students, courses, registrations, results, payments) |
| Indexing | bottom of `01_schema.sql`; `EXPLAIN` demo in `06_demo_queries.sql` |
| Triggers (marks 0-100) | `03_triggers_procedures_views.sql` |
| Stored procedures | `sp_get_student_details`, `sp_search_students`, `sp_register_course` |
| Views | `vw_student_results`, `vw_registration_details`, `vw_course_details`, `vw_fee_balance` |
| Security | `04_security.sql` + role checks in the PHP pages |
| Backup / recovery | Backup page in the site; commands in `05_backup_recovery.sql` |

`sql/06_demo_queries.sql` has ready-to-run blocks for the screenshots in your report.

## Files

- `sql/` database scripts (run `install_all.sql`, or 01 to 04 in order). `install_all_minimal.sql` starts empty; the `install_shared_hosting*.sql` files are for hosts that do not allow creating databases or users
- `config.php` settings (reads environment variables / `.env`)
- `Dockerfile`, `docker-compose.yml`, `docker/` container setup
- `health.php` status check for monitors
- `includes/` shared code (database, login, layout)
- `*.php` pages; `assets/style.css` styling
- `backups/` where the Backup page saves `.sql` dumps

## Deploying

See **DEPLOY.md** for Docker (`docker compose up -d --build`), shared hosting (cPanel) and plain
Linux server instructions, the settings reference and a go-live checklist. Settings come from
environment variables or a `.env` file; the defaults work for local XAMPP with no setup.

## Troubleshooting

- **"Cannot connect to the database"**: MySQL is not running, or `install_all.sql` was not imported.
- **Backup page says mysqldump not found**: set `MYSQL_BIN_DIR` in `.env`
  (for example `C:/xampp/mysql/bin`).
- **Import error about `DELIMITER`**: use the phpMyAdmin Import tab, not copy-paste into a single query box.
