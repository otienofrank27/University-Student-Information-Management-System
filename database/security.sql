-- =============================================================================
-- University Student Information Management System
-- File: database/security.sql
-- Role-Based Access Control (RBAC) using MySQL Roles & Users
-- Replace password placeholders before executing in XAMPP/MySQL.
-- =============================================================================

USE university_student_db;

-- 1. Create Database Roles
CREATE ROLE IF NOT EXISTS 'usims_admin_role';
CREATE ROLE IF NOT EXISTS 'usims_lecturer_role';

-- 2. Grant Full Administrative Privileges to Administrator Role
GRANT ALL PRIVILEGES ON university_student_db.* TO 'usims_admin_role' WITH GRANT OPTION;

-- 3. Grant Scoped Privileges to Lecturer Role
-- Permitted: view students, courses, registrations, views, and manage examination_results
GRANT SELECT ON university_student_db.students TO 'usims_lecturer_role';
GRANT SELECT ON university_student_db.lecturers TO 'usims_lecturer_role';
GRANT SELECT ON university_student_db.courses TO 'usims_lecturer_role';
GRANT SELECT ON university_student_db.semesters TO 'usims_lecturer_role';
GRANT SELECT ON university_student_db.course_registrations TO 'usims_lecturer_role';
GRANT SELECT, INSERT, UPDATE ON university_student_db.examination_results TO 'usims_lecturer_role';
GRANT SELECT ON university_student_db.student_results_view TO 'usims_lecturer_role';
GRANT SELECT ON university_student_db.student_registration_view TO 'usims_lecturer_role';
GRANT SELECT ON university_student_db.course_performance_view TO 'usims_lecturer_role';
GRANT EXECUTE ON PROCEDURE university_student_db.GetStudentDetails TO 'usims_lecturer_role';
GRANT EXECUTE ON PROCEDURE university_student_db.GetStudentResults TO 'usims_lecturer_role';
GRANT EXECUTE ON PROCEDURE university_student_db.GetCourseRegistrations TO 'usims_lecturer_role';
GRANT EXECUTE ON PROCEDURE university_student_db.GetCourseStudentList TO 'usims_lecturer_role';

-- Explicitly NOT granted to lecturer role: fee_payments, student_payment_view,
-- GetStudentPayments, DELETE/DROP/ALTER privileges.

-- 4. Create Database Users & Assign Default Roles
CREATE USER IF NOT EXISTS 'usims_admin'@'localhost' IDENTIFIED BY 'REPLACE_WITH_STRONG_ADMIN_PASSWORD';
CREATE USER IF NOT EXISTS 'usims_lecturer'@'localhost' IDENTIFIED BY 'REPLACE_WITH_STRONG_LECTURER_PASSWORD';

GRANT 'usims_admin_role' TO 'usims_admin'@'localhost';
GRANT 'usims_lecturer_role' TO 'usims_lecturer'@'localhost';

SET DEFAULT ROLE 'usims_admin_role' TO 'usims_admin'@'localhost';
SET DEFAULT ROLE 'usims_lecturer_role' TO 'usims_lecturer'@'localhost';

FLUSH PRIVILEGES;

-- 5. Permission Inspection
SHOW GRANTS FOR 'usims_admin'@'localhost';
SHOW GRANTS FOR 'usims_lecturer'@'localhost';
