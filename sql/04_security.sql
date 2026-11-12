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
