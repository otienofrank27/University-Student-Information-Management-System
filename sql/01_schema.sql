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
