-- =============================================================================
-- University Student Information Management System
-- File: database/stored_procedures.sql
-- =============================================================================

USE university_student_db;

DELIMITER //

DROP PROCEDURE IF EXISTS GetStudentDetails //
CREATE PROCEDURE GetStudentDetails(IN p_student_id INT)
BEGIN
  SELECT
    s.student_id,
    s.registration_number,
    s.first_name,
    s.last_name,
    s.gender,
    s.email,
    s.phone,
    s.course_of_study,
    s.year_of_study,
    s.date_registered,
    s.status,
    (SELECT COUNT(*) FROM course_registrations cr WHERE cr.student_id = s.student_id) AS total_courses_registered,
    (SELECT COALESCE(SUM(fp.amount_paid), 0.00) FROM fee_payments fp WHERE fp.student_id = s.student_id) AS total_fees_paid
  FROM students s
  WHERE s.student_id = p_student_id;
END //

DROP PROCEDURE IF EXISTS GetStudentResults //
CREATE PROCEDURE GetStudentResults(IN p_student_id INT)
BEGIN
  SELECT
    er.result_id,
    cr.registration_id,
    s.registration_number,
    CONCAT(s.first_name, ' ', s.last_name) AS student_name,
    c.course_code,
    c.course_name,
    c.credit_hours,
    sem.semester_name,
    sem.academic_year,
    er.exam_marks,
    er.assignment_marks,
    er.total_marks,
    er.grade,
    er.remarks
  FROM examination_results er
  INNER JOIN course_registrations cr ON er.registration_id = cr.registration_id
  INNER JOIN students s ON cr.student_id = s.student_id
  INNER JOIN courses c ON cr.course_id = c.course_id
  INNER JOIN semesters sem ON cr.semester_id = sem.semester_id
  WHERE s.student_id = p_student_id
  ORDER BY sem.start_date DESC, c.course_code ASC;
END //

DROP PROCEDURE IF EXISTS GetStudentPayments //
CREATE PROCEDURE GetStudentPayments(IN p_student_id INT)
BEGIN
  SELECT
    fp.payment_id,
    s.registration_number,
    CONCAT(s.first_name, ' ', s.last_name) AS student_name,
    fp.amount_paid,
    fp.payment_date,
    fp.payment_method,
    fp.transaction_reference
  FROM fee_payments fp
  INNER JOIN students s ON fp.student_id = s.student_id
  WHERE fp.student_id = p_student_id
  ORDER BY fp.payment_date DESC, fp.payment_id DESC;
END //

DROP PROCEDURE IF EXISTS GetCourseRegistrations //
CREATE PROCEDURE GetCourseRegistrations(IN p_semester_id INT)
BEGIN
  SELECT
    cr.registration_id,
    s.student_id,
    s.registration_number,
    CONCAT(s.first_name, ' ', s.last_name) AS student_name,
    c.course_id,
    c.course_code,
    c.course_name,
    sem.semester_id,
    sem.semester_name,
    sem.academic_year,
    cr.registration_date,
    cr.status
  FROM course_registrations cr
  INNER JOIN students s ON cr.student_id = s.student_id
  INNER JOIN courses c ON cr.course_id = c.course_id
  INNER JOIN semesters sem ON cr.semester_id = sem.semester_id
  WHERE (p_semester_id IS NULL OR cr.semester_id = p_semester_id)
  ORDER BY sem.start_date DESC, c.course_code ASC, s.last_name ASC;
END //

DROP PROCEDURE IF EXISTS GetCourseStudentList //
CREATE PROCEDURE GetCourseStudentList(IN p_course_id INT, IN p_semester_id INT)
BEGIN
  SELECT
    cr.registration_id,
    s.student_id,
    s.registration_number,
    CONCAT(s.first_name, ' ', s.last_name) AS student_name,
    s.email,
    s.course_of_study,
    s.year_of_study,
    cr.registration_date,
    cr.status AS registration_status,
    er.total_marks,
    er.grade,
    er.remarks
  FROM course_registrations cr
  INNER JOIN students s ON cr.student_id = s.student_id
  LEFT JOIN examination_results er ON cr.registration_id = er.registration_id
  WHERE cr.course_id = p_course_id
    AND cr.semester_id = p_semester_id
  ORDER BY s.last_name ASC, s.first_name ASC;
END //

DELIMITER ;
