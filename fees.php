<?php
require __DIR__ . '/includes/bootstrap.php';
require_admin();

$pdo = db();
$me = current_user();
$methods = ['M-Pesa', 'Bank', 'Cash', 'Cheque'];

if (is_post()) {
    csrf_verify();
    $action = $_POST['action'] ?? '';

    if ($action === 'pay') {
        $amount = trim((string)($_POST['amount'] ?? ''));
        $ref = trim((string)($_POST['reference_no'] ?? ''));
        $date = trim((string)($_POST['payment_date'] ?? ''));
        $method = $_POST['method'] ?? '';

        if (!is_numeric($amount) || $ref === '' || $date === '' || !in_array($method, $methods, true)) {
            flash('error', 'Fill in the amount, date, method and reference number.');
        } else {
            try {
                // trigger trg_payments_before_insert rejects amounts <= 0
                $pdo->prepare('INSERT INTO payments (student_id, amount, payment_date, method, reference_no, received_by)
                               VALUES (?,?,?,?,?,?)')
                    ->execute([(int)$_POST['student_id'], $amount, $date, $method, $ref, $me['id']]);
                flash('success', 'Payment recorded.');
            } catch (PDOException $e) {
                flash('error', db_code($e) === 1062 ? 'That reference number has already been recorded.' : db_error($e));
            }
        }
    }
    redirect('fees.php');
}

$students = $pdo->query('SELECT student_id, reg_no, first_name, last_name FROM students ORDER BY last_name, first_name')->fetchAll();
$balances = $pdo->query('SELECT * FROM vw_fee_balance ORDER BY balance DESC, student_name')->fetchAll();
$payments = $pdo->query('SELECT p.payment_date, p.amount, p.method, p.reference_no,
                                CONCAT(s.first_name, " ", s.last_name) AS student_name, s.reg_no
                         FROM payments p JOIN students s ON s.student_id = p.student_id
                         ORDER BY p.payment_date DESC, p.payment_id DESC LIMIT 15')->fetchAll();

$title = 'Fees';
$active = 'fees';
require __DIR__ . '/includes/header.php';
?>
<div class="page-head"><div><h1>Fee management</h1><p class="subtitle">Record payments and track balances.</p></div></div>

<form method="post" class="card">
    <h2>Record a payment</h2>
    <?= csrf_field() ?>
    <input type="hidden" name="action" value="pay">
    <div class="inline-form">
        <div style="flex:2"><label>Student</label>
            <select name="student_id" required>
                <?php foreach ($students as $s): ?>
                    <option value="<?= (int)$s['student_id'] ?>"><?= e($s['reg_no'] . ' · ' . $s['first_name'] . ' ' . $s['last_name']) ?></option>
                <?php endforeach; ?>
            </select></div>
        <div><label>Amount (KES)</label><input type="number" name="amount" step="0.01" min="0.01" required></div>
        <div><label>Date</label><input type="date" name="payment_date" value="<?= date('Y-m-d') ?>" required></div>
        <div><label>Method</label>
            <select name="method"><?php foreach ($methods as $m): ?><option><?= e($m) ?></option><?php endforeach; ?></select></div>
        <div><label>Reference no.</label><input type="text" name="reference_no" required></div>
        <div><button class="btn btn-good">Record</button></div>
    </div>
</form>

<div class="card">
    <h2>Fee balances</h2>
    <div class="table-wrap">
    <table>
        <thead><tr><th>Student</th><th>Department</th><th class="num">Charged</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead>
        <tbody>
        <?php foreach ($balances as $b): ?>
            <tr>
                <td><a href="student_view.php?id=<?= (int)$b['student_id'] ?>"><?= e($b['student_name']) ?></a> <small style="color:var(--muted)"><?= e($b['reg_no']) ?></small></td>
                <td><?= e($b['dept_name']) ?></td>
                <td class="num"><?= e(number_format((float)$b['fee_charged'], 2)) ?></td>
                <td class="num"><?= e(number_format((float)$b['total_paid'], 2)) ?></td>
                <td class="num <?= (float)$b['balance'] > 0 ? 'neg' : 'pos' ?>"><?= e(number_format((float)$b['balance'], 2)) ?></td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
    </div>
</div>

<div class="card">
    <h2>Recent payments</h2>
    <div class="table-wrap">
    <table>
        <thead><tr><th>Date</th><th>Student</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr></thead>
        <tbody>
        <?php foreach ($payments as $p): ?>
            <tr>
                <td><?= e($p['payment_date']) ?></td>
                <td><?= e($p['student_name']) ?> <small style="color:var(--muted)"><?= e($p['reg_no']) ?></small></td>
                <td><?= e($p['method']) ?></td>
                <td><?= e($p['reference_no']) ?></td>
                <td class="num"><?= e(number_format((float)$p['amount'], 2)) ?></td>
            </tr>
        <?php endforeach; ?>
        <?php if (!$payments): ?><tr><td colspan="5" class="empty">No payments recorded.</td></tr><?php endif; ?>
        </tbody>
    </table>
    </div>
</div>
<?php require __DIR__ . '/includes/footer.php'; ?>
