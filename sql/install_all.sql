-- ============================================================
-- University Student Information Management System
-- 01_schema.sql : database, tables (3NF), constraints, indexes
-- Works on MySQL 5.7+/8.x and MariaDB 10.3+ (XAMPP)
-- ============================================================

DROP DATABASE IF EXISTS university_sis;
CREATE DATABASE university_sis
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE university_sis;

-- ------------------------------------------------------------
-- 1. departments
--    The fee depends on the department (programme), so it lives
--    here and not in students -> removes a transitive dependency
--    (student_id -> department_id -> annual_fee), i.e. 3NF.
-- ------------------------------------------------------------
CREATE TABLE departments (
    department_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    dept_name     VARCHAR(100) NOT NULL,
    annual_fee    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (department_id),
    UNIQUE KEY uq_departments_name (dept_name)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. users  (system accounts: administrators and lecturers)
-- ------------------------------------------------------------
CREATE TABLE users (
    user_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username      VARCHAR(50)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    role          ENUM('admin','lecturer') NOT NULL,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. students
-- ------------------------------------------------------------
CREATE TABLE students (
    student_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    reg_no        VARCHAR(20)  NOT NULL,
    first_name    VARCHAR(50)  NOT NULL,
    last_name     VARCHAR(50)  NOT NULL,
    email         VARCHAR(100) NOT NULL,
    phone         VARCHAR(20)  NULL,
    date_of_birth DATE         NOT NULL,
    gender        ENUM('Male','Female','Other') NOT NULL,
    department_id INT UNSIGNED NOT NULL,
    year_of_study TINYINT UNSIGNED NOT NULL DEFAULT 1,
    admission_date DATE        NOT NULL,
    status        ENUM('active','suspended','graduated') NOT NULL DEFAULT 'active',
    PRIMARY KEY (student_id),
    UNIQUE KEY uq_students_reg_no (reg_no),
    UNIQUE KEY uq_students_email (email),
    CONSTRAINT fk_students_department
        FOREIGN KEY (department_id) REFERENCES departments (department_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. courses  (each course may be assigned to one lecturer)
-- ------------------------------------------------------------
CREATE TABLE courses (
    course_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    course_code   VARCHAR(15)  NOT NULL,
    course_title  VARCHAR(120) NOT NULL,
    credit_hours  TINYINT UNSIGNED NOT NULL DEFAULT 3,
    department_id INT UNSIGNED NOT NULL,
    lecturer_id   INT UNSIGNED NULL,
    PRIMARY KEY (course_id),
    UNIQUE KEY uq_courses_code (course_code),
    CONSTRAINT fk_courses_department
        FOREIGN KEY (department_id) REFERENCES departments (department_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_courses_lecturer
        FOREIGN KEY (lecturer_id) REFERENCES users (user_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5. registrations  (student <-> course, resolves the M:N link)
-- ------------------------------------------------------------
CREATE TABLE registrations (
    registration_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    student_id      INT UNSIGNED NOT NULL,
    course_id       INT UNSIGNED NOT NULL,
    academic_year   VARCHAR(9)   NOT NULL,           -- e.g. 2025/2026
    semester        TINYINT UNSIGNED NOT NULL,       -- 1 or 2
    registered_on   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (registration_id),
    UNIQUE KEY uq_registration (student_id, course_id, academic_year, semester),
    CONSTRAINT fk_reg_student
        FOREIGN KEY (student_id) REFERENCES students (student_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_reg_course
        FOREIGN KEY (course_id) REFERENCES courses (course_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 6. results  (one mark per registration; range enforced by trigger)
-- ------------------------------------------------------------
CREATE TABLE results (
    result_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    registration_id INT UNSIGNED NOT NULL,
    marks           DECIMAL(5,2) NOT NULL,
    recorded_by     INT UNSIGNED NULL,
    recorded_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (result_id),
    UNIQUE KEY uq_results_registration (registration_id),
    CONSTRAINT fk_results_registration
        FOREIGN KEY (registration_id) REFERENCES registrations (registration_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_results_user
        FOREIGN KEY (recorded_by) REFERENCES users (user_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 7. payments  (fee payments; balance is derived in a view,
--    never stored, so there is no redundant data)
-- ------------------------------------------------------------
CREATE TABLE payments (
    payment_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
    student_id   INT UNSIGNED NOT NULL,
    amount       DECIMAL(10,2) NOT NULL,
    payment_date DATE         NOT NULL,
    method       ENUM('M-Pesa','Bank','Cash','Cheque') NOT NULL,
    reference_no VARCHAR(40)  NOT NULL,
    received_by  INT UNSIGNED NULL,
    PRIMARY KEY (payment_id),
    UNIQUE KEY uq_payments_reference (reference_no),
    CONSTRAINT fk_payments_student
        FOREIGN KEY (student_id) REFERENCES students (student_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_payments_user
        FOREIGN KEY (received_by) REFERENCES users (user_id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- INDEXES (in addition to the PK / UNIQUE / FK indexes above)
-- ------------------------------------------------------------
-- Student searches by surname / first name (LIKE 'abc%' can use these)
CREATE INDEX idx_students_name       ON students (last_name, first_name);
CREATE INDEX idx_students_first_name ON students (first_name);
-- Students per department / year (reports, filters)
CREATE INDEX idx_students_dept_year  ON students (department_id, year_of_study);
-- Registrations looked up by course and by period
CREATE INDEX idx_reg_course_period   ON registrations (course_id, academic_year, semester);
-- Payment history per student, newest first
CREATE INDEX idx_payments_student_date ON payments (student_id, payment_date);
-- ============================================================
-- 02_sample_data.sql : demo data
-- Logins:  admin / Admin@123     lecturer1 / Lecturer@123
--          lecturer2 / Lecturer@123
-- ============================================================
USE university_sis;

INSERT INTO departments (department_id, dept_name, annual_fee) VALUES
(1, 'Computer Science',          150000.00),
(2, 'Information Technology',    140000.00),
(3, 'Business Administration',   120000.00),
(4, 'Electrical Engineering',    180000.00);

INSERT INTO users (user_id, username, password_hash, full_name, role) VALUES
(1, 'admin',     '$2y$10$BGn.P3iv.0GofZvh2jsVW.bar1lo.DfqXA8yI5uhBRvx0xpqMT76u', 'System Administrator', 'admin'),
(2, 'lecturer1', '$2y$10$m4qrvlK/KVkb8UVnFDNBuOF7kK2RIOSS0W5VIfqdt5BmdUeat2bT.', 'Dr. Wanjiru Kamau',    'lecturer'),
(3, 'lecturer2', '$2y$10$m4qrvlK/KVkb8UVnFDNBuOF7kK2RIOSS0W5VIfqdt5BmdUeat2bT.', 'Mr. Otieno Odhiambo',  'lecturer');

INSERT INTO students
(student_id, reg_no, first_name, last_name, email, phone, date_of_birth, gender, department_id, year_of_study, admission_date, status) VALUES
(1,  'CS/2024/001', 'Brian',   'Mwangi',  'brian.mwangi@student.uni.ac.ke',  '0711000001', '2004-03-14', 'Male',   1, 2, '2024-09-02', 'active'),
(2,  'CS/2024/002', 'Faith',   'Achieng', 'faith.achieng@student.uni.ac.ke', '0711000002', '2004-07-21', 'Female', 1, 2, '2024-09-02', 'active'),
(3,  'CS/2024/003', 'Kevin',   'Kiprop',  'kevin.kiprop@student.uni.ac.ke',  '0711000003', '2003-11-05', 'Male',   1, 2, '2024-09-02', 'active'),
(4,  'IT/2025/001', 'Mercy',   'Wambui',  'mercy.wambui@student.uni.ac.ke',  '0711000004', '2005-01-30', 'Female', 2, 1, '2025-09-01', 'active'),
(5,  'IT/2025/002', 'Dennis',  'Otieno',  'dennis.otieno@student.uni.ac.ke', '0711000005', '2005-05-17', 'Male',   2, 1, '2025-09-01', 'active'),
(6,  'IT/2024/003', 'Grace',   'Njeri',   'grace.njeri@student.uni.ac.ke',   '0711000006', '2004-09-09', 'Female', 2, 2, '2024-09-02', 'active'),
(7,  'BA/2023/001', 'Samuel',  'Kariuki', 'samuel.kariuki@student.uni.ac.ke','0711000007', '2002-12-02', 'Male',   3, 3, '2023-09-04', 'active'),
(8,  'BA/2023/002', 'Lucy',    'Chebet',  'lucy.chebet@student.uni.ac.ke',   '0711000008', '2003-04-25', 'Female', 3, 3, '2023-09-04', 'active'),
(9,  'BA/2025/003', 'Peter',   'Mutua',   'peter.mutua@student.uni.ac.ke',   '0711000009', '2005-08-11', 'Male',   3, 1, '2025-09-01', 'active'),
(10, 'EE/2024/001', 'Janet',   'Akinyi',  'janet.akinyi@student.uni.ac.ke',  '0711000010', '2004-02-19', 'Female', 4, 2, '2024-09-02', 'active'),
(11, 'EE/2024/002', 'Collins', 'Maina',   'collins.maina@student.uni.ac.ke', '0711000011', '2004-06-28', 'Male',   4, 2, '2024-09-02', 'active'),
(12, 'CS/2025/004', 'Ibrahim', 'Hassan',  'ibrahim.hassan@student.uni.ac.ke','0711000012', '2005-10-03', 'Male',   1, 1, '2025-09-01', 'suspended');

INSERT INTO courses (course_id, course_code, course_title, credit_hours, department_id, lecturer_id) VALUES
(1,  'CSC201', 'Database Systems',                 3, 1, 2),
(2,  'CSC202', 'Data Structures and Algorithms',   4, 1, 2),
(3,  'CSC203', 'Operating Systems',                3, 1, 3),
(4,  'ITE101', 'Introduction to Networking',       3, 2, 3),
(5,  'ITE102', 'Web Development Fundamentals',     3, 2, 2),
(6,  'ITE201', 'Systems Analysis and Design',      3, 2, 3),
(7,  'BBA301', 'Strategic Management',             3, 3, 2),
(8,  'BBA302', 'Financial Accounting',             3, 3, 3),
(9,  'EEE201', 'Circuit Theory',                   4, 4, 2),
(10, 'GEN101', 'Communication Skills',             2, 1, 3);

INSERT INTO registrations (registration_id, student_id, course_id, academic_year, semester) VALUES
(1,  1, 1,  '2025/2026', 1), (2,  1, 2,  '2025/2026', 1), (3,  1, 3,  '2025/2026', 2), (4,  1, 10, '2025/2026', 1),
(5,  2, 1,  '2025/2026', 1), (6,  2, 2,  '2025/2026', 1), (7,  2, 3,  '2025/2026', 2), (8,  2, 10, '2025/2026', 1),
(9,  3, 1,  '2025/2026', 1), (10, 3, 2,  '2025/2026', 1), (11, 3, 10, '2025/2026', 1),
(12, 4, 4,  '2025/2026', 1), (13, 4, 5,  '2025/2026', 1), (14, 4, 10, '2025/2026', 1),
(15, 5, 4,  '2025/2026', 1), (16, 5, 5,  '2025/2026', 1),
(17, 6, 4,  '2025/2026', 1), (18, 6, 6,  '2025/2026', 2),
(19, 7, 7,  '2025/2026', 1), (20, 7, 8,  '2025/2026', 1),
(21, 8, 7,  '2025/2026', 1), (22, 8, 8,  '2025/2026', 1),
(23, 9, 8,  '2026/2027', 1),
(24, 10, 9, '2025/2026', 1), (25, 11, 9, '2025/2026', 1);

-- Registration 23 (current semester) intentionally has no marks yet.
INSERT INTO results (registration_id, marks, recorded_by) VALUES
(1, 78.50, 2), (2, 66.00, 2), (3, 54.00, 3), (4, 81.00, 3),
(5, 72.00, 2), (6, 48.50, 2), (7, 59.00, 3), (8, 67.00, 3),
(9, 45.00, 2), (10, 38.00, 2), (11, 52.00, 3),
(12, 64.00, 3), (13, 71.50, 2), (14, 58.00, 3),
(15, 49.00, 3), (16, 62.00, 2),
(17, 55.00, 3), (18, 60.00, 3),
(19, 74.00, 2), (20, 68.00, 3),
(21, 57.00, 2), (22, 41.00, 3),
(24, 63.00, 2), (25, 70.00, 2);

INSERT INTO payments (student_id, amount, payment_date, method, reference_no, received_by) VALUES
(1,  75000.00, '2025-09-05', 'M-Pesa', 'MPE7A91K2L1',   1),
(1,  75000.00, '2026-01-20', 'Bank',   'BNK-2026-0042', 1),
(2, 150000.00, '2025-09-08', 'Bank',   'BNK-2025-1180', 1),
(3,  50000.00, '2025-09-10', 'M-Pesa', 'MPE7B22Q9X4',   1),
(4,  70000.00, '2025-09-12', 'M-Pesa', 'MPE7C55T3Z8',   1),
(5, 140000.00, '2025-09-15', 'Bank',   'BNK-2025-1203', 1),
(6,  60000.00, '2025-09-18', 'Cash',   'CSH-0001',      1),
(6,  40000.00, '2026-02-02', 'M-Pesa', 'MPE8D10H5R2',   1),
(7, 120000.00, '2025-09-20', 'Bank',   'BNK-2025-1250', 1),
(8,  60000.00, '2025-09-22', 'Cheque', 'CHQ-004511',    1),
(9, 120000.00, '2026-09-04', 'Bank',   'BNK-2026-0911', 1),
(10, 90000.00, '2025-09-25', 'M-Pesa', 'MPE7E77J1B6',   1),
(11,180000.00, '2025-09-28', 'Bank',   'BNK-2025-1301', 1);
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
-- ============================================================
-- 04_security.sql : administrator and lecturer database accounts
-- Run as root (phpMyAdmin > SQL tab). Change the passwords for
-- real use and update config.php to match.
-- ============================================================
USE university_sis;

DROP USER IF EXISTS 'sis_admin'@'localhost';
DROP USER IF EXISTS 'sis_lecturer'@'localhost';

CREATE USER 'sis_admin'@'localhost'    IDENTIFIED BY 'Admin@Sis2026';
CREATE USER 'sis_lecturer'@'localhost' IDENTIFIED BY 'Lect@Sis2026';

-- ------------------------------------------------------------
-- ADMINISTRATOR: full data access, but cannot alter structure
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
    ON university_sis.* TO 'sis_admin'@'localhost';

-- ------------------------------------------------------------
-- LECTURER: read academic data, record/update marks only.
-- No access to users (password hashes) or payments (fees).
-- ------------------------------------------------------------
GRANT SELECT ON university_sis.departments           TO 'sis_lecturer'@'localhost';
GRANT SELECT ON university_sis.students              TO 'sis_lecturer'@'localhost';
GRANT SELECT ON university_sis.courses               TO 'sis_lecturer'@'localhost';
GRANT SELECT ON university_sis.registrations         TO 'sis_lecturer'@'localhost';
GRANT SELECT, INSERT, UPDATE ON university_sis.results TO 'sis_lecturer'@'localhost';

GRANT SELECT ON university_sis.vw_student_results       TO 'sis_lecturer'@'localhost';
GRANT SELECT ON university_sis.vw_registration_details  TO 'sis_lecturer'@'localhost';
GRANT SELECT ON university_sis.vw_course_details        TO 'sis_lecturer'@'localhost';

GRANT EXECUTE ON FUNCTION  university_sis.fn_grade                TO 'sis_lecturer'@'localhost';
GRANT EXECUTE ON PROCEDURE university_sis.sp_get_student_details  TO 'sis_lecturer'@'localhost';
GRANT EXECUTE ON PROCEDURE university_sis.sp_search_students      TO 'sis_lecturer'@'localhost';

FLUSH PRIVILEGES;

-- Verify
SHOW GRANTS FOR 'sis_admin'@'localhost';
SHOW GRANTS FOR 'sis_lecturer'@'localhost';

-- Passwords for the *website* accounts are stored hashed (bcrypt via
-- PHP password_hash) in the users table, never in plain text.
