-- ============================================================
-- 03_triggers_procedures_views.sql
-- Function, triggers, stored procedures and views
-- Import with phpMyAdmin (Import tab) or:  mysql -u root < this_file.sql
-- ============================================================
USE university_sis;

DELIMITER $$

-- ------------------------------------------------------------
-- FUNCTION: convert marks to a letter grade
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_grade$$
CREATE FUNCTION fn_grade(p_marks DECIMAL(5,2))
RETURNS CHAR(1)
DETERMINISTIC NO SQL
BEGIN
    RETURN CASE
        WHEN p_marks >= 70 THEN 'A'
        WHEN p_marks >= 60 THEN 'B'
        WHEN p_marks >= 50 THEN 'C'
        WHEN p_marks >= 40 THEN 'D'
        ELSE 'E'
    END;
END$$

-- ------------------------------------------------------------
-- TRIGGERS: reject examination marks outside 0-100
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_results_before_insert$$
CREATE TRIGGER trg_results_before_insert
BEFORE INSERT ON results
FOR EACH ROW
BEGIN
    IF NEW.marks < 0 OR NEW.marks > 100 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid marks: examination marks must be between 0 and 100.';
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_results_before_update$$
CREATE TRIGGER trg_results_before_update
BEFORE UPDATE ON results
FOR EACH ROW
BEGIN
    IF NEW.marks < 0 OR NEW.marks > 100 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid marks: examination marks must be between 0 and 100.';
    END IF;
END$$

-- Extra trigger: a payment must be a positive amount
DROP TRIGGER IF EXISTS trg_payments_before_insert$$
CREATE TRIGGER trg_payments_before_insert
BEFORE INSERT ON payments
FOR EACH ROW
BEGIN
    IF NEW.amount <= 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid payment: amount must be greater than zero.';
    END IF;
END$$

-- ------------------------------------------------------------
-- STORED PROCEDURE: retrieve student details
--   result set 1 = profile, result set 2 = courses and marks
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_get_student_details$$
CREATE PROCEDURE sp_get_student_details(IN p_student_id INT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM students WHERE student_id = p_student_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Student not found.';
    END IF;

    SELECT s.student_id, s.reg_no,
           CONCAT(s.first_name, ' ', s.last_name) AS full_name,
           s.email, s.phone, s.date_of_birth, s.gender,
           d.dept_name, s.year_of_study, s.admission_date, s.status
    FROM students s
    JOIN departments d ON d.department_id = s.department_id
    WHERE s.student_id = p_student_id;

    SELECT c.course_code, c.course_title, c.credit_hours,
           r.academic_year, r.semester, res.marks,
           CASE WHEN res.marks IS NULL THEN NULL ELSE fn_grade(res.marks) END AS grade
    FROM registrations r
    JOIN courses c        ON c.course_id = r.course_id
    LEFT JOIN results res ON res.registration_id = r.registration_id
    WHERE r.student_id = p_student_id
    ORDER BY r.academic_year DESC, r.semester, c.course_code;
END$$

-- ------------------------------------------------------------
-- STORED PROCEDURE: search students (uses the name/reg_no indexes)
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_search_students$$
CREATE PROCEDURE sp_search_students(IN p_term VARCHAR(100))
BEGIN
    SELECT s.student_id, s.reg_no, s.first_name, s.last_name, s.email,
           d.dept_name, s.year_of_study, s.status
    FROM students s
    JOIN departments d ON d.department_id = s.department_id
    WHERE s.last_name  LIKE CONCAT(p_term, '%')
       OR s.first_name LIKE CONCAT(p_term, '%')
       OR s.reg_no     LIKE CONCAT(p_term, '%')
    ORDER BY s.last_name, s.first_name;
END$$

-- ------------------------------------------------------------
-- STORED PROCEDURE: register a student for a course (with checks)
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_register_course$$
CREATE PROCEDURE sp_register_course(
    IN p_student_id INT,
    IN p_course_id  INT,
    IN p_year       VARCHAR(9),
    IN p_semester   TINYINT
)
BEGIN
    DECLARE v_status VARCHAR(20);

    SELECT status INTO v_status FROM students WHERE student_id = p_student_id;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Student not found.';
    END IF;
    IF v_status <> 'active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only active students can register for courses.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM courses WHERE course_id = p_course_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Course not found.';
    END IF;
    IF p_semester NOT IN (1, 2) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Semester must be 1 or 2.';
    END IF;
    IF EXISTS (SELECT 1 FROM registrations
               WHERE student_id = p_student_id AND course_id = p_course_id
                 AND academic_year = p_year AND semester = p_semester) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Student is already registered for this course in that semester.';
    END IF;

    INSERT INTO registrations (student_id, course_id, academic_year, semester)
    VALUES (p_student_id, p_course_id, p_year, p_semester);
END$$

DELIMITER ;

-- ------------------------------------------------------------
-- VIEWS
-- ------------------------------------------------------------

-- Examination results with grade (the required results view)
CREATE OR REPLACE VIEW vw_student_results AS
SELECT s.student_id, s.reg_no,
       CONCAT(s.first_name, ' ', s.last_name) AS student_name,
       c.course_id, c.course_code, c.course_title, c.credit_hours,
       r.academic_year, r.semester,
       res.marks,
       fn_grade(res.marks) AS grade,
       CASE WHEN res.marks >= 40 THEN 'Pass' ELSE 'Fail' END AS remark
FROM results res
JOIN registrations r ON r.registration_id = res.registration_id
JOIN students s      ON s.student_id      = r.student_id
JOIN courses c       ON c.course_id       = r.course_id;

-- Registrations with student, course and lecturer
CREATE OR REPLACE VIEW vw_registration_details AS
SELECT r.registration_id, r.academic_year, r.semester, r.registered_on,
       s.student_id, s.reg_no, CONCAT(s.first_name, ' ', s.last_name) AS student_name,
       c.course_id, c.course_code, c.course_title, c.lecturer_id
FROM registrations r
JOIN students s ON s.student_id = r.student_id
JOIN courses c  ON c.course_id  = r.course_id;

-- Courses with department and lecturer names
CREATE OR REPLACE VIEW vw_course_details AS
SELECT c.course_id, c.course_code, c.course_title, c.credit_hours,
       c.department_id, d.dept_name,
       c.lecturer_id, u.full_name AS lecturer_name
FROM courses c
JOIN departments d ON d.department_id = c.department_id
LEFT JOIN users u  ON u.user_id = c.lecturer_id;

-- Fee balance per student (admin only)
CREATE OR REPLACE VIEW vw_fee_balance AS
SELECT s.student_id, s.reg_no,
       CONCAT(s.first_name, ' ', s.last_name) AS student_name,
       d.dept_name,
       d.annual_fee AS fee_charged,
       COALESCE(SUM(p.amount), 0) AS total_paid,
       d.annual_fee - COALESCE(SUM(p.amount), 0) AS balance
FROM students s
JOIN departments d ON d.department_id = s.department_id
LEFT JOIN payments p ON p.student_id = s.student_id
GROUP BY s.student_id, s.reg_no, s.first_name, s.last_name, d.dept_name, d.annual_fee;
