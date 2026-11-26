import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const BACKUPS_DIR = path.resolve(process.cwd(), 'backups');
export const DB_PATH = path.resolve(DATA_DIR, 'university_student.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeSchemaAndObjects(): void {
  db.exec(`
    -- Table 1: students
    CREATE TABLE IF NOT EXISTS students (
      student_id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_number VARCHAR(30) NOT NULL UNIQUE,
      first_name VARCHAR(50) NOT NULL,
      last_name VARCHAR(50) NOT NULL,
      gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
      email VARCHAR(100) UNIQUE,
      phone VARCHAR(20),
      course_of_study VARCHAR(100),
      year_of_study INTEGER CHECK (year_of_study BETWEEN 1 AND 6),
      date_registered DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Graduated', 'Suspended'))
    );

    -- Table 2: lecturers
    CREATE TABLE IF NOT EXISTS lecturers (
      lecturer_id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name VARCHAR(50) NOT NULL,
      last_name VARCHAR(50) NOT NULL,
      email VARCHAR(100) UNIQUE,
      phone VARCHAR(20),
      department VARCHAR(100) NOT NULL
    );

    -- Table 3: courses
    CREATE TABLE IF NOT EXISTS courses (
      course_id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_code VARCHAR(20) NOT NULL UNIQUE,
      course_name VARCHAR(100) NOT NULL,
      credit_hours INTEGER NOT NULL CHECK (credit_hours BETWEEN 1 AND 12),
      lecturer_id INTEGER NULL REFERENCES lecturers(lecturer_id) ON UPDATE CASCADE ON DELETE RESTRICT
    );

    -- Table 4: semesters
    CREATE TABLE IF NOT EXISTS semesters (
      semester_id INTEGER PRIMARY KEY AUTOINCREMENT,
      semester_name VARCHAR(50) NOT NULL,
      academic_year VARCHAR(20) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Upcoming' CHECK (status IN ('Active', 'Upcoming', 'Completed')),
      CHECK (end_date > start_date)
    );

    -- Table 5: course_registrations
    CREATE TABLE IF NOT EXISTS course_registrations (
      registration_id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(student_id) ON UPDATE CASCADE ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(course_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      semester_id INTEGER NOT NULL REFERENCES semesters(semester_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      registration_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Registered' CHECK (status IN ('Registered', 'Dropped', 'Completed')),
      UNIQUE (student_id, course_id, semester_id)
    );

    -- Table 6: examination_results
    CREATE TABLE IF NOT EXISTS examination_results (
      result_id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL UNIQUE REFERENCES course_registrations(registration_id) ON UPDATE CASCADE ON DELETE CASCADE,
      exam_marks DECIMAL(5,2) NOT NULL CHECK (exam_marks >= 0 AND exam_marks <= 100),
      assignment_marks DECIMAL(5,2) NOT NULL CHECK (assignment_marks >= 0 AND assignment_marks <= 100),
      total_marks DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      grade VARCHAR(5) NOT NULL DEFAULT 'E',
      remarks VARCHAR(20) NOT NULL DEFAULT 'Fail'
    );

    -- Table 7: fee_payments
    CREATE TABLE IF NOT EXISTS fee_payments (
      payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(student_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      amount_paid DECIMAL(10,2) NOT NULL CHECK (amount_paid > 0),
      payment_date DATE NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      transaction_reference VARCHAR(100) NOT NULL UNIQUE
    );

    -- Configurable Grading & Weighting Scheme (single-row config table)
    CREATE TABLE IF NOT EXISTS grading_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      exam_weight REAL NOT NULL DEFAULT 0.70 CHECK (exam_weight >= 0 AND exam_weight <= 1),
      assignment_weight REAL NOT NULL DEFAULT 0.30 CHECK (assignment_weight >= 0 AND assignment_weight <= 1),
      grade_a_min REAL NOT NULL DEFAULT 70,
      grade_b_min REAL NOT NULL DEFAULT 60,
      grade_c_min REAL NOT NULL DEFAULT 50,
      grade_d_min REAL NOT NULL DEFAULT 40,
      pass_min REAL NOT NULL DEFAULT 40
    );

    INSERT OR IGNORE INTO grading_config (id, exam_weight, assignment_weight, grade_a_min, grade_b_min, grade_c_min, grade_d_min, pass_min)
    VALUES (1, 0.70, 0.30, 70, 60, 50, 40, 40);

    -- User Accounts & Sessions for Sign Up / Sign In
    CREATE TABLE IF NOT EXISTS app_users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) NOT NULL UNIQUE,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      department VARCHAR(100) NOT NULL DEFAULT 'Academic Registry',
      password_hash TEXT NOT NULL,
      recovery_hash TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      last_active_at INTEGER,
      device_label TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_attempts (
      attempt_key TEXT PRIMARY KEY,
      failures INTEGER NOT NULL DEFAULT 0,
      first_failure_at INTEGER NOT NULL,
      locked_until INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      meta_key TEXT PRIMARY KEY,
      meta_value TEXT NOT NULL
    );

    -- Portal & Institutional Preferences (single-row config table)
    CREATE TABLE IF NOT EXISTS portal_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      institution_name VARCHAR(120) NOT NULL DEFAULT 'University Students Information Management System',
      registry_email VARCHAR(120) NOT NULL DEFAULT '',
      reg_number_prefix VARCHAR(12) NOT NULL DEFAULT 'UNI',
      default_credit_hours INTEGER NOT NULL DEFAULT 3 CHECK (default_credit_hours BETWEEN 1 AND 12),
      default_payment_method VARCHAR(50) NOT NULL DEFAULT 'M-Pesa',
      currency_label VARCHAR(10) NOT NULL DEFAULT 'KSh',
      academic_calendar_note VARCHAR(200) NOT NULL DEFAULT ''
    );

    INSERT OR IGNORE INTO portal_settings (id) VALUES (1);

    -- =========================================================================
    -- Database Triggers (Validation, Weighted Total Calculation, Grade/Remarks)
    -- =========================================================================
    DROP TRIGGER IF EXISTS trg_exam_validate_insert;
    CREATE TRIGGER trg_exam_validate_insert
    BEFORE INSERT ON examination_results
    FOR EACH ROW
    BEGIN
      SELECT CASE
        WHEN NEW.exam_marks IS NULL OR NEW.exam_marks < 0 OR NEW.exam_marks > 100 THEN
          RAISE(ABORT, 'Validation Error: Examination marks must be between 0 and 100.')
      END;
      SELECT CASE
        WHEN NEW.assignment_marks IS NULL OR NEW.assignment_marks < 0 OR NEW.assignment_marks > 100 THEN
          RAISE(ABORT, 'Validation Error: Assignment marks must be between 0 and 100.')
      END;
    END;

    DROP TRIGGER IF EXISTS trg_exam_validate_update;
    CREATE TRIGGER trg_exam_validate_update
    BEFORE UPDATE ON examination_results
    FOR EACH ROW
    BEGIN
      SELECT CASE
        WHEN NEW.exam_marks IS NULL OR NEW.exam_marks < 0 OR NEW.exam_marks > 100 THEN
          RAISE(ABORT, 'Validation Error: Examination marks must be between 0 and 100.')
      END;
      SELECT CASE
        WHEN NEW.assignment_marks IS NULL OR NEW.assignment_marks < 0 OR NEW.assignment_marks > 100 THEN
          RAISE(ABORT, 'Validation Error: Assignment marks must be between 0 and 100.')
      END;
    END;

    DROP TRIGGER IF EXISTS trg_exam_calc_insert;
    CREATE TRIGGER trg_exam_calc_insert
    AFTER INSERT ON examination_results
    FOR EACH ROW
    BEGIN
      UPDATE examination_results
      SET
        total_marks = ROUND(
          (NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) +
          (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)),
          2
        ),
        grade = CASE
          WHEN ROUND((NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) + (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)), 2) >= (SELECT grade_a_min FROM grading_config WHERE id = 1) THEN 'A'
          WHEN ROUND((NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) + (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)), 2) >= (SELECT grade_b_min FROM grading_config WHERE id = 1) THEN 'B'
          WHEN ROUND((NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) + (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)), 2) >= (SELECT grade_c_min FROM grading_config WHERE id = 1) THEN 'C'
          WHEN ROUND((NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) + (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)), 2) >= (SELECT grade_d_min FROM grading_config WHERE id = 1) THEN 'D'
          ELSE 'E'
        END,
        remarks = CASE
          WHEN ROUND((NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) + (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)), 2) >= (SELECT pass_min FROM grading_config WHERE id = 1) THEN 'Pass'
          ELSE 'Fail'
        END
      WHERE result_id = NEW.result_id;
    END;

    DROP TRIGGER IF EXISTS trg_exam_calc_update;
    CREATE TRIGGER trg_exam_calc_update
    AFTER UPDATE OF exam_marks, assignment_marks ON examination_results
    FOR EACH ROW
    BEGIN
      UPDATE examination_results
      SET
        total_marks = ROUND(
          (NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) +
          (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)),
          2
        ),
        grade = CASE
          WHEN ROUND((NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) + (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)), 2) >= (SELECT grade_a_min FROM grading_config WHERE id = 1) THEN 'A'
          WHEN ROUND((NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) + (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)), 2) >= (SELECT grade_b_min FROM grading_config WHERE id = 1) THEN 'B'
          WHEN ROUND((NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) + (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)), 2) >= (SELECT grade_c_min FROM grading_config WHERE id = 1) THEN 'C'
          WHEN ROUND((NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) + (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)), 2) >= (SELECT grade_d_min FROM grading_config WHERE id = 1) THEN 'D'
          ELSE 'E'
        END,
        remarks = CASE
          WHEN ROUND((NEW.exam_marks * (SELECT exam_weight FROM grading_config WHERE id = 1)) + (NEW.assignment_marks * (SELECT assignment_weight FROM grading_config WHERE id = 1)), 2) >= (SELECT pass_min FROM grading_config WHERE id = 1) THEN 'Pass'
          ELSE 'Fail'
        END
      WHERE result_id = NEW.result_id;
    END;

    -- =========================================================================
    -- Database Views (All 4 Required Views)
    -- =========================================================================
    DROP VIEW IF EXISTS student_results_view;
    CREATE VIEW student_results_view AS
    SELECT
      s.student_id,
      s.registration_number,
      (s.first_name || ' ' || s.last_name) AS student_name,
      c.course_id,
      c.course_code,
      c.course_name,
      c.lecturer_id,
      sem.semester_id,
      (sem.semester_name || ' (' || sem.academic_year || ')') AS semester,
      er.result_id,
      er.registration_id,
      er.exam_marks,
      er.assignment_marks,
      er.total_marks,
      er.grade,
      er.remarks
    FROM examination_results er
    INNER JOIN course_registrations cr ON er.registration_id = cr.registration_id
    INNER JOIN students s ON cr.student_id = s.student_id
    INNER JOIN courses c ON cr.course_id = c.course_id
    INNER JOIN semesters sem ON cr.semester_id = sem.semester_id;

    DROP VIEW IF EXISTS student_registration_view;
    CREATE VIEW student_registration_view AS
    SELECT
      cr.registration_id,
      s.student_id,
      s.registration_number,
      (s.first_name || ' ' || s.last_name) AS student_name,
      c.course_id,
      c.course_code,
      c.course_name,
      c.lecturer_id,
      sem.semester_id,
      sem.semester_name AS semester,
      sem.academic_year,
      cr.registration_date,
      cr.status AS registration_status
    FROM course_registrations cr
    INNER JOIN students s ON cr.student_id = s.student_id
    INNER JOIN courses c ON cr.course_id = c.course_id
    INNER JOIN semesters sem ON cr.semester_id = sem.semester_id;

    DROP VIEW IF EXISTS student_payment_view;
    CREATE VIEW student_payment_view AS
    SELECT
      fp.payment_id,
      s.student_id,
      s.registration_number,
      (s.first_name || ' ' || s.last_name) AS student_name,
      fp.amount_paid,
      fp.payment_date,
      fp.payment_method,
      fp.transaction_reference
    FROM fee_payments fp
    INNER JOIN students s ON fp.student_id = s.student_id;

    DROP VIEW IF EXISTS course_performance_view;
    CREATE VIEW course_performance_view AS
    SELECT
      c.course_id,
      c.course_code,
      c.course_name,
      c.lecturer_id,
      COUNT(DISTINCT cr.registration_id) AS number_of_registered_students,
      ROUND(AVG(er.total_marks), 2) AS average_marks,
      MAX(er.total_marks) AS highest_marks,
      MIN(er.total_marks) AS lowest_marks
    FROM courses c
    LEFT JOIN course_registrations cr ON c.course_id = cr.course_id
    LEFT JOIN examination_results er ON cr.registration_id = er.registration_id
    GROUP BY c.course_id, c.course_code, c.course_name, c.lecturer_id;

    -- =========================================================================
    -- Non-Redundant Indexes
    -- Note: UNIQUE columns (registration_number, email, course_code,
    -- uq_student_course_semester, examination_results.registration_id,
    -- transaction_reference) automatically have unique B-Tree indexes.
    -- =========================================================================
    CREATE INDEX IF NOT EXISTS idx_students_last_name ON students(last_name);
    CREATE INDEX IF NOT EXISTS idx_reg_course_id ON course_registrations(course_id);
    CREATE INDEX IF NOT EXISTS idx_reg_semester_id ON course_registrations(semester_id);
    CREATE INDEX IF NOT EXISTS idx_fee_payments_student_id ON fee_payments(student_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);
  `);

  const ensureColumn = (tableName: string, columnName: string, columnDef: string): void => {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (!columns.some((col) => col.name === columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    }
  };

  ensureColumn('app_users', 'recovery_hash', 'TEXT');
  ensureColumn('auth_sessions', 'last_active_at', 'INTEGER');
  ensureColumn('auth_sessions', 'device_label', 'TEXT');
}

// =============================================================================
// Stored Procedure Implementations (Parameterized Server-Side Procedures)
// =============================================================================
export const storedProcedures = {
  GetStudentDetails(studentId: number) {
    return db.prepare(`
      SELECT
        s.*,
        (SELECT COUNT(*) FROM course_registrations cr WHERE cr.student_id = s.student_id) AS total_courses_registered,
        (SELECT COALESCE(SUM(fp.amount_paid), 0.0) FROM fee_payments fp WHERE fp.student_id = s.student_id) AS total_fees_paid
      FROM students s
      WHERE s.student_id = ?
    `).get(studentId);
  },

  GetStudentResults(studentId: number) {
    return db.prepare(`
      SELECT
        er.result_id,
        cr.registration_id,
        s.registration_number,
        (s.first_name || ' ' || s.last_name) AS student_name,
        c.course_id,
        c.course_code,
        c.course_name,
        c.credit_hours,
        sem.semester_id,
        sem.semester_name,
        sem.academic_year,
        er.exam_marks,
        er.assignment_marks,
        er.total_marks,
        er.grade,
        er.remarks
      FROM examination_results er
      INNER JOIN course_registrations cr ON er.registration_id = cr.registration_id
      INNER JOIN students s ON cr.student_id = s.student_id
      INNER JOIN courses c ON cr.course_id = c.course_id
      INNER JOIN semesters sem ON cr.semester_id = sem.semester_id
      WHERE s.student_id = ?
      ORDER BY sem.start_date DESC, c.course_code ASC
    `).all(studentId);
  },

  GetStudentPayments(studentId: number) {
    return db.prepare(`
      SELECT
        fp.payment_id,
        s.registration_number,
        (s.first_name || ' ' || s.last_name) AS student_name,
        fp.amount_paid,
        fp.payment_date,
        fp.payment_method,
        fp.transaction_reference
      FROM fee_payments fp
      INNER JOIN students s ON fp.student_id = s.student_id
      WHERE fp.student_id = ?
      ORDER BY fp.payment_date DESC, fp.payment_id DESC
    `).all(studentId);
  },

  GetCourseRegistrations(semesterId: number | null) {
    return db.prepare(`
      SELECT
        cr.registration_id,
        s.student_id,
        s.registration_number,
        (s.first_name || ' ' || s.last_name) AS student_name,
        c.course_id,
        c.course_code,
        c.course_name,
        sem.semester_id,
        sem.semester_name,
        sem.academic_year,
        cr.registration_date,
        cr.status
      FROM course_registrations cr
      INNER JOIN students s ON cr.student_id = s.student_id
      INNER JOIN courses c ON cr.course_id = c.course_id
      INNER JOIN semesters sem ON cr.semester_id = sem.semester_id
      WHERE (? IS NULL OR cr.semester_id = ?)
      ORDER BY sem.start_date DESC, c.course_code ASC, s.last_name ASC
    `).all(semesterId, semesterId);
  },

  GetCourseStudentList(courseId: number, semesterId: number | null) {
    return db.prepare(`
      SELECT
        cr.registration_id,
        s.student_id,
        s.registration_number,
        (s.first_name || ' ' || s.last_name) AS student_name,
        s.email,
        s.course_of_study,
        s.year_of_study,
        sem.semester_id,
        sem.semester_name,
        sem.academic_year,
        cr.registration_date,
        cr.status AS registration_status,
        er.exam_marks,
        er.assignment_marks,
        er.total_marks,
        er.grade,
        er.remarks
      FROM course_registrations cr
      INNER JOIN students s ON cr.student_id = s.student_id
      INNER JOIN semesters sem ON cr.semester_id = sem.semester_id
      LEFT JOIN examination_results er ON cr.registration_id = er.registration_id
      WHERE cr.course_id = ?
        AND (? IS NULL OR cr.semester_id = ?)
      ORDER BY s.last_name ASC, s.first_name ASC
    `).all(courseId, semesterId, semesterId);
  },
};

const KIRINYAGA_UNIVERSITY_COURSES: ReadonlyArray<readonly [string, string, number]> = [
  // School of Business and Education
  ['BCOM', 'Bachelor of Commerce', 4],
  ['BBM', 'Bachelor of Business Management', 4],
  ['BPSM', 'Bachelor of Procurement and Supplies Management', 4],
  ['BHRM', 'Bachelor of Science in Human Resource Management', 4],
  ['BENT', 'Bachelor of Science in Entrepreneurship', 4],
  ['BEM', 'Bachelor of Enterprise Management', 4],
  ['BECON', 'Bachelor of Economics', 4],
  ['BECFIN', 'Bachelor of Economics and Finance', 4],
  ['BECSTAT', 'Bachelor of Economics and Statistics', 4],
  ['BECMATH', 'Bachelor of Economics and Mathematics', 4],
  ['BED-ARTS', 'Bachelor of Education (Arts)', 4],
  ['BED-SCI', 'Bachelor of Education (Science)', 4],
  ['BTED', 'Bachelor of Technology Education', 4],
  ['BA-GEN', 'Bachelor of Arts (General)', 4],
  ['BECED', 'Bachelor of Early Childhood Education', 4],
  ['BSNE', 'Bachelor of Special Needs Education', 4],
  ['DBM', 'Diploma in Business Management', 3],
  ['DENT', 'Diploma in Entrepreneurship', 3],
  ['DHRM', 'Diploma in Human Resource Management', 3],
  ['DPR', 'Diploma in Public Relations', 3],
  ['CBM', 'Certificate in Business Management', 2],
  ['CENT', 'Certificate in Entrepreneurship', 2],
  ['CHRM', 'Certificate in Human Resource Management', 2],
  ['CPR', 'Certificate in Public Relations', 2],

  // School of Pure and Applied Sciences
  ['BSC-CS', 'Bachelor of Science in Computer Science', 4],
  ['BSC-IT', 'Bachelor of Science in Information Technology', 4],
  ['BSC-SE', 'Bachelor of Science in Software Engineering', 4],
  ['BBIT', 'Bachelor of Business Information Technology', 4],
  ['BSC-ACT', 'Bachelor of Science in Actuarial Science', 4],
  ['BSC-STAT', 'Bachelor of Science in Statistics', 4],
  ['BSC-MATH', 'Bachelor of Science in Mathematics', 4],
  ['BSC-BIO', 'Bachelor of Science in Biology', 4],
  ['BSC-CHEM', 'Bachelor of Science in Chemistry', 4],
  ['BSC-PHY', 'Bachelor of Science in Physics', 4],
  ['DIT', 'Diploma in Information Technology', 3],
  ['DAS', 'Diploma in Applied Sciences', 3],

  // School of Engineering and Technology
  ['BTECH-BC', 'Bachelor of Technology in Building and Construction Technology', 4],
  ['BTECH-EE', 'Bachelor of Technology in Electrical and Electronics Technology', 4],
  ['BTECH-ME', 'Bachelor of Technology in Mechanical Engineering Technology', 4],
  ['BTECH-FT', 'Bachelor of Technology in Food and Textile Technology', 4],
  ['BSC-CE', 'Bachelor of Science in Civil Engineering', 4],
  ['BSC-EEE', 'Bachelor of Science in Electrical and Electronics Engineering', 4],
  ['BSC-ME', 'Bachelor of Science in Mechanical Engineering', 4],
  ['DCE', 'Diploma in Civil Engineering', 3],
  ['DME', 'Diploma in Mechanical Engineering', 3],
  ['DEEE', 'Diploma in Electrical and Electronics Engineering', 3],
  ['DBC', 'Diploma in Building Construction', 3],
  ['DQS', 'Diploma in Quantity Surveying', 3],
  ['DARCH', 'Diploma in Architecture', 3],
  ['CEEE', 'Certificate in Electrical and Electronics Engineering', 2],
  ['CME', 'Certificate in Mechanical Engineering', 2],
  ['CBC', 'Certificate in Building Construction', 2],
  ['CARCH', 'Certificate in Architectural Studies', 2],

  // School of Health Sciences
  ['BSN', 'Bachelor of Science in Nursing', 4],
  ['BSC-CM', 'Bachelor of Science in Clinical Medicine and Community Health', 4],
  ['BSC-FS', 'Bachelor of Science in Forensic Science', 4],
  ['BSC-CHD', 'Bachelor of Science in Community Health and Development', 4],
  ['PGD-ONC', 'Post Graduate Diploma in Nursing Oncology and Palliative Care', 4],
  ['PGD-PER', 'Post Graduate Diploma in Perioperative Nursing', 4],
  ['PGD-MID', 'Post Graduate Diploma in Nursing Midwifery', 4],
  ['PGD-NED', 'Post Graduate Diploma in Nursing Education', 4],

  // School of Hospitality and Textile Technology
  ['BSC-FDT', 'Bachelor of Science in Fashion Design and Textile Technology', 4],
  ['BSC-TE', 'Bachelor of Science in Textile Engineering', 4],
  ['BID', 'Bachelor in Interior Design', 4],
  ['BSC-CBT', 'Bachelor of Science in Cosmetology and Beauty Therapy', 4],
  ['DHM', 'Diploma in Hospitality Management', 3],
  ['DFBM', 'Diploma in Food and Beverage Management', 3],
  ['DFDT', 'Diploma in Fashion Design and Textile Technology', 3],
  ['CFDT', 'Certificate in Fashion Design and Textile Technology', 2],
  ['CFB', 'Certificate in Food and Beverage Production Services and Sales', 2],
];

export function seedKirinyagaCoursesOnce(): void {
  const done = db
    .prepare("SELECT meta_value FROM app_meta WHERE meta_key = 'kyu_courses_v1'")
    .get() as { meta_value: string } | undefined;
  if (done) return;

  const insertCourse = db.prepare(`
    INSERT OR IGNORE INTO courses (course_code, course_name, credit_hours, lecturer_id)
    VALUES (?, ?, ?, NULL)
  `);

  const tx = db.transaction(() => {
    for (const [code, name, credits] of KIRINYAGA_UNIVERSITY_COURSES) {
      insertCourse.run(code, name, credits);
    }
    db.prepare(
      "INSERT OR REPLACE INTO app_meta (meta_key, meta_value) VALUES ('kyu_courses_v1', '1')"
    ).run();
  });

  tx();
}

initializeSchemaAndObjects();
seedKirinyagaCoursesOnce();


