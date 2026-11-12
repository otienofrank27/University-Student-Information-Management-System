# Deployment guide

Three ways to put the site online. Docker is the easiest; the other two are for hosts where
Docker is not available.

First login on a fresh install is `admin` / `Admin@123`. The dashboard shows a warning until
you change it on the Account page. Do that before anything else.

## 1. Docker (VPS, cloud VM, or your own server)

Needs Docker with the Compose plugin.

1. Copy the project folder to the server.
2. `cp .env.example .env`, then edit `.env`: set the three passwords. Set
   `LOAD_SAMPLE_DATA=0` for a real system (admin account only) or leave it at `1` for the demo data.
3. `docker compose up -d --build`
4. Open `http://SERVER_IP:8080`.

The database lives in the `dbdata` volume, so it survives restarts and rebuilds. Dumps made on the
Backup page are stored in the `backups` volume. Passwords in `.env` are only read the first time the
database volume is created; to change them later, run the `ALTER USER` statements on the database or
recreate the volume (this deletes data).

### HTTPS with a domain

Put a reverse proxy in front. With Caddy installed on the same server, this is the whole config
and it gets a certificate automatically:

```
school.example.com {
    reverse_proxy localhost:8080
}
```

Then set `TRUST_PROXY=1` in `.env` and run `docker compose up -d` again, so the site uses the
real visitor address and marks cookies secure. Do not expose port 8080 to the internet once the
proxy is in place (firewall it, or bind it with `"127.0.0.1:8080:80"` in `docker-compose.yml`).

### Everyday commands

| Task | Command |
|---|---|
| View logs | `docker compose logs -f web` |
| Update the site after changing files | `docker compose up -d --build` |
| Back up the database from the shell | `docker compose exec db sh -c 'mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --routines --triggers university_sis' > backup.sql` |
| Stop everything | `docker compose down` (add `-v` only if you want to delete all data) |

## 2. Shared hosting (cPanel)

1. In cPanel, create a MySQL database and a database user, and give the user all privileges.
2. In phpMyAdmin, select that database, open Import, and load `sql/install_shared_hosting.sql`
   (demo data) or `sql/install_shared_hosting_minimal.sql` (empty start).
   If the import stops with error 1419 (SUPER privilege) on a trigger or function, your host has
   binary logging on without the needed setting. Ask the host to enable it for your account, or
   choose a plan that allows triggers and stored routines. The project needs both.
3. Upload every project file to `public_html` (or a sub folder) with the File Manager or FTP. The
   `sql` and `docker` folders are not needed on the server.
4. Copy `.env.shared-hosting.example` to `.env` and fill in the database name, user and password.
5. Choose PHP 8.1 or newer in the cPanel PHP selector and make sure `pdo_mysql` is ticked.
6. Open the site address and sign in. Turn on the free SSL certificate in cPanel.

The Backup page will report that it cannot run, because shared hosts usually disable `exec()`.
Use cPanel Backup or the phpMyAdmin Export tab instead.

## 3. Plain Linux server (Ubuntu with Apache)

```
sudo apt update
sudo apt install apache2 php libapache2-mod-php php-mysql mariadb-server mariadb-client
sudo a2enmod headers rewrite
sudo mysql_secure_installation
```

1. Edit the two passwords in `sql/04_security.sql`, then run
   `sudo mysql < sql/install_all.sql` (or `install_all_minimal.sql` for an empty start).
2. Copy the project into `/var/www/html/sis` and set `AllowOverride All` for that folder so the
   `.htaccess` files work. Then `sudo systemctl reload apache2`.
3. Create `.env` in the project folder with `DB_ADMIN_PASS`, `DB_LECTURER_PASS`, and for the Backup
   page `BACKUP_DB_USER` / `BACKUP_DB_PASS` (a database account allowed to dump the database).
4. `sudo chown -R www-data:www-data /var/www/html/sis/backups`
5. Add HTTPS with `sudo apt install certbot python3-certbot-apache` and `sudo certbot --apache`.

On Nginx there is no `.htaccess`: block `/sql`, `/docker`, `/includes`, `/backups` and the files
`.env`, `config.php` and `*.sql` in your server block, and pass `*.php` to PHP-FPM.

## Settings reference

Set these as environment variables or in `.env`. Defaults suit a local XAMPP install.

| Name | Meaning | Default |
|---|---|---|
| `APP_ENV` | `production` hides error details | `production` |
| `TRUST_PROXY` | `1` behind a reverse proxy | `0` |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | database location | `localhost`, `3306`, `university_sis` |
| `DB_ADMIN_USER`, `DB_ADMIN_PASS` | account used for administrators | `sis_admin` and the demo password |
| `DB_LECTURER_USER`, `DB_LECTURER_PASS` | restricted account used for lecturers | `sis_lecturer` and the demo password |
| `BACKUP_DB_USER`, `BACKUP_DB_PASS` | account used by the Backup page | `root`, empty |
| `MYSQL_BIN_DIR` | folder with `mysqldump` and `mysql` | auto detect |
| `SESSION_IDLE_SECONDS` | sign out after this much inactivity | `3600` |

## Before going live

- Change the `admin` password, and create real lecturer accounts on the Users page. Disable the demo
  `lecturer1` and `lecturer2` accounts if you loaded sample data.
- Use HTTPS. The site sets secure cookies and an HSTS header when it detects it.
- Use strong, different database passwords in `.env` (the defaults in the code are for local use only).
- Keep `.env`, the `backups` folder and the `sql` folder out of public reach. The bundled `.htaccess`
  files do this on Apache.
- Schedule regular backups and copy them off the server. A backup that lives only on the same
  machine is lost with that machine.
- The health check is at `/health.php` (returns `{"status":"ok"}`), for uptime monitors.

## What the site already does for security

Passwords are stored as bcrypt hashes; all queries use prepared statements; every form carries a CSRF
token; output is escaped; sessions are HttpOnly, SameSite and expire when idle; sign-in is limited to
five failures per ten minutes for each username and address; scripts from other origins are blocked by
a Content-Security-Policy; and lecturers connect to MySQL with an account that cannot read fees or
user accounts.
