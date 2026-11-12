<?php
require __DIR__ . '/includes/bootstrap.php';
require_login();

$pdo = db();
$count = fn(string $sql) => (int)$pdo->query($sql)->fetchColumn();

$stats = [
    'Students'      => $count('SELECT COUNT(*) FROM students'),
    'Courses'       => $count('SELECT COUNT(*) FROM courses'),
    'Registrations' => $count('SELECT COUNT(*) FROM registrations'),
    'Marks recorded' => $count('SELECT COUNT(*) FROM results'),
];

$recent = $pdo->query('SELECT registration_id, student_name, reg_no, course_code, course_title, academic_year, semester
                       FROM vw_registration_details ORDER BY registration_id DESC LIMIT 8')->fetchAll();

$user = current_user();
$myCourses = [];
if (!is_admin()) {
    $st = $pdo->prepare('SELECT c.course_code, c.course_title,
            (SELECT COUNT(*) FROM vw_registration_details rd WHERE rd.course_id = c.course_id) AS students,
            (SELECT COUNT(*) FROM vw_registration_details rd
               JOIN results r ON r.registration_id = rd.registration_id
              WHERE rd.course_id = c.course_id) AS marked
        FROM courses c WHERE c.lecturer_id = ? ORDER BY c.course_code');
    $st->execute([$user['id']]);
    $myCourses = $st->fetchAll();
}

$feeTotals = null;
if (is_admin()) {
    $feeTotals = $pdo->query('SELECT SUM(fee_charged) AS charged, SUM(total_paid) AS paid, SUM(balance) AS balance
                              FROM vw_fee_balance')->fetch();
}

$h = db('admin')->prepare('SELECT password_hash FROM users WHERE user_id = ?');
$h->execute([$user['id']]);
$hash = (string)$h->fetchColumn();
$defaultPw = password_verify('Admin@123', $hash) || password_verify('Lecturer@123', $hash);

$title = 'Dashboard';
$active = 'index';
require __DIR__ . '/includes/header.php';
?>
<?php if ($defaultPw): ?>
<div class="alert alert-error">You are still using the default password. <a href="account.php">Change it now</a>.</div>
<?php endif; ?>
<div class="page-head">
    <div>
        <h1>Welcome, <?= e($user['name']) ?></h1>
        <p class="subtitle">Overview of the university records.</p>
    </div>
</div>

<div class="figures">
    <?php foreach ($stats as $label => $n): ?>
        <div class="figure"><div class="num"><?= $n ?></div><div class="lbl"><?= e($label) ?></div></div>
    <?php endforeach; ?>
    <?php if ($feeTotals): ?>
        <div class="figure"><div class="num"><?= e(money($feeTotals['paid'])) ?></div><div class="lbl">Fees collected</div></div>
        <div class="figure"><div class="num"><?= e(money($feeTotals['balance'])) ?></div><div class="lbl">Outstanding balance</div></div>
    <?php endif; ?>
</div>

<?php if (!is_admin()): ?>
<div class="card">
    <h2>My courses</h2>
    <div class="table-wrap">
    <table>
        <thead><tr><th>Code</th><th>Title</th><th class="num">Registered</th><th class="num">Marks entered</th><th></th></tr></thead>
        <tbody>
        <?php foreach ($myCourses as $c): ?>
            <tr>
                <td><?= e($c['course_code']) ?></td>
                <td><?= e($c['course_title']) ?></td>
                <td class="num"><?= (int)$c['students'] ?></td>
                <td class="num"><?= (int)$c['marked'] ?></td>
                <td><a class="btn btn-sm" href="results.php?course=<?= urlencode($c['course_code']) ?>">Enter marks</a></td>
            </tr>
        <?php endforeach; ?>
        <?php if (!$myCourses): ?><tr><td colspan="5" class="empty">No courses are assigned to you yet.</td></tr><?php endif; ?>
        </tbody>
    </table>
    </div>
</div>
<?php endif; ?>

<div class="card">
    <h2>Latest course registrations</h2>
    <div class="table-wrap">
    <table>
        <thead><tr><th>Student</th><th>Course</th><th>Year</th><th>Semester</th></tr></thead>
        <tbody>
        <?php foreach ($recent as $r): ?>
            <tr>
                <td><?= e($r['student_name']) ?> <small style="color:var(--muted)"><?= e($r['reg_no']) ?></small></td>
                <td><?= e($r['course_code']) ?> · <?= e($r['course_title']) ?></td>
                <td><?= e($r['academic_year']) ?></td>
                <td><?= (int)$r['semester'] ?></td>
            </tr>
        <?php endforeach; ?>
        <?php if (!$recent): ?><tr><td colspan="4" class="empty">No registrations yet.</td></tr><?php endif; ?>
        </tbody>
    </table>
    </div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
