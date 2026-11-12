<?php
require __DIR__ . '/includes/bootstrap.php';
require_login();

$id = (int)($_GET['id'] ?? 0);
$profile = null;
$courses = [];
$error = '';

try {
    // Stored procedure returns two result sets: profile, then courses + marks
    $st = db()->prepare('CALL sp_get_student_details(?)');
    $st->execute([$id]);
    $profile = $st->fetch();
    $st->nextRowset();
    $courses = $st->fetchAll();
    $st->closeCursor();
} catch (PDOException $e) {
    $error = db_error($e);
}

if (!$profile) {
    flash('error', $error ?: 'Student not found.');
    redirect('students.php');
}

$fee = null;
$payments = [];
if (is_admin()) {
    $f = db()->prepare('SELECT * FROM vw_fee_balance WHERE student_id = ?');
    $f->execute([$id]);
    $fee = $f->fetch();
    $p = db()->prepare('SELECT payment_date, amount, method, reference_no FROM payments
                        WHERE student_id = ? ORDER BY payment_date DESC');
    $p->execute([$id]);
    $payments = $p->fetchAll();
}

// weighted average mark (marks x credit hours) for entries that have marks
$sumW = 0.0;
$sumC = 0;
foreach ($courses as $c) {
    if ($c['marks'] !== null) {
        $sumW += (float)$c['marks'] * (int)$c['credit_hours'];
        $sumC += (int)$c['credit_hours'];
    }
}
$avg = $sumC ? round($sumW / $sumC, 2) : null;

$title = $profile['full_name'];
$active = 'students';
require __DIR__ . '/includes/header.php';
?>
<div class="page-head">
    <div>
        <h1><?= e($profile['full_name']) ?></h1>
        <p class="subtitle"><?= e($profile['reg_no']) ?> · <?= e($profile['dept_name']) ?></p>
    </div>
    <div class="actions">
        <a class="btn btn-ghost" href="students.php">All students</a>
        <?php if (is_admin()): ?><a class="btn" href="student_form.php?id=<?= (int)$profile['student_id'] ?>">Edit</a><?php endif; ?>
    </div>
</div>

<div class="grid grid-2">
    <div class="card">
        <h2>Profile</h2>
        <dl class="kv">
            <dt>Email</dt><dd><?= e($profile['email']) ?></dd>
            <dt>Phone</dt><dd><?= e($profile['phone'] ?: '-') ?></dd>
            <dt>Date of birth</dt><dd><?= e($profile['date_of_birth']) ?></dd>
            <dt>Gender</dt><dd><?= e($profile['gender']) ?></dd>
            <dt>Year of study</dt><dd><?= (int)$profile['year_of_study'] ?></dd>
            <dt>Admitted</dt><dd><?= e($profile['admission_date']) ?></dd>
            <dt>Status</dt><dd><span class="badge <?= $profile['status'] === 'active' ? 'badge-good' : 'badge-bad' ?>"><?= e($profile['status']) ?></span></dd>
            <dt>Weighted average</dt><dd><?= $avg === null ? '-' : e(number_format($avg, 2)) . '%' ?></dd>
        </dl>
    </div>

    <?php if ($fee): ?>
    <div class="card">
        <h2>Fees</h2>
        <dl class="kv">
            <dt>Fee charged</dt><dd><?= e(money($fee['fee_charged'])) ?></dd>
            <dt>Total paid</dt><dd><?= e(money($fee['total_paid'])) ?></dd>
            <dt>Balance</dt><dd class="<?= (float)$fee['balance'] > 0 ? 'neg' : 'pos' ?>"><?= e(money($fee['balance'])) ?></dd>
        </dl>
        <?php if ($payments): ?>
        <table style="margin-top:12px">
            <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr></thead>
            <tbody>
            <?php foreach ($payments as $pay): ?>
                <tr><td><?= e($pay['payment_date']) ?></td><td><?= e($pay['method']) ?></td>
                    <td><?= e($pay['reference_no']) ?></td><td class="num"><?= e(number_format((float)$pay['amount'], 2)) ?></td></tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        <?php endif; ?>
    </div>
    <?php endif; ?>
</div>

<div class="card">
    <h2>Registered courses and results</h2>
    <div class="table-wrap">
    <table>
        <thead><tr><th>Code</th><th>Course</th><th>Credits</th><th>Year</th><th>Sem</th><th class="num">Marks</th><th>Grade</th></tr></thead>
        <tbody>
        <?php foreach ($courses as $c): ?>
            <tr>
                <td><?= e($c['course_code']) ?></td>
                <td><?= e($c['course_title']) ?></td>
                <td><?= (int)$c['credit_hours'] ?></td>
                <td><?= e($c['academic_year']) ?></td>
                <td><?= (int)$c['semester'] ?></td>
                <td class="num"><?= $c['marks'] === null ? '<small style="color:var(--muted)">pending</small>' : e(number_format((float)$c['marks'], 2)) ?></td>
                <td><?= grade_badge($c['grade']) ?></td>
            </tr>
        <?php endforeach; ?>
        <?php if (!$courses): ?><tr><td colspan="7" class="empty">Not registered for any course yet.</td></tr><?php endif; ?>
        </tbody>
    </table>
    </div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
