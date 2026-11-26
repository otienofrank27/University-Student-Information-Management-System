-- =============================================================================
-- University Student Information Management System
-- File: database/indexes.sql
-- Non-redundant indexes on high-frequency search and join columns.
-- Note: UNIQUE columns (registration_number, email, course_code,
-- examination_results.registration_id) already maintain unique B-Tree indexes
-- in MySQL/InnoDB; explicit secondary indexes are added for non-unique columns
-- and composite/lookup queries without creating redundant duplicates.
-- =============================================================================

USE university_student_db;

-- Search index on student last_name (non-unique)
CREATE INDEX idx_students_last_name ON students (last_name);

-- Foreign key & lookup indexes on course_registrations
-- (student_id is covered as the leftmost prefix of uq_student_course_semester,
--  while course_id and semester_id benefit from dedicated single-column indexes)
CREATE INDEX idx_reg_course_id ON course_registrations (course_id);
CREATE INDEX idx_reg_semester_id ON course_registrations (semester_id);

-- Foreign key & lookup index on fee_payments.student_id
CREATE INDEX idx_fee_payments_student_id ON fee_payments (student_id);

-- Execution Plan Verification Examples
EXPLAIN SELECT * FROM students WHERE registration_number = 'UNI-2024-001';
EXPLAIN SELECT * FROM students WHERE last_name = 'Mendoza';
EXPLAIN SELECT * FROM course_registrations WHERE semester_id = 3 AND course_id = 1;
EXPLAIN SELECT * FROM fee_payments WHERE student_id = 1;
