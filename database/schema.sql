-- =============================================================================
-- University Student Information Management System
-- File: database/schema.sql
-- Target: MySQL 8.0+ / MariaDB (XAMPP)
-- Normalization: Third Normal Form (3NF)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS university_student_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE university_student_db;

-- -----------------------------------------------------------------------------
-- Table 1: students
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  student_id INT AUTO_INCREMENT PRIMARY KEY,
  registration_number VARCHAR(30) NOT NULL UNIQUE,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
  email VARCHAR(100) UNIQUE,
  phone VARCHAR(20),
  course_of_study VARCHAR(100),
  year_of_study INT CHECK (year_of_study BETWEEN 1 AND 6),
  date_registered DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Graduated', 'Suspended'))
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Table 2: lecturers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lecturers (
  lecturer_id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) UNIQUE,
  phone VARCHAR(20),
  department VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Table 3: courses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  course_id INT AUTO_INCREMENT PRIMARY KEY,
  course_code VARCHAR(20) NOT NULL UNIQUE,
  course_name VARCHAR(100) NOT NULL,
  credit_hours INT NOT NULL CHECK (credit_hours BETWEEN 1 AND 12),
  lecturer_id INT NULL,
  CONSTRAINT fk_courses_lecturer
    FOREIGN KEY (lecturer_id) REFERENCES lecturers(lecturer_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Table 4: semesters
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS semesters (
  semester_id INT AUTO_INCREMENT PRIMARY KEY,
  semester_name VARCHAR(50) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Active', 'Upcoming', 'Completed')),
  CONSTRAINT chk_semester_dates CHECK (end_date > start_date)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Table 5: course_registrations
-- Composite UNIQUE constraint prevents duplicate student+course+semester rows.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS course_registrations (
  registration_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  course_id INT NOT NULL,
  semester_id INT NOT NULL,
  registration_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Registered' CHECK (status IN ('Registered', 'Dropped', 'Completed')),
  CONSTRAINT uq_student_course_semester UNIQUE (student_id, course_id, semester_id),
  CONSTRAINT fk_reg_student
    FOREIGN KEY (student_id) REFERENCES students(student_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_reg_course
    FOREIGN KEY (course_id) REFERENCES courses(course_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_reg_semester
    FOREIGN KEY (semester_id) REFERENCES semesters(semester_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Table 6: examination_results
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS examination_results (
  result_id INT AUTO_INCREMENT PRIMARY KEY,
  registration_id INT NOT NULL UNIQUE,
  exam_marks DECIMAL(5,2) NOT NULL CHECK (exam_marks >= 0 AND exam_marks <= 100),
  assignment_marks DECIMAL(5,2) NOT NULL CHECK (assignment_marks >= 0 AND assignment_marks <= 100),
  total_marks DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  grade VARCHAR(5) NOT NULL DEFAULT 'E',
  remarks VARCHAR(20) NOT NULL DEFAULT 'Fail',
  CONSTRAINT fk_results_registration
    FOREIGN KEY (registration_id) REFERENCES course_registrations(registration_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Table 7: fee_payments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_payments (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL CHECK (amount_paid > 0),
  payment_date DATE NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  transaction_reference VARCHAR(100) NOT NULL UNIQUE,
  CONSTRAINT fk_payments_student
    FOREIGN KEY (student_id) REFERENCES students(student_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;
