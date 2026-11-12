<?php
require __DIR__ . '/includes/bootstrap.php';
require_admin();

$pdo = db();
$id = (int)($_GET['id'] ?? $_POST['student_id'] ?? 0);
$depts = $pdo->query('SELECT department_id, dept_name FROM departments ORDER BY dept_name')->fetchAll();

$s = [
    'reg_no' => '', 'first_name' => '', 'last_name' => '', 'email' => '', 'phone' => '',
    'date_of_birth' => '', 'gender' => 'Male', 'department_id' => $depts[0]['department_id'] ?? 1,
    'year_of_study' => 1, 'admission_date' => date('Y-m-d'), 'status' => 'active',
];

if ($id && !is_post()) {
    $st = $pdo->prepare('SELECT * FROM students WHERE student_id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) {
        flash('error', 'Student not found.');
        redirect('students.php');
    }
    $s = $row;
}

$errors = [];
if (is_post()) {
    csrf_verify();
    foreach (array_keys($s) as $k) {
        $s[$k] = trim((string)($_POST[$k] ?? ''));
    }
    if ($s['reg_no'] === '' || $s['first_name'] === '' || $s['last_name'] === '') {
        $errors[] = 'Registration number, first name and last name are required.';
    }
    if (!filter_var($s['email'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Enter a valid email address.';
    }
    if ($s['date_of_birth'] === '' || $s['admission_date'] === '') {
        $errors[] = 'Date of birth and admission date are required.';
    }
    if (!in_array($s['gender'], ['Male', 'Female', 'Other'], true)) {
        $errors[] = 'Choose a gender.';
    }
    if (!in_array($s['status'], ['active', 'suspended', 'graduated'], true)) {
        $errors[] = 'Choose a status.';
    }
    $year = (int)$s['year_of_study'];
    if ($year < 1 || $year > 8) {
        $errors[] = 'Year of study must be between 1 and 8.';
    }

    if (!$errors) {
        $params = [
            $s['reg_no'], $s['first_name'], $s['last_name'], $s['email'],
            $s['phone'] !== '' ? $s['phone'] : null,
            $s['date_of_birth'], $s['gender'], (int)$s['department_id'], $year,
            $s['admission_date'], $s['status'],
        ];
        try {
            if ($id) {
                $params[] = $id;
                $pdo->prepare('UPDATE students SET reg_no=?, first_name=?, last_name=?, email=?, phone=?,
                               date_of_birth=?, gender=?, department_id=?, year_of_study=?, admission_date=?, status=?
                               WHERE student_id=?')->execute($params);
                flash('success', 'Student updated.');
            } else {
                $pdo->prepare('INSERT INTO students (reg_no, first_name, last_name, email, phone,
                               date_of_birth, gender, department_id, year_of_study, admission_date, status)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)')->execute($params);
                flash('success', 'Student added.');
            }
            redirect('students.php');
        } catch (PDOException $e) {
            $errors[] = db_code($e) === 1062
                ? 'That registration number or email already belongs to another student.'
                : db_error($e);
        }
    }
}

$title = $id ? 'Edit student' : 'Add student';
$active = 'students';
require __DIR__ . '/includes/header.php';
?>
<div class="page-head"><div><h1><?= e($title) ?></h1></div><a class="btn btn-ghost" href="students.php">Back</a></div>

<?php foreach ($errors as $err): ?><div class="alert alert-error"><?= e($err) ?></div><?php endforeach; ?>

<form method="post" class="card">
    <?= csrf_field() ?>
    <input type="hidden" name="student_id" value="<?= $id ?>">
    <div class="form-grid">
        <div><label>Registration no.</label><input type="text" name="reg_no" value="<?= e($s['reg_no']) ?>" placeholder="CS/2025/010" required></div>
        <div><label>First name</label><input type="text" name="first_name" value="<?= e($s['first_name']) ?>" required></div>
        <div><label>Last name</label><input type="text" name="last_name" value="<?= e($s['last_name']) ?>" required></div>
        <div><label>Email</label><input type="email" name="email" value="<?= e($s['email']) ?>" required></div>
        <div><label>Phone</label><input type="text" name="phone" value="<?= e($s['phone']) ?>"></div>
        <div><label>Date of birth</label><input type="date" name="date_of_birth" value="<?= e($s['date_of_birth']) ?>" required></div>
        <div><label>Gender</label>
            <select name="gender">
                <?php foreach (['Male', 'Female', 'Other'] as $g): ?>
                    <option <?= $s['gender'] === $g ? 'selected' : '' ?>><?= $g ?></option>
                <?php endforeach; ?>
            </select></div>
        <div><label>Department</label>
            <select name="department_id">
                <?php foreach ($depts as $d): ?>
                    <option value="<?= (int)$d['department_id'] ?>" <?= (int)$s['department_id'] === (int)$d['department_id'] ? 'selected' : '' ?>><?= e($d['dept_name']) ?></option>
                <?php endforeach; ?>
            </select></div>
        <div><label>Year of study</label><input type="number" name="year_of_study" min="1" max="8" value="<?= e($s['year_of_study']) ?>"></div>
        <div><label>Admission date</label><input type="date" name="admission_date" value="<?= e($s['admission_date']) ?>" required></div>
        <div><label>Status</label>
            <select name="status">
                <?php foreach (['active', 'suspended', 'graduated'] as $st): ?>
                    <option <?= $s['status'] === $st ? 'selected' : '' ?>><?= $st ?></option>
                <?php endforeach; ?>
            </select></div>
    </div>
    <div class="form-actions">
        <button class="btn btn-good">Save student</button>
        <a class="btn btn-ghost" href="students.php">Cancel</a>
    </div>
</form>
<?php require __DIR__ . '/includes/footer.php'; ?>
