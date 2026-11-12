<?php
require __DIR__ . '/includes/bootstrap.php';

if (current_user()) {
    redirect('index.php');
}

$error = '';
if (is_post()) {
    csrf_verify();
    $username = trim($_POST['username'] ?? '');
    $password = (string)($_POST['password'] ?? '');

    // Authentication lookup uses the administrator connection; the
    // rest of the session then uses the account for the user's role.
    $blocked = login_blocked($username);
    $st = db('admin')->prepare('SELECT user_id, username, password_hash, full_name, role
                                FROM users WHERE username = ? AND is_active = 1');
    $st->execute([$username]);
    $u = $st->fetch();

    if (!$blocked && $u && password_verify($password, $u['password_hash'])) {
        login_cleared($username);
        session_regenerate_id(true);
        $_SESSION['last_seen'] = time();
        $_SESSION['user_id']   = (int)$u['user_id'];
        $_SESSION['username']  = $u['username'];
        $_SESSION['full_name'] = $u['full_name'];
        $_SESSION['role']      = $u['role'];
        redirect('index.php');
    }
    if ($blocked) {
        $error = 'Too many failed attempts. Wait 10 minutes and try again.';
    } else {
        login_failed($username);
        $error = 'Wrong username or password.';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · <?= e(APP_NAME) ?></title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
<div class="login-page">
    <form class="login-card" method="post" autocomplete="off">
        <h1><?= e(APP_NAME) ?></h1>
        <p class="subtitle">Student Information Management System</p>
        <?php if ($error): ?><div class="alert alert-error"><?= e($error) ?></div><?php endif; ?>
        <?= csrf_field() ?>
        <div class="field">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" required autofocus value="<?= e($_POST['username'] ?? '') ?>">
        </div>
        <div class="field">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required>
        </div>
        <button class="btn" style="width:100%">Sign in</button>
        <div class="demo">
            <strong>Demo accounts</strong><br>
            Administrator: <code>admin</code> / <code>Admin@123</code><br>
            Lecturer: <code>lecturer1</code> / <code>Lecturer@123</code>
        </div>
    </form>
</div>
</body>
</html>
