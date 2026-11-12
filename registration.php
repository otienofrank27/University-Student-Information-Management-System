<?php
require __DIR__ . '/includes/bootstrap.php';
require_login();

if (is_post()) {
    require_admin();
    csrf_verify();
    $action = $_POST['action'] ?? '';

    if ($action === 'register') {
        $year = trim($_POST['academic_year'] ?? '');
        if (!preg_match('/^\d{4}\/\d{4}$/', $year)) {
            flash('error', 'Academic year must look like 2026/2027.');
        } else {
            try {
                // stored procedure validates the student, course and duplicates
                $st = db()->prepare('CALL sp_register_course(?, ?, ?, ?)');
                $st->execute([(int)$_POST['student_id'], (int)$_POST['course_id'], $year, (int)$_POST['semester']]);
                $st->closeCursor();
                flash('success', 'Student registered for the course.');
            } catch (PDOException $e) {
                flash('error', db_error($e));
            }
        }
    } elseif ($action === 'delete') {
        db()->prepare('DELETE FROM registrations WHERE registration_id = ?')
            ->execute([(int)($_POST['registration_id'] ?? 0)]);
        flash('success', 'Registration removed.');
    }
    redirect('registration.php' . (!empty($_POST['back']) ? '?course=' . urlencode($_POST['back']) : ''));
}

$pdo = db();
$courseFilter = trim($_GET['course'] ?? '');

if ($courseFilter !== '') {
    $st = $pdo->prepare('SELECT * FROM vw_registration_details WHERE course_code = ?
                         ORDER BY academic_year DESC, semester, student_name');
    $st->execute([$courseFilter]);
    $regs = $st->fetchAll();
} else {
    $regs = $pdo->query('SELECT * FROM vw_registration_details
                         ORDER BY registration_id DESC LIMIT 200')->fetchAll();
}

$allCourses = $pdo->query('SELECT course_code, course_title FROM courses ORDER BY course_code')->fetchAll();
$students = [];
if (is_admin()) {
    $students = $pdo->query("SELECT student_id, reg_no, first_name, last_name FROM students
                             WHERE status = 'active' ORDER BY last_name, first_name")->fetchAll();
    $courseOpts = $pdo->query('SELECT course_id, course_code, course_title FROM courses ORDER BY course_code')->fetchAll();
}

$title = 'Course registration';
$active = 'registration';
require __DIR__ . '/includes/header.php';
?>
<div class="page-head">
    <div><h1>Course registration</h1><p class="subtitle">Which students are taking which courses.</p></div>
    <form class="search" method="get">
        <select name="course" data-autosubmit>
            <option value="">All courses</option>
            <?php foreach ($allCourses as $co): ?>
                <option value="<?= e($co['course_code']) ?>" <?= $courseFilter === $co['course_code'] ? 'selected' : '' ?>><?= e($co['course_code'] . ' · ' . $co['course_title']) ?></option>
            <?php endforeach; ?>
        </select>
    </form>
</div>

<?php if (is_admin()): ?>
<form method="post" class="card">
    <h2>Register a student</h2>
    <?= csrf_field() ?>
    <input type="hidden" name="action" value="register">
    <input type="hidden" name="back" value="<?= e($courseFilter) ?>">
    <div class="inline-form">
        <div style="flex:2"><label>Student</label>
            <select name="student_id" required>
                <?php foreach ($students as $s): ?>
                    <option value="<?= (int)$s['student_id'] ?>"><?= e($s['reg_no'] . ' · ' . $s['first_name'] . ' ' . $s['last_name']) ?></option>
                <?php endforeach; ?>
            </select></div>
        <div style="flex:2"><label>Course</label>
            <select name="course_id" required>
                <?php foreach ($courseOpts as $co): ?>
                    <option value="<?= (int)$co['course_id'] ?>"><?= e($co['course_code'] . ' · ' . $co['course_title']) ?></option>
                <?php endforeach; ?>
            </select></div>
        <div><label>Academic year</label><input type="text" name="academic_year" value="<?= e(current_academic_year()) ?>" required></div>
        <div><label>Semester</label><select name="semester"><option>1</option><option>2</option></select></div>
        <div><button class="btn btn-good">Register</button></div>
    </div>
</form>
<?php endif; ?>

<div class="card">
<div class="table-wrap">
<table>
    <thead><tr><th>Student</th><th>Course</th><th>Year</th><th>Sem</th><th>Registered</th><?= is_admin() ? '<th></th>' : '' ?></tr></thead>
    <tbody>
    <?php foreach ($regs as $r): ?>
        <tr>
            <td><a href="student_view.php?id=<?= (int)$r['student_id'] ?>"><?= e($r['student_name']) ?></a> <small style="color:var(--muted)"><?= e($r['reg_no']) ?></small></td>
            <td><?= e($r['course_code']) ?> · <?= e($r['course_title']) ?></td>
            <td><?= e($r['academic_year']) ?></td>
            <td><?= (int)$r['semester'] ?></td>
            <td><?= e(substr((string)$r['registered_on'], 0, 10)) ?></td>
            <?php if (is_admin()): ?>
            <td>
                <form method="post" data-confirm="Remove this registration (and any marks)?">
                    <?= csrf_field() ?>
                    <input type="hidden" name="action" value="delete">
                    <input type="hidden" name="back" value="<?= e($courseFilter) ?>">
                    <input type="hidden" name="registration_id" value="<?= (int)$r['registration_id'] ?>">
                    <button class="btn btn-sm btn-danger">Remove</button>
                </form>
            </td>
            <?php endif; ?>
        </tr>
    <?php endforeach; ?>
    <?php if (!$regs): ?><tr><td colspan="6" class="empty">No registrations found.</td></tr><?php endif; ?>
    </tbody>
</table>
</div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
