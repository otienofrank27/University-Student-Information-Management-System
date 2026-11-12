<?php
require __DIR__ . '/includes/bootstrap.php';
require_login();

$pdo = db();
$me = current_user();
$tab = ($_GET['tab'] ?? 'enter') === 'report' ? 'report' : 'enter';
$courseFilter = trim($_GET['course'] ?? '');

/* ---------- save marks (lecturer: own courses only; admin: any) ---------- */
if (is_post()) {
    csrf_verify();
    $regId = (int)($_POST['registration_id'] ?? 0);
    $raw = trim((string)($_POST['marks'] ?? ''));
    $back = 'results.php' . (!empty($_POST['course']) ? '?course=' . urlencode($_POST['course']) : '');

    $st = $pdo->prepare('SELECT lecturer_id FROM vw_registration_details WHERE registration_id = ?');
    $st->execute([$regId]);
    $owner = $st->fetch();

    if (!$owner) {
        flash('error', 'Registration not found.');
    } elseif (!is_admin() && (int)$owner['lecturer_id'] !== $me['id']) {
        flash('error', 'You can only enter marks for courses assigned to you.');
    } elseif ($raw === '' || !is_numeric($raw)) {
        flash('error', 'Enter the marks as a number.');
    } else {
        try {
            // The trigger trg_results_before_insert/update rejects values outside 0-100.
            $pdo->prepare('INSERT INTO results (registration_id, marks, recorded_by) VALUES (?, ?, ?)
                           ON DUPLICATE KEY UPDATE marks = VALUES(marks), recorded_by = VALUES(recorded_by), recorded_at = NOW()')
                ->execute([$regId, $raw, $me['id']]);
            flash('success', 'Marks saved.');
        } catch (PDOException $e) {
            flash('error', db_error($e));
        }
    }
    redirect($back);
}

/* ---------- data for the page ---------- */
$courseList = $pdo->query('SELECT course_code, course_title, lecturer_id FROM courses ORDER BY course_code')->fetchAll();
if (!is_admin() && $tab === 'enter') {
    $courseList = array_values(array_filter($courseList, fn($c) => (int)$c['lecturer_id'] === $me['id']));
}

$rows = [];
if ($tab === 'enter') {
    $sql = 'SELECT rd.registration_id, rd.student_name, rd.reg_no, rd.course_code, rd.course_title,
                   rd.academic_year, rd.semester, r.marks,
                   CASE WHEN r.marks IS NULL THEN NULL ELSE fn_grade(r.marks) END AS grade
            FROM vw_registration_details rd
            LEFT JOIN results r ON r.registration_id = rd.registration_id
            WHERE 1=1';
    $params = [];
    if (!is_admin()) {
        $sql .= ' AND rd.lecturer_id = ?';
        $params[] = $me['id'];
    }
    if ($courseFilter !== '') {
        $sql .= ' AND rd.course_code = ?';
        $params[] = $courseFilter;
    }
    $sql .= ' ORDER BY rd.course_code, rd.academic_year DESC, rd.semester, rd.student_name';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll();
} else {
    // the required "examination results" view
    $sql = 'SELECT * FROM vw_student_results';
    $params = [];
    if ($courseFilter !== '') {
        $sql .= ' WHERE course_code = ?';
        $params[] = $courseFilter;
    }
    $sql .= ' ORDER BY student_name, academic_year DESC, semester, course_code';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll();
}

$title = 'Results';
$active = 'results';
require __DIR__ . '/includes/header.php';
?>
<div class="page-head">
    <div>
        <h1>Examination results</h1>
        <p class="subtitle"><?= is_admin() ? 'Enter or correct marks for any course.' : 'Enter marks for the courses assigned to you.' ?> Marks must be between 0 and 100.</p>
    </div>
    <form class="search" method="get">
        <input type="hidden" name="tab" value="<?= e($tab) ?>">
        <select name="course" data-autosubmit>
            <option value="">All <?= is_admin() || $tab === 'report' ? '' : 'my ' ?>courses</option>
            <?php foreach ($courseList as $co): ?>
                <option value="<?= e($co['course_code']) ?>" <?= $courseFilter === $co['course_code'] ? 'selected' : '' ?>><?= e($co['course_code'] . ' · ' . $co['course_title']) ?></option>
            <?php endforeach; ?>
        </select>
    </form>
</div>

<div class="tabs">
    <a class="<?= $tab === 'enter' ? 'active' : '' ?>" href="results.php?tab=enter<?= $courseFilter !== '' ? '&course=' . urlencode($courseFilter) : '' ?>">Enter marks</a>
    <a class="<?= $tab === 'report' ? 'active' : '' ?>" href="results.php?tab=report<?= $courseFilter !== '' ? '&course=' . urlencode($courseFilter) : '' ?>">Results report</a>
</div>

<div class="card">
<div class="table-wrap">
<?php if ($tab === 'enter'): ?>
<table>
    <thead><tr><th>Student</th><th>Course</th><th>Year / Sem</th><th>Grade</th><th>Marks</th></tr></thead>
    <tbody>
    <?php foreach ($rows as $r): ?>
        <tr>
            <td><?= e($r['student_name']) ?> <small style="color:var(--muted)"><?= e($r['reg_no']) ?></small></td>
            <td><?= e($r['course_code']) ?> · <?= e($r['course_title']) ?></td>
            <td><?= e($r['academic_year']) ?> / <?= (int)$r['semester'] ?></td>
            <td><?= grade_badge($r['grade']) ?></td>
            <td>
                <form method="post" class="inline-form" style="gap:6px">
                    <?= csrf_field() ?>
                    <input type="hidden" name="registration_id" value="<?= (int)$r['registration_id'] ?>">
                    <input type="hidden" name="course" value="<?= e($courseFilter) ?>">
                    <input type="number" class="marks-input" name="marks" step="0.01" required
                           value="<?= $r['marks'] === null ? '' : e($r['marks']) ?>" placeholder="0-100">
                    <button class="btn btn-sm"><?= $r['marks'] === null ? 'Save' : 'Update' ?></button>
                </form>
            </td>
        </tr>
    <?php endforeach; ?>
    <?php if (!$rows): ?><tr><td colspan="5" class="empty">No registrations to show.</td></tr><?php endif; ?>
    </tbody>
</table>
<?php else: ?>
<table>
    <thead><tr><th>Student</th><th>Course</th><th>Credits</th><th>Year / Sem</th><th class="num">Marks</th><th>Grade</th><th>Remark</th></tr></thead>
    <tbody>
    <?php foreach ($rows as $r): ?>
        <tr>
            <td><a href="student_view.php?id=<?= (int)$r['student_id'] ?>"><?= e($r['student_name']) ?></a> <small style="color:var(--muted)"><?= e($r['reg_no']) ?></small></td>
            <td><?= e($r['course_code']) ?> · <?= e($r['course_title']) ?></td>
            <td><?= (int)$r['credit_hours'] ?></td>
            <td><?= e($r['academic_year']) ?> / <?= (int)$r['semester'] ?></td>
            <td class="num"><?= e(number_format((float)$r['marks'], 2)) ?></td>
            <td><?= grade_badge($r['grade']) ?></td>
            <td><span class="badge <?= $r['remark'] === 'Pass' ? 'badge-good' : 'badge-bad' ?>"><?= e($r['remark']) ?></span></td>
        </tr>
    <?php endforeach; ?>
    <?php if (!$rows): ?><tr><td colspan="7" class="empty">No results recorded yet.</td></tr><?php endif; ?>
    </tbody>
</table>
<?php endif; ?>
</div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
