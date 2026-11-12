<?php
require __DIR__ . '/includes/bootstrap.php';
require_login();

if (is_post()) {
    require_admin();
    csrf_verify();
    if (($_POST['action'] ?? '') === 'delete') {
        try {
            db()->prepare('DELETE FROM courses WHERE course_id = ?')->execute([(int)($_POST['course_id'] ?? 0)]);
            flash('success', 'Course deleted.');
        } catch (PDOException $e) {
            flash('error', db_code($e) === 1451
                ? 'This course cannot be deleted because students are registered for it.'
                : 'Could not delete: ' . db_error($e));
        }
    }
    redirect('courses.php');
}

$courses = db()->query('SELECT course_id, course_code, course_title, credit_hours, dept_name, lecturer_id, lecturer_name
                        FROM vw_course_details ORDER BY course_code')->fetchAll();
$me = current_user();

$title = 'Courses';
$active = 'courses';
require __DIR__ . '/includes/header.php';
?>
<div class="page-head">
    <div><h1>Courses</h1><p class="subtitle"><?= count($courses) ?> courses offered</p></div>
    <?php if (is_admin()): ?><a class="btn btn-good" href="course_form.php">+ Add course</a><?php endif; ?>
</div>

<div class="card">
<div class="table-wrap">
<table>
    <thead><tr><th>Code</th><th>Title</th><th>Credits</th><th>Department</th><th>Lecturer</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($courses as $c): ?>
        <tr>
            <td><strong><?= e($c['course_code']) ?></strong></td>
            <td><?= e($c['course_title']) ?></td>
            <td><?= (int)$c['credit_hours'] ?></td>
            <td><?= e($c['dept_name']) ?></td>
            <td><?= e($c['lecturer_name'] ?: 'Unassigned') ?>
                <?php if (!is_admin() && (int)$c['lecturer_id'] === $me['id']): ?><span class="badge badge-good">yours</span><?php endif; ?></td>
            <td>
                <?php if (is_admin()): ?>
                <div class="actions">
                    <a class="btn btn-sm btn-ghost" href="course_form.php?id=<?= (int)$c['course_id'] ?>">Edit</a>
                    <form method="post" data-confirm="Delete this course?">
                        <?= csrf_field() ?>
                        <input type="hidden" name="action" value="delete">
                        <input type="hidden" name="course_id" value="<?= (int)$c['course_id'] ?>">
                        <button class="btn btn-sm btn-danger">Delete</button>
                    </form>
                </div>
                <?php endif; ?>
            </td>
        </tr>
    <?php endforeach; ?>
    <?php if (!$courses): ?><tr><td colspan="6" class="empty">No courses yet.</td></tr><?php endif; ?>
    </tbody>
</table>
</div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
