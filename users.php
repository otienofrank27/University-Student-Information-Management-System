<?php
require __DIR__ . '/includes/bootstrap.php';
require_admin();

$pdo = db();
$me = current_user();

if (is_post()) {
    csrf_verify();
    $action = $_POST['action'] ?? '';

    if ($action === 'add') {
        $username = trim((string)($_POST['username'] ?? ''));
        $full = trim((string)($_POST['full_name'] ?? ''));
        $role = $_POST['role'] ?? '';
        $pass = (string)($_POST['password'] ?? '');
        if (!preg_match('/^[A-Za-z0-9._-]{3,50}$/', $username)) {
            flash('error', 'Username must be 3 to 50 characters: letters, digits, dot, dash or underscore.');
        } elseif ($full === '' || !in_array($role, ['admin', 'lecturer'], true)) {
            flash('error', 'Enter the full name and choose a role.');
        } elseif (strlen($pass) < 10) {
            flash('error', 'The password must be at least 10 characters.');
        } else {
            try {
                $pdo->prepare('INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)')
                    ->execute([$username, password_hash($pass, PASSWORD_DEFAULT), $full, $role]);
                flash('success', "User $username created.");
            } catch (PDOException $e) {
                flash('error', db_code($e) === 1062 ? 'That username is already taken.' : db_error($e));
            }
        }
    } elseif ($action === 'toggle') {
        $uid = (int)($_POST['user_id'] ?? 0);
        if ($uid === $me['id']) {
            flash('error', 'You cannot deactivate your own account.');
        } else {
            $pdo->prepare('UPDATE users SET is_active = 1 - is_active WHERE user_id = ?')->execute([$uid]);
            flash('success', 'User status changed.');
        }
    } elseif ($action === 'reset') {
        $uid = (int)($_POST['user_id'] ?? 0);
        $pass = (string)($_POST['password'] ?? '');
        if (strlen($pass) < 10) {
            flash('error', 'The new password must be at least 10 characters.');
        } else {
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE user_id = ?')
                ->execute([password_hash($pass, PASSWORD_DEFAULT), $uid]);
            flash('success', 'Password reset.');
        }
    }
    redirect('users.php');
}

$users = $pdo->query('SELECT user_id, username, full_name, role, is_active, created_at
                      FROM users ORDER BY role, full_name')->fetchAll();

$title = 'Users';
$active = 'users';
require __DIR__ . '/includes/header.php';
?>
<div class="page-head">
    <div><h1>Users</h1><p class="subtitle">Administrator and lecturer accounts for this website.</p></div>
</div>

<form method="post" class="card" autocomplete="off">
    <h2>Add a user</h2>
    <?= csrf_field() ?>
    <input type="hidden" name="action" value="add">
    <div class="inline-form">
        <div><label>Username</label><input type="text" name="username" required></div>
        <div style="flex:1"><label>Full name</label><input type="text" name="full_name" required></div>
        <div><label>Role</label><select name="role"><option value="lecturer">lecturer</option><option value="admin">admin</option></select></div>
        <div><label>Password (10+ characters)</label><input type="password" name="password" minlength="10" required></div>
        <div><button class="btn btn-good">Create user</button></div>
    </div>
</form>

<div class="card">
<div class="table-wrap">
<table>
    <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Reset password</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($users as $u): ?>
        <tr>
            <td><?= e($u['username']) ?></td>
            <td><?= e($u['full_name']) ?></td>
            <td><?= e($u['role']) ?></td>
            <td><span class="badge <?= $u['is_active'] ? 'badge-good' : 'badge-bad' ?>"><?= $u['is_active'] ? 'active' : 'disabled' ?></span></td>
            <td>
                <form method="post" class="inline-form" style="gap:6px" autocomplete="off">
                    <?= csrf_field() ?>
                    <input type="hidden" name="action" value="reset">
                    <input type="hidden" name="user_id" value="<?= (int)$u['user_id'] ?>">
                    <input type="password" name="password" minlength="10" placeholder="New password" style="width:170px" required>
                    <button class="btn btn-sm btn-ghost">Reset</button>
                </form>
            </td>
            <td>
                <?php if ((int)$u['user_id'] !== $me['id']): ?>
                <form method="post" data-confirm="<?= $u['is_active'] ? 'Disable this account?' : 'Enable this account?' ?>">
                    <?= csrf_field() ?>
                    <input type="hidden" name="action" value="toggle">
                    <input type="hidden" name="user_id" value="<?= (int)$u['user_id'] ?>">
                    <button class="btn btn-sm <?= $u['is_active'] ? 'btn-danger' : 'btn-good' ?>"><?= $u['is_active'] ? 'Disable' : 'Enable' ?></button>
                </form>
                <?php endif; ?>
            </td>
        </tr>
    <?php endforeach; ?>
    </tbody>
</table>
</div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
