<?php
require __DIR__ . '/includes/bootstrap.php';
require_admin();

$backupDir = __DIR__ . '/backups';
if (!is_dir($backupDir)) {
    @mkdir($backupDir, 0775, true);
}

/** Find mysqldump / mysql (XAMPP on Windows, macOS or Linux, or PATH). */
function mysql_binary(string $name): ?string
{
    $ext = stripos(PHP_OS, 'WIN') === 0 ? '.exe' : '';
    $dirs = [];
    if (MYSQL_BIN_DIR !== '') {
        $dirs[] = MYSQL_BIN_DIR;
    }
    $dirs = array_merge($dirs, [
        'C:/xampp/mysql/bin',
        'D:/xampp/mysql/bin',
        '/Applications/XAMPP/xamppfiles/bin',
        '/opt/lampp/bin',
        '/usr/local/mysql/bin',
        '/usr/bin',
        '/usr/local/bin',
    ]);
    foreach ($dirs as $d) {
        foreach ([$name, $name === 'mysqldump' ? 'mariadb-dump' : 'mariadb'] as $n) {
            $p = rtrim($d, '/\\') . '/' . $n . $ext;
            if (is_file($p)) {
                return $p;
            }
        }
    }
    return null;
}

function auth_args(): string
{
    $a = ' --host=' . escapeshellarg(DB_HOST) . ' --port=' . (int)DB_PORT . ' --user=' . escapeshellarg(BACKUP_DB_USER);
    if (BACKUP_DB_PASS !== '') {
        $a .= ' --password=' . escapeshellarg(BACKUP_DB_PASS);
    }
    return $a;
}

function valid_backup_name(string $n): bool
{
    return (bool)preg_match('/^sis_backup_\d{8}_\d{6}\.sql$/', $n);
}

$execOk = function_exists('exec') && !in_array('exec', array_map('trim', explode(',', (string)ini_get('disable_functions'))), true);
$dump = mysql_binary('mysqldump');
$mysql = mysql_binary('mysql');

/* download */
if (isset($_GET['download'])) {
    $name = basename((string)$_GET['download']);
    if (valid_backup_name($name) && is_file("$backupDir/$name")) {
        header('Content-Type: application/sql');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Content-Length: ' . filesize("$backupDir/$name"));
        readfile("$backupDir/$name");
        exit;
    }
    flash('error', 'Backup file not found.');
    redirect('backup.php');
}

if (is_post()) {
    csrf_verify();
    $action = $_POST['action'] ?? '';

    if (!$execOk) {
        flash('error', 'PHP exec() is disabled on this server, so backups cannot run from the website.');
    } elseif ($action === 'backup') {
        if (!$dump) {
            flash('error', 'mysqldump was not found. Set MYSQL_BIN_DIR in config.php.');
        } else {
            $name = 'sis_backup_' . date('Ymd_His') . '.sql';
            $cmd = escapeshellarg($dump) . auth_args()
                 . ' --routines --triggers --single-transaction --result-file=' . escapeshellarg("$backupDir/$name")
                 . ' ' . escapeshellarg(DB_NAME) . ' 2>&1';
            exec($cmd, $out, $code);
            if ($code === 0 && is_file("$backupDir/$name")) {
                flash('success', "Backup created: $name");
            } else {
                @unlink("$backupDir/$name");
                flash('error', 'Backup failed: ' . implode(' ', $out));
            }
        }
    } elseif ($action === 'restore') {
        $name = basename((string)($_POST['file'] ?? ''));
        if (!$mysql) {
            flash('error', 'mysql client was not found. Set MYSQL_BIN_DIR in config.php.');
        } elseif (!valid_backup_name($name) || !is_file("$backupDir/$name")) {
            flash('error', 'Backup file not found.');
        } else {
            $cmd = escapeshellarg($mysql) . auth_args() . ' ' . escapeshellarg(DB_NAME)
                 . ' < ' . escapeshellarg("$backupDir/$name") . ' 2>&1';
            exec($cmd, $out, $code);
            flash($code === 0 ? 'success' : 'error',
                  $code === 0 ? "Database restored from $name." : 'Restore failed: ' . implode(' ', $out));
        }
    } elseif ($action === 'delete') {
        $name = basename((string)($_POST['file'] ?? ''));
        if (valid_backup_name($name) && is_file("$backupDir/$name")) {
            unlink("$backupDir/$name");
            flash('success', 'Backup deleted.');
        }
    }
    redirect('backup.php');
}

$files = [];
foreach (glob($backupDir . '/sis_backup_*.sql') ?: [] as $f) {
    $files[] = ['name' => basename($f), 'size' => filesize($f), 'time' => filemtime($f)];
}
usort($files, fn($a, $b) => $b['time'] <=> $a['time']);

$title = 'Backup & recovery';
$active = 'backup';
require __DIR__ . '/includes/header.php';
?>
<div class="page-head">
    <div><h1>Backup &amp; recovery</h1>
    <p class="subtitle">Dumps include tables, data, views, stored procedures, functions and triggers.</p></div>
    <form method="post">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="backup">
        <button class="btn btn-good">Create backup now</button>
    </form>
</div>

<?php if (!$execOk || !$dump): ?>
<div class="alert alert-info">
    <?= !$execOk ? 'exec() is disabled in php.ini, so the buttons on this page cannot run.' : 'mysqldump was not found automatically.' ?>
    You can still back up from a terminal:
    <code>mysqldump -u root --routines --triggers <?= e(DB_NAME) ?> &gt; backup.sql</code>
    and restore with <code>mysql -u root <?= e(DB_NAME) ?> &lt; backup.sql</code>.
</div>
<?php endif; ?>

<div class="card">
    <h2>Saved backups</h2>
    <div class="table-wrap">
    <table>
        <thead><tr><th>File</th><th>Created</th><th class="num">Size</th><th></th></tr></thead>
        <tbody>
        <?php foreach ($files as $f): ?>
            <tr>
                <td><?= e($f['name']) ?></td>
                <td><?= e(date('Y-m-d H:i:s', $f['time'])) ?></td>
                <td class="num"><?= e(number_format($f['size'] / 1024, 1)) ?> KB</td>
                <td>
                    <div class="actions">
                        <a class="btn btn-sm btn-ghost" href="backup.php?download=<?= urlencode($f['name']) ?>">Download</a>
                        <form method="post" data-confirm="Restore this backup? Current data will be replaced.">
                            <?= csrf_field() ?><input type="hidden" name="action" value="restore">
                            <input type="hidden" name="file" value="<?= e($f['name']) ?>">
                            <button class="btn btn-sm">Restore</button>
                        </form>
                        <form method="post" data-confirm="Delete this backup file?">
                            <?= csrf_field() ?><input type="hidden" name="action" value="delete">
                            <input type="hidden" name="file" value="<?= e($f['name']) ?>">
                            <button class="btn btn-sm btn-danger">Delete</button>
                        </form>
                    </div>
                </td>
            </tr>
        <?php endforeach; ?>
        <?php if (!$files): ?><tr><td colspan="4" class="empty">No backups yet. Click “Create backup now”.</td></tr><?php endif; ?>
        </tbody>
    </table>
    </div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
