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
