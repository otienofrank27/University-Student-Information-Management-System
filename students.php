<?php
require __DIR__ . '/includes/bootstrap.php';
require_login();

if (is_post()) {
    require_admin();
    csrf_verify();
    if (($_POST['action'] ?? '') === 'delete') {
        try {
            db()->prepare('DELETE FROM students WHERE student_id = ?')->execute([(int)($_POST['student_id'] ?? 0)]);
            flash('success', 'Student deleted.');
        } catch (PDOException $e) {
            flash('error', db_code($e) === 1451
                ? 'This student cannot be deleted because payment records exist for them.'
                : 'Could not delete: ' . db_error($e));
        }
    }
    redirect('students.php');
}

$q = trim($_GET['q'] ?? '');
if ($q !== '') {
    // stored procedure that searches the indexed name / reg_no columns
    $st = db()->prepare('CALL sp_search_students(?)');
    $st->execute([$q]);
    $students = $st->fetchAll();
    $st->closeCursor();
} else {
    $students = db()->query('SELECT s.student_id, s.reg_no, s.first_name, s.last_name, s.email,
                                    d.dept_name, s.year_of_study, s.status
                             FROM students s JOIN departments d ON d.department_id = s.department_id
                             ORDER BY s.last_name, s.first_name')->fetchAll();
}

$title = 'Students';
$active = 'students';
require __DIR__ . '/includes/header.php';
?>
<div class="page-head">
    <div>
        <h1>Students</h1>
        <p class="subtitle"><?= count($students) ?> record<?= count($students) === 1 ? '' : 's' ?><?= $q !== '' ? ' matching “' . e($q) . '”' : '' ?></p>
    </div>
    <div class="actions">
        <form class="search" method="get">
            <input type="text" name="q" value="<?= e($q) ?>" placeholder="Search name or reg. no.">
            <button class="btn">Search</button>
            <?php if ($q !== ''): ?><a class="btn btn-ghost" href="students.php">Clear</a><?php endif; ?>
        </form>
        <?php if (is_admin()): ?><a class="btn btn-good" href="student_form.php">+ Add student</a><?php endif; ?>
    </div>
</div>

<div class="card">
<div class="table-wrap">
<table>
    <thead><tr><th>Reg. no</th><th>Name</th><th>Department</th><th>Year</th><th>Status</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($students as $s): ?>
        <tr>
            <td><?= e($s['reg_no']) ?></td>
            <td><a href="student_view.php?id=<?= (int)$s['student_id'] ?>"><?= e($s['first_name'] . ' ' . $s['last_name']) ?></a><br>
                <small style="color:var(--muted)"><?= e($s['email']) ?></small></td>
            <td><?= e($s['dept_name']) ?></td>
            <td><?= (int)$s['year_of_study'] ?></td>
            <td><span class="badge <?= $s['status'] === 'active' ? 'badge-good' : ($s['status'] === 'suspended' ? 'badge-bad' : '') ?>"><?= e($s['status']) ?></span></td>
            <td>
                <div class="actions">
                    <a class="btn btn-sm btn-ghost" href="student_view.php?id=<?= (int)$s['student_id'] ?>">View</a>
                    <?php if (is_admin()): ?>
                        <a class="btn btn-sm btn-ghost" href="student_form.php?id=<?= (int)$s['student_id'] ?>">Edit</a>
                        <form method="post" data-confirm="Delete this student and their registrations?">
                            <?= csrf_field() ?>
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="student_id" value="<?= (int)$s['student_id'] ?>">
                            <button class="btn btn-sm btn-danger">Delete</button>
                        </form>
                    <?php endif; ?>
                </div>
            </td>
        </tr>
    <?php endforeach; ?>
    <?php if (!$students): ?><tr><td colspan="6" class="empty">No students found.</td></tr><?php endif; ?>
    </tbody>
</table>
</div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
