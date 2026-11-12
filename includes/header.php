<?php
/** Expects: $title (string), $active (string) set before including. */
$user   = current_user();
$title  = $title ?? 'Dashboard';
$active = $active ?? '';

$nav = [
    'index'        => ['index.php', 'Dashboard'],
    'students'     => ['students.php', 'Students'],
    'courses'      => ['courses.php', 'Courses'],
    'registration' => ['registration.php', 'Registration'],
    'results'      => ['results.php', 'Results'],
];
if (is_admin()) {
    $nav['fees']   = ['fees.php', 'Fees'];
    $nav['users']  = ['users.php', 'Users'];
    $nav['backup'] = ['backup.php', 'Backup'];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($title) ?> · <?= e(APP_NAME) ?></title>
<link rel="stylesheet" href="assets/style.css">
<script src="assets/app.js" defer></script>
</head>
<body>
<header class="topbar">
    <div class="wrap topbar-inner">
        <a class="brand" href="index.php"><?= e(APP_NAME) ?></a>
        <nav class="nav">
            <?php foreach ($nav as $key => [$href, $label]): ?>
                <a href="<?= e($href) ?>" class="<?= $active === $key ? 'active' : '' ?>"><?= e($label) ?></a>
            <?php endforeach; ?>
        </nav>
        <div class="userbox">
            <span><?= e($user['name']) ?> <small>(<?= e($user['role']) ?>)</small></span>
            <a class="btn btn-ghost btn-sm" href="account.php">Account</a>
            <a class="btn btn-ghost btn-sm" href="logout.php">Log out</a>
        </div>
    </div>
</header>
<main class="wrap">
<?= flash_render() ?>
