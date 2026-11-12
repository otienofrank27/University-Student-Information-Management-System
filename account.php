<?php
require __DIR__ . '/includes/bootstrap.php';
require_login();

$me = current_user();
$errors = [];

if (is_post()) {
    csrf_verify();
    $current = (string)($_POST['current'] ?? '');
    $new = (string)($_POST['new'] ?? '');
    $confirm = (string)($_POST['confirm'] ?? '');

    // Own row only; the website's trusted connection is used because
    // lecturers' database accounts have no access to the users table.
    $pdo = db('admin');
    $st = $pdo->prepare('SELECT password_hash FROM users WHERE user_id = ?');
    $st->execute([$me['id']]);
    $hash = (string)$st->fetchColumn();

    if (!password_verify($current, $hash)) {
        $errors[] = 'Your current password is not correct.';
    }
    if (strlen($new) < 10) {
        $errors[] = 'The new password must be at least 10 characters.';
    }
    if ($new !== $confirm) {
        $errors[] = 'The new password and its confirmation do not match.';
    }
    if ($new === $current && !$errors) {
        $errors[] = 'Choose a password different from the current one.';
    }
    if (!$errors) {
        $pdo->prepare('UPDATE users SET password_hash = ? WHERE user_id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), $me['id']]);
        session_regenerate_id(true);
        flash('success', 'Password changed.');
        redirect('account.php');
    }
}

$title = 'Account';
$active = '';
require __DIR__ . '/includes/header.php';
?>
<div class="page-head">
    <div><h1>My account</h1><p class="subtitle"><?= e($me['name']) ?> (<?= e($me['username']) ?>), <?= e($me['role']) ?></p></div>
</div>

<?php foreach ($errors as $err): ?><div class="alert alert-error"><?= e($err) ?></div><?php endforeach; ?>

<form method="post" class="card" style="max-width:480px" autocomplete="off">
    <h2>Change password</h2>
    <?= csrf_field() ?>
    <div style="margin-bottom:12px"><label>Current password</label><input type="password" name="current" required></div>
    <div style="margin-bottom:12px"><label>New password (10+ characters)</label><input type="password" name="new" minlength="10" required></div>
    <div><label>Confirm new password</label><input type="password" name="confirm" minlength="10" required></div>
    <div class="form-actions"><button class="btn btn-good">Change password</button></div>
</form>
<?php require __DIR__ . '/includes/footer.php'; ?>
