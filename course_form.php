<?php
require __DIR__ . '/includes/bootstrap.php';
require_admin();

$pdo = db();
$id = (int)($_GET['id'] ?? $_POST['course_id'] ?? 0);
$depts = $pdo->query('SELECT department_id, dept_name FROM departments ORDER BY dept_name')->fetchAll();
$lecturers = $pdo->query("SELECT user_id, full_name FROM users WHERE role = 'lecturer' AND is_active = 1 ORDER BY full_name")->fetchAll();

$c = ['course_code' => '', 'course_title' => '', 'credit_hours' => 3,
      'department_id' => $depts[0]['department_id'] ?? 1, 'lecturer_id' => ''];

if ($id && !is_post()) {
    $st = $pdo->prepare('SELECT * FROM courses WHERE course_id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) {
        flash('error', 'Course not found.');
        redirect('courses.php');
    }
    $c = $row;
}

$errors = [];
if (is_post()) {
    csrf_verify();
    foreach (array_keys($c) as $k) {
        $c[$k] = trim((string)($_POST[$k] ?? ''));
    }
    $credits = (int)$c['credit_hours'];
    if ($c['course_code'] === '' || $c['course_title'] === '') {
        $errors[] = 'Course code and title are required.';
    }
    if ($credits < 1 || $credits > 12) {
        $errors[] = 'Credit hours must be between 1 and 12.';
    }
    if (!$errors) {
        $params = [strtoupper($c['course_code']), $c['course_title'], $credits,
                   (int)$c['department_id'], $c['lecturer_id'] !== '' ? (int)$c['lecturer_id'] : null];
        try {
            if ($id) {
                $params[] = $id;
                $pdo->prepare('UPDATE courses SET course_code=?, course_title=?, credit_hours=?, department_id=?, lecturer_id=?
                               WHERE course_id=?')->execute($params);
                flash('success', 'Course updated.');
            } else {
                $pdo->prepare('INSERT INTO courses (course_code, course_title, credit_hours, department_id, lecturer_id)
                               VALUES (?,?,?,?,?)')->execute($params);
                flash('success', 'Course added.');
            }
            redirect('courses.php');
        } catch (PDOException $e) {
            $errors[] = db_code($e) === 1062 ? 'That course code already exists.' : db_error($e);
        }
    }
}

$title = $id ? 'Edit course' : 'Add course';
$active = 'courses';
require __DIR__ . '/includes/header.php';
?>
<div class="page-head"><div><h1><?= e($title) ?></h1></div><a class="btn btn-ghost" href="courses.php">Back</a></div>
<?php foreach ($errors as $err): ?><div class="alert alert-error"><?= e($err) ?></div><?php endforeach; ?>

<form method="post" class="card">
    <?= csrf_field() ?>
    <input type="hidden" name="course_id" value="<?= $id ?>">
    <div class="form-grid">
        <div><label>Course code</label><input type="text" name="course_code" value="<?= e($c['course_code']) ?>" placeholder="CSC301" required></div>
        <div><label>Course title</label><input type="text" name="course_title" value="<?= e($c['course_title']) ?>" required></div>
        <div><label>Credit hours</label><input type="number" name="credit_hours" min="1" max="12" value="<?= e($c['credit_hours']) ?>"></div>
        <div><label>Department</label>
            <select name="department_id">
                <?php foreach ($depts as $d): ?>
                    <option value="<?= (int)$d['department_id'] ?>" <?= (int)$c['department_id'] === (int)$d['department_id'] ? 'selected' : '' ?>><?= e($d['dept_name']) ?></option>
                <?php endforeach; ?>
            </select></div>
        <div><label>Lecturer</label>
            <select name="lecturer_id">
                <option value="">Unassigned</option>
                <?php foreach ($lecturers as $l): ?>
                    <option value="<?= (int)$l['user_id'] ?>" <?= (string)$c['lecturer_id'] === (string)$l['user_id'] ? 'selected' : '' ?>><?= e($l['full_name']) ?></option>
                <?php endforeach; ?>
            </select></div>
    </div>
    <div class="form-actions">
        <button class="btn btn-good">Save course</button>
        <a class="btn btn-ghost" href="courses.php">Cancel</a>
    </div>
</form>
<?php require __DIR__ . '/includes/footer.php'; ?>
