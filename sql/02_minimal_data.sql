-- ============================================================
-- 02_minimal_data.sql : empty start for real use
-- Departments and one administrator account only.
-- Login:  admin / Admin@123   (the site asks you to change it)
-- ============================================================
USE university_sis;

INSERT INTO departments (department_id, dept_name, annual_fee) VALUES
(1, 'Computer Science',          150000.00),
(2, 'Information Technology',    140000.00),
(3, 'Business Administration',   120000.00),
(4, 'Electrical Engineering',    180000.00);

INSERT INTO users (user_id, username, password_hash, full_name, role) VALUES
(1, 'admin', '$2y$10$BGn.P3iv.0GofZvh2jsVW.bar1lo.DfqXA8yI5uhBRvx0xpqMT76u', 'System Administrator', 'admin');
