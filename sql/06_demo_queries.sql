-- ============================================================
-- 06_demo_queries.sql : run each block in phpMyAdmin (SQL tab)
-- and take a screenshot for the report.
-- ============================================================
USE university_sis;

-- A. NORMALIZATION: show the seven tables and their keys
SHOW TABLES;
DESCRIBE students;

-- B. STORED PROCEDURES
CALL sp_get_student_details(1);
CALL sp_search_students('Ach');
CALL sp_register_course(4, 6, '2026/2027', 1);     -- works
CALL sp_register_course(4, 6, '2026/2027', 1);     -- fails: already registered
CALL sp_register_course(12, 1, '2026/2027', 1);    -- fails: student is suspended

-- C. TRIGGERS: both of these must be rejected
INSERT INTO results (registration_id, marks) VALUES (23, 105);
UPDATE results SET marks = -5 WHERE registration_id = 1;
-- a valid mark is accepted
INSERT INTO results (registration_id, marks) VALUES (23, 66.5);
-- payment trigger
INSERT INTO payments (student_id, amount, payment_date, method, reference_no)
VALUES (1, 0, CURDATE(), 'Cash', 'TEST-ZERO');

-- D. VIEWS
SELECT * FROM vw_student_results ORDER BY student_name, academic_year, course_code;
SELECT * FROM vw_fee_balance ORDER BY balance DESC;
SELECT * FROM vw_registration_details WHERE lecturer_id = 2;

-- E. INDEXING: compare the plan with and without the index
SHOW INDEX FROM students;
EXPLAIN SELECT * FROM students WHERE last_name LIKE 'Mw%';        -- uses idx_students_name
EXPLAIN SELECT * FROM students USE INDEX () WHERE last_name LIKE 'Mw%';  -- full table scan

-- F. SECURITY (connect as sis_lecturer, e.g. mysql -u sis_lecturer -p)
-- SELECT * FROM payments;               -- ERROR 1142: SELECT command denied
-- SELECT * FROM users;                  -- ERROR 1142: SELECT command denied
-- DELETE FROM students;                 -- ERROR 1142: DELETE command denied
-- SELECT * FROM vw_student_results;     -- allowed
