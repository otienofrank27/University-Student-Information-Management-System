-- =============================================================================
-- University Student Information Management System
-- File: database/sample_data.sql
-- Clearly identified sample demonstration records
-- =============================================================================

USE university_student_db;

INSERT INTO lecturers (lecturer_id, first_name, last_name, email, phone, department) VALUES
(1, 'Eleanor', 'Vance', 'e.vance@university.edu', '+1-555-0141', 'Computer Science'),
(2, 'Marcus', 'Thorne', 'm.thorne@university.edu', '+1-555-0142', 'Information Systems'),
(3, 'Priya', 'Natarajan', 'p.natarajan@university.edu', '+1-555-0143', 'Mathematics & Data Science'),
(4, 'Samuel', 'Okafor', 's.okafor@university.edu', '+1-555-0144', 'Software Engineering');

INSERT INTO students (student_id, registration_number, first_name, last_name, gender, email, phone, course_of_study, year_of_study, date_registered, status) VALUES
(1, 'UNI-2024-001', 'Clara', 'Mendoza', 'Female', 'clara.mendoza@student.university.edu', '+1-555-0201', 'BSc Computer Science', 3, '2024-09-02', 'Active'),
(2, 'UNI-2024-002', 'Daniel', 'Kowalski', 'Male', 'daniel.kowalski@student.university.edu', '+1-555-0202', 'BSc Computer Science', 3, '2024-09-02', 'Active'),
(3, 'UNI-2025-003', 'Amara', 'Mensah', 'Female', 'amara.mensah@student.university.edu', '+1-555-0203', 'BSc Information Systems', 2, '2025-09-01', 'Active'),
(4, 'UNI-2025-004', 'Liam', 'Callaghan', 'Male', 'liam.callaghan@student.university.edu', '+1-555-0204', 'BSc Software Engineering', 2, '2025-09-03', 'Active'),
(5, 'UNI-2023-005', 'Hannah', 'Lindqvist', 'Female', 'hannah.lindqvist@student.university.edu', '+1-555-0205', 'BSc Data Science', 4, '2023-09-04', 'Active'),
(6, 'UNI-2026-006', 'Tariq', 'Al-Mansoor', 'Male', 'tariq.almansoor@student.university.edu', '+1-555-0206', 'BSc Computer Science', 1, '2026-09-01', 'Active');

INSERT INTO courses (course_id, course_code, course_name, credit_hours, lecturer_id) VALUES
(1, 'CS301', 'Advanced Database Management Systems', 4, 1),
(2, 'IS204', 'Enterprise Systems Architecture', 3, 2),
(3, 'MATH210', 'Discrete Mathematics & Graph Theory', 3, 3),
(4, 'SE305', 'Software Verification & Security', 4, 4),
(5, 'CS402', 'Distributed Data Engineering', 4, 1);

INSERT INTO semesters (semester_id, semester_name, academic_year, start_date, end_date, status) VALUES
(1, 'Semester 1 (Fall)', '2025/2026', '2025-09-01', '2025-12-19', 'Completed'),
(2, 'Semester 2 (Spring)', '2025/2026', '2026-01-12', '2026-05-08', 'Completed'),
(3, 'Semester 1 (Fall)', '2026/2027', '2026-09-07', '2026-12-18', 'Active');

INSERT INTO course_registrations (registration_id, student_id, course_id, semester_id, registration_date, status) VALUES
(1, 1, 1, 3, '2026-09-08', 'Registered'),
(2, 1, 4, 3, '2026-09-08', 'Registered'),
(3, 2, 1, 3, '2026-09-09', 'Registered'),
(4, 2, 3, 3, '2026-09-09', 'Registered'),
(5, 3, 2, 3, '2026-09-10', 'Registered'),
(6, 4, 4, 3, '2026-09-10', 'Registered'),
(7, 5, 5, 3, '2026-09-11', 'Registered'),
(8, 1, 3, 2, '2026-01-14', 'Completed');

-- Examination results (triggers automatically compute total_marks, grade, remarks)
INSERT INTO examination_results (registration_id, exam_marks, assignment_marks) VALUES
(1, 82.00, 88.00),
(2, 74.00, 79.00),
(3, 64.00, 71.00),
(4, 52.00, 60.00),
(5, 43.00, 48.00),
(6, 32.00, 38.00),
(7, 91.00, 94.00),
(8, 78.00, 82.00);

-- Sample fee payment records clearly prefixed with SAMPLE-REF for demonstration
INSERT INTO fee_payments (student_id, amount_paid, payment_date, payment_method, transaction_reference) VALUES
(1, 2400.00, '2026-09-02', 'Bank Transfer', 'SAMPLE-REF-2026-0001'),
(2, 1850.00, '2026-09-03', 'Card Payment', 'SAMPLE-REF-2026-0002'),
(3, 2400.00, '2026-09-04', 'Bank Transfer', 'SAMPLE-REF-2026-0003'),
(4, 1200.00, '2026-09-05', 'Mobile Money', 'SAMPLE-REF-2026-0004'),
(5, 2600.00, '2026-09-06', 'Bank Transfer', 'SAMPLE-REF-2026-0005'),
(1, 600.00,  '2026-10-15', 'Card Payment', 'SAMPLE-REF-2026-0006');
