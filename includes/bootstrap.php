<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

/* ---------- environment: errors, HTTPS, headers, session ---------- */

error_reporting(E_ALL);
ini_set('display_errors', APP_ENV === 'production' ? '0' : '1');
ini_set('log_errors', '1');

function client_ip(): string
{
    if (TRUST_PROXY && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        return trim(explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
    }
    return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

function is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    return TRUST_PROXY && strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

if (!headers_sent()) {
    header('X-Frame-Options: DENY');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
         . "img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");
    if (is_https()) {
        header('Strict-Transport-Security: max-age=31536000');
    }
    header_remove('X-Powered-By');
}

set_exception_handler(function (Throwable $e) {
    error_log('Unhandled: ' . $e);
    if (!headers_sent()) {
        http_response_code(500);
    }
    echo '<!DOCTYPE html><meta charset="utf-8"><title>Error</title>'
       . '<body style="font-family:sans-serif;max-width:560px;margin:80px auto;padding:0 20px">'
       . '<h2>Something went wrong</h2><p>The request could not be completed. Please try again.</p>'
       . (APP_ENV !== 'production' ? '<pre>' . htmlspecialchars((string)$e) . '</pre>' : '')
       . '<p><a href="index.php">Back to the dashboard</a></p></body>';
});

if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.use_strict_mode', '1');
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => is_https(),
    ]);
    session_name('sis_session');
    session_start();

    // idle timeout
    if (isset($_SESSION['user_id'])) {
        if (time() - (int)($_SESSION['last_seen'] ?? time()) > SESSION_IDLE_SECONDS) {
            $_SESSION = [];
            session_regenerate_id(true);
            $_SESSION['flash'][] = ['type' => 'info', 'msg' => 'You were signed out after a period of inactivity.'];
        } else {
            $_SESSION['last_seen'] = time();
        }
    }
}

/* ---------- helpers ---------- */

function e($value): string
{
    return htmlspecialchars((string)($value ?? ''), ENT_QUOTES, 'UTF-8');
}

function money($n): string
{
    return 'KES ' . number_format((float)$n, 2);
}

function redirect(string $url): void
{
    header('Location: ' . $url);
    exit;
}

function flash(string $type, string $message): void
{
    $_SESSION['flash'][] = ['type' => $type, 'msg' => $message];
}

function flash_render(): string
{
    $out = '';
    foreach ($_SESSION['flash'] ?? [] as $f) {
        $out .= '<div class="alert alert-' . e($f['type']) . '">' . e($f['msg']) . '</div>';
    }
    unset($_SESSION['flash']);
    return $out;
}

/** Message text from a PDOException (e.g. the text of a trigger's SIGNAL). */
function db_error(Throwable $e): string
{
    if ($e instanceof PDOException && isset($e->errorInfo[2])) {
        return (string)$e->errorInfo[2];
    }
    return $e->getMessage();
}

function db_code(Throwable $e): int
{
    return ($e instanceof PDOException && isset($e->errorInfo[1])) ? (int)$e->errorInfo[1] : 0;
}

/* ---------- database: account depends on the logged-in role ---------- */

function db(?string $role = null): PDO
{
    static $pool = [];
    $role = $role ?? ($_SESSION['role'] ?? 'lecturer');
    if (!isset($pool[$role])) {
        [$user, $pass] = $role === 'admin'
            ? [DB_ADMIN_USER, DB_ADMIN_PASS]
            : [DB_LECTURER_USER, DB_LECTURER_PASS];
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
        try {
            $pool[$role] = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => true,   // needed for CALL with several result sets
            ]);
        } catch (PDOException $ex) {
            error_log('DB connection failed: ' . $ex->getMessage());
            http_response_code(503);
            exit('<h2>Cannot connect to the database</h2><p>The database is not reachable or the SQL scripts have not '
                . 'been imported. Check the database settings (config.php or .env).</p>'
                . (APP_ENV !== 'production' ? '<pre>' . e($ex->getMessage()) . '</pre>' : ''));
        }
    }
    return $pool[$role];
}

/* ---------- authentication ---------- */

function current_user(): ?array
{
    if (!isset($_SESSION['user_id'])) {
        return null;
    }
    return [
        'id'       => (int)$_SESSION['user_id'],
        'username' => $_SESSION['username'],
        'name'     => $_SESSION['full_name'],
        'role'     => $_SESSION['role'],
    ];
}

function is_admin(): bool
{
    return ($_SESSION['role'] ?? '') === 'admin';
}

function require_login(): void
{
    if (!current_user()) {
        redirect('login.php');
    }
}

function require_admin(): void
{
    require_login();
    if (!is_admin()) {
        flash('error', 'That page is for administrators only.');
        redirect('index.php');
    }
}

/* ---------- login throttle (file based, per username + IP) ---------- */

function throttle_file(string $username): string
{
    return sys_get_temp_dir() . '/sis_login_' . hash('sha256', strtolower($username) . '|' . client_ip());
}

function login_blocked(string $username): bool
{
    $f = throttle_file($username);
    if (!is_file($f)) {
        return false;
    }
    $d = json_decode((string)@file_get_contents($f), true);
    if (!is_array($d) || time() - (int)$d['first'] > 600) {
        @unlink($f);
        return false;
    }
    return (int)$d['count'] >= 5;
}

function login_failed(string $username): void
{
    $f = throttle_file($username);
    $d = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
    if (!is_array($d) || time() - (int)$d['first'] > 600) {
        $d = ['count' => 0, 'first' => time()];
    }
    $d['count']++;
    @file_put_contents($f, json_encode($d), LOCK_EX);
}

function login_cleared(string $username): void
{
    @unlink(throttle_file($username));
}

/* ---------- CSRF ---------- */

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf" value="' . e(csrf_token()) . '">';
}

function csrf_verify(): void
{
    $sent = $_POST['csrf'] ?? '';
    if (!is_string($sent) || !hash_equals($_SESSION['csrf'] ?? '', $sent)) {
        http_response_code(400);
        exit('Invalid or expired form. Go back, refresh the page and try again.');
    }
}

function is_post(): bool
{
    return $_SERVER['REQUEST_METHOD'] === 'POST';
}

/** Grade letter for display next to marks (mirrors fn_grade in MySQL). */
function grade_badge(?string $grade): string
{
    if ($grade === null || $grade === '') {
        return '<span class="badge">-</span>';
    }
    $cls = in_array($grade, ['A', 'B'], true) ? 'good' : (in_array($grade, ['C', 'D'], true) ? 'mid' : 'bad');
    return '<span class="badge badge-' . $cls . '">' . e($grade) . '</span>';
}

function current_academic_year(): string
{
    $y = (int)date('Y');
    $m = (int)date('n');
    $start = $m >= 9 ? $y : $y - 1;
    return $start . '/' . ($start + 1);
}
