<?php
// Liveness/readiness check for Docker, load balancers and uptime monitors.
require __DIR__ . '/config.php';
header('Content-Type: application/json');
header('Cache-Control: no-store');
try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME),
        DB_ADMIN_USER,
        DB_ADMIN_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 3]
    );
    $pdo->query('SELECT 1');
    echo '{"status":"ok"}';
} catch (Throwable $e) {
    http_response_code(503);
    echo '{"status":"unavailable"}';
}
