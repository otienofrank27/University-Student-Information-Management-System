-- =============================================================================
-- University Student Information Management System
-- File: database/views.sql
-- =============================================================================

USE university_student_db;

CREATE OR REPLACE VIEW student_results_view AS
SELECT
  s.registration_number,
  CONCAT(s.first_name, ' ', s.last_name) AS student_name,
  c.course_code,
  c.course_name,
  CONCAT(sem.semester_name, ' (', sem.academic_year, ')') AS semester,
  er.exam_marks,
  er.assignment_marks,
  er.total_marks,
  er.grade,
  er.remarks
FROM examination_results er
INNER JOIN course_registrations cr ON er.registration_id = cr.registration_id
INNER JOIN students s ON cr.student_id = s.student_id
INNER JOIN courses c ON cr.course_id = c.course_id
INNER JOIN semesters sem ON cr.semester_id = sem.semester_id;

CREATE OR REPLACE VIEW student_registration_view AS
SELECT
  s.registration_number,
  CONCAT(s.first_name, ' ', s.last_name) AS student_name,
  c.course_code,
  c.course_name,
  sem.semester_name AS semester,
  sem.academic_year,
  cr.status AS registration_status
FROM course_registrations cr
INNER JOIN students s ON cr.student_id = s.student_id
INNER JOIN courses c ON cr.course_id = c.course_id
INNER JOIN semesters sem ON cr.semester_id = sem.semester_id;

CREATE OR REPLACE VIEW student_payment_view AS
SELECT
  s.registration_number,
  CONCAT(s.first_name, ' ', s.last_name) AS student_name,
  fp.amount_paid,
  fp.payment_date,
  fp.payment_method,
  fp.transaction_reference
FROM fee_payments fp
INNER JOIN students s ON fp.student_id = s.student_id;

CREATE OR REPLACE VIEW course_performance_view AS
SELECT
  c.course_code,
  c.course_name,
  COUNT(DISTINCT cr.registration_id) AS number_of_registered_students,
  ROUND(AVG(er.total_marks), 2) AS average_marks,
  MAX(er.total_marks) AS highest_marks,
  MIN(er.total_marks) AS lowest_marks
FROM courses c
LEFT JOIN course_registrations cr ON c.course_id = cr.course_id
LEFT JOIN examination_results er ON cr.registration_id = er.registration_id
GROUP BY c.course_id, c.course_code, c.course_name;
