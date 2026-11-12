<?php
/*
 * Configuration. Every value can be set as an environment variable, or in a
 * file named .env next to this one (see .env.example). The defaults below
 * match a local XAMPP install, so nothing needs setting for local use.
 */

(function () {
    $file = __DIR__ . '/.env';
    if (!is_file($file)) {
        return;
    }
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
            continue;
        }
        [$k, $v] = explode('=', $line, 2);
        $k = trim($k);
        $v = trim($v);
        if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && substr($v, -1) === $v[0]) {
            $v = substr($v, 1, -1);
        }
        if ($k !== '' && getenv($k) === false) {
            putenv("$k=$v");
        }
    }
})();

function env(string $key, string $default = ''): string
{
    $v = getenv($key);
    return $v === false ? $default : $v;
}

define('APP_NAME', env('APP_NAME', 'University SIMS'));
define('APP_ENV', env('APP_ENV', 'production'));          // production | development
define('TRUST_PROXY', env('TRUST_PROXY', '0') === '1');   // set 1 behind a reverse proxy

// The site connects with a different database account per role (sql/04_security.sql).
// On shared hosting, where you only get one database user, give both roles the same one.
define('DB_HOST', env('DB_HOST', 'localhost'));
define('DB_PORT', (int)env('DB_PORT', '3306'));
define('DB_NAME', env('DB_NAME', 'university_sis'));

define('DB_ADMIN_USER',    env('DB_ADMIN_USER', 'sis_admin'));
define('DB_ADMIN_PASS',    env('DB_ADMIN_PASS', 'Admin@Sis2026'));
define('DB_LECTURER_USER', env('DB_LECTURER_USER', 'sis_lecturer'));
define('DB_LECTURER_PASS', env('DB_LECTURER_PASS', 'Lect@Sis2026'));

// Only the Backup page uses these (mysqldump needs wider privileges).
// XAMPP's default root account has an empty password.
define('BACKUP_DB_USER', env('BACKUP_DB_USER', 'root'));
define('BACKUP_DB_PASS', env('BACKUP_DB_PASS', ''));

// Folder containing mysqldump / mysql. Leave empty to auto-detect.
define('MYSQL_BIN_DIR', env('MYSQL_BIN_DIR', ''));

define('SESSION_IDLE_SECONDS', (int)env('SESSION_IDLE_SECONDS', '3600'));
