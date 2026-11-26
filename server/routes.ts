import fs from 'fs';
import path from 'path';
import type { Express, Response } from 'express';
import {
  BACKUPS_DIR,
  db,
  initializeSchemaAndObjects,
  storedProcedures,
} from './db.ts';

function handleSqlError(res: Response, err: unknown, fallbackMessage: string): void {
  const msg = err instanceof Error ? err.message : fallbackMessage;
  if (msg.includes('Validation Error:')) {
    res.status(400).json({ error: msg.replace(/^.*Validation Error:\s*/, 'Validation Error: ') });
    return;
  }
  if (msg.includes('UNIQUE constraint failed')) {
    if (msg.includes('students.registration_number')) {
      res.status(409).json({ error: 'A student with this registration number already exists.' });
      return;
    }
    if (msg.includes('students.email')) {
      res.status(409).json({ error: 'A student with this email address already exists.' });
      return;
    }
    if (msg.includes('lecturers.email')) {
      res.status(409).json({ error: 'A lecturer with this email address already exists.' });
      return;
    }
    if (msg.includes('courses.course_code')) {
      res.status(409).json({ error: 'A course with this course code already exists.' });
      return;
    }
    if (msg.includes('course_registrations.student_id')) {
      res.status(409).json({
        error: 'Duplicate registration prevented: this student is already registered for this course in the selected semester.',
      });
      return;
    }
    if (msg.includes('examination_results.registration_id')) {
      res.status(409).json({ error: 'Examination results already exist for this course registration.' });
      return;
    }
    if (msg.includes('fee_payments.transaction_reference')) {
      res.status(409).json({ error: 'A payment with this transaction reference already exists.' });
      return;
    }
    res.status(409).json({ error: 'Duplicate record violates a UNIQUE database constraint.' });
    return;
  }
  if (msg.includes('FOREIGN KEY constraint failed')) {
    res.status(409).json({
      error: 'Operation blocked by foreign key integrity constraint: related records exist.',
    });
    return;
  }
  if (msg.includes('CHECK constraint failed')) {
    res.status(400).json({ error: 'Input violates a database CHECK constraint (e.g., invalid range or date order).' });
    return;
  }
  res.status(400).json({ error: msg || fallbackMessage });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeSqlValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

export function registerApiRoutes(app: Express): void {
  // ===========================================================================
  // 1. DASHBOARD (Real Database Queries)
  // ===========================================================================
  app.get('/api/dashboard', (_req, res) => {
    const totalStudents = (db.prepare('SELECT COUNT(*) AS cnt FROM students').get() as { cnt: number }).cnt;
    const totalLecturers = (db.prepare('SELECT COUNT(*) AS cnt FROM lecturers').get() as { cnt: number }).cnt;
    const totalCourses = (db.prepare('SELECT COUNT(*) AS cnt FROM courses').get() as { cnt: number }).cnt;
    const totalRegistrations = (db.prepare('SELECT COUNT(*) AS cnt FROM course_registrations').get() as { cnt: number }).cnt;
    const paymentAgg = db
      .prepare('SELECT COUNT(*) AS count, COALESCE(SUM(amount_paid), 0) AS total_amount FROM fee_payments')
      .get() as { count: number; total_amount: number };

    const activeSemester = db
      .prepare("SELECT semester_id, semester_name, academic_year, start_date, end_date FROM semesters WHERE status = 'Active' ORDER BY start_date DESC LIMIT 1")
      .get();

    const recentRegistrations = db
      .prepare(`
        SELECT registration_id, registration_number, student_name, course_code, course_name, semester, academic_year, registration_date, registration_status
        FROM student_registration_view
        ORDER BY registration_date DESC, registration_id DESC
        LIMIT 6
      `)
      .all();

    const recentPayments = db
      .prepare(`
        SELECT payment_id, registration_number, student_name, amount_paid, payment_date, payment_method, transaction_reference
        FROM student_payment_view
        ORDER BY payment_date DESC, payment_id DESC
        LIMIT 6
      `)
      .all();

    const coursePerformance = db
      .prepare(`
        SELECT course_id, course_code, course_name, number_of_registered_students, average_marks, highest_marks, lowest_marks
        FROM course_performance_view
        ORDER BY course_code ASC
      `)
      .all();

    const examSummary = db
      .prepare(`
        SELECT
          COUNT(*) AS total_graded,
          SUM(CASE WHEN remarks = 'Pass' THEN 1 ELSE 0 END) AS total_passed,
          SUM(CASE WHEN remarks = 'Fail' THEN 1 ELSE 0 END) AS total_failed,
          ROUND(AVG(total_marks), 2) AS overall_average
        FROM examination_results
      `)
      .get();

    const gradeDistribution = db
      .prepare(`
        SELECT grade, COUNT(*) AS count
        FROM examination_results
        GROUP BY grade
        ORDER BY grade ASC
      `)
      .all();

    res.json({
      counts: {
        students: totalStudents,
        lecturers: totalLecturers,
        courses: totalCourses,
        registrations: totalRegistrations,
        paymentCount: paymentAgg.count,
        totalFeesCollected: paymentAgg.total_amount,
      },
      activeSemester: activeSemester ?? null,
      recentRegistrations,
      recentPayments,
      coursePerformance,
      examSummary,
      gradeDistribution,
    });
  });

  // ===========================================================================
  // 2. STUDENT MANAGEMENT MODULE
  // ===========================================================================
  app.get('/api/students/generate-reg-number', (_req, res) => {
    const year = new Date().getFullYear();
    const row = db
      .prepare('SELECT COALESCE(MAX(student_id), 0) + 1 AS next_num FROM students')
      .get() as { next_num: number };
    const settings = db
      .prepare('SELECT reg_number_prefix FROM portal_settings WHERE id = 1')
      .get() as { reg_number_prefix: string } | undefined;
    const rawPrefix = settings?.reg_number_prefix?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'UNI';
    const prefix = rawPrefix.length >= 2 ? rawPrefix : 'UNI';
    const padded = String(row.next_num).padStart(3, '0');
    res.json({ registration_number: `${prefix}-${year}-${padded}` });
  });

  app.get('/api/students', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const year = req.query.year ? Number(req.query.year) : null;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 12));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push(
        '(s.registration_number LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ? OR (s.first_name || " " || s.last_name) LIKE ? OR s.email LIKE ?)'
      );
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }
    if (year && Number.isInteger(year)) {
      conditions.push('s.year_of_study = ?');
      params.push(year);
    }
    if (status) {
      conditions.push('s.status = ?');
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM students s ${whereClause}`)
      .get(...params) as { cnt: number };

    const students = db
      .prepare(`
        SELECT s.*
        FROM students s
        ${whereClause}
        ORDER BY s.student_id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset);

    res.json({
      students,
      pagination: {
        page,
        limit,
        total: totalRow.cnt,
        totalPages: Math.max(1, Math.ceil(totalRow.cnt / limit)),
      },
    });
  });

  app.get('/api/students/:id/profile', (req, res) => {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId)) {
      res.status(400).json({ error: 'Invalid student ID.' });
      return;
    }

    const details = storedProcedures.GetStudentDetails(studentId) as Record<string, unknown> | undefined;
    if (!details) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const results = storedProcedures.GetStudentResults(studentId);
    const registrations = db
      .prepare(`
        SELECT registration_id, course_code, course_name, semester, academic_year, registration_date, registration_status
        FROM student_registration_view
        WHERE student_id = ?
        ORDER BY registration_date DESC
      `)
      .all(studentId);
    const payments = storedProcedures.GetStudentPayments(studentId);

    res.json({ details, results, registrations, payments });
  });

  app.post('/api/students', (req, res) => {
    const {
      registration_number,
      first_name,
      last_name,
      gender,
      email,
      phone,
      course_of_study,
      year_of_study,
      date_registered,
      status,
    } = req.body ?? {};

    if (
      typeof registration_number !== 'string' ||
      !registration_number.trim() ||
      typeof first_name !== 'string' ||
      !first_name.trim() ||
      typeof last_name !== 'string' ||
      !last_name.trim()
    ) {
      res.status(400).json({ error: 'Registration number, first name, and last name are required.' });
      return;
    }
    if (email && (typeof email !== 'string' || !isValidEmail(email.trim()))) {
      res.status(400).json({ error: 'Provide a valid student email address.' });
      return;
    }
    const yearNum = Number(year_of_study);
    if (!Number.isInteger(yearNum) || yearNum < 1 || yearNum > 6) {
      res.status(400).json({ error: 'Year of study must be an integer between 1 and 6.' });
      return;
    }

    try {
      const regDate =
        typeof date_registered === 'string' && date_registered.trim()
          ? date_registered.trim()
          : new Date().toISOString().slice(0, 10);

      const info = db
        .prepare(`
          INSERT INTO students (
            registration_number, first_name, last_name, gender, email, phone,
            course_of_study, year_of_study, date_registered, status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          registration_number.trim().toUpperCase(),
          first_name.trim(),
          last_name.trim(),
          gender || 'Other',
          email ? email.trim().toLowerCase() : null,
          phone ? String(phone).trim() : null,
          course_of_study ? String(course_of_study).trim() : 'General Studies',
          yearNum,
          regDate,
          status || 'Active'
        );

      const created = db.prepare('SELECT * FROM students WHERE student_id = ?').get(info.lastInsertRowid);
      res.status(201).json({ student: created });
    } catch (err) {
      handleSqlError(res, err, 'Failed to register student.');
    }
  });

  app.put('/api/students/:id', (req, res) => {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId)) {
      res.status(400).json({ error: 'Invalid student ID.' });
      return;
    }
    const {
      registration_number,
      first_name,
      last_name,
      gender,
      email,
      phone,
      course_of_study,
      year_of_study,
      date_registered,
      status,
    } = req.body ?? {};

    if (!registration_number?.trim() || !first_name?.trim() || !last_name?.trim()) {
      res.status(400).json({ error: 'Registration number, first name, and last name are required.' });
      return;
    }
    if (email && !isValidEmail(String(email).trim())) {
      res.status(400).json({ error: 'Provide a valid student email address.' });
      return;
    }
    const yearNum = Number(year_of_study);
    if (!Number.isInteger(yearNum) || yearNum < 1 || yearNum > 6) {
      res.status(400).json({ error: 'Year of study must be between 1 and 6.' });
      return;
    }

    try {
      const result = db
        .prepare(`
          UPDATE students
          SET registration_number = ?, first_name = ?, last_name = ?, gender = ?,
              email = ?, phone = ?, course_of_study = ?, year_of_study = ?,
              date_registered = ?, status = ?
          WHERE student_id = ?
        `)
        .run(
          String(registration_number).trim().toUpperCase(),
          String(first_name).trim(),
          String(last_name).trim(),
          gender || 'Other',
          email ? String(email).trim().toLowerCase() : null,
          phone ? String(phone).trim() : null,
          course_of_study ? String(course_of_study).trim() : 'General Studies',
          yearNum,
          date_registered || new Date().toISOString().slice(0, 10),
          status || 'Active',
          studentId
        );

      if (result.changes === 0) {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }
      const updated = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
      res.json({ student: updated });
    } catch (err) {
      handleSqlError(res, err, 'Failed to update student record.');
    }
  });

  app.delete('/api/students/:id', (req, res) => {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId)) {
      res.status(400).json({ error: 'Invalid student ID.' });
      return;
    }
    try {
      const result = db.prepare('DELETE FROM students WHERE student_id = ?').run(studentId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }
      res.json({ message: 'Student record deleted.' });
    } catch (err) {
      handleSqlError(res, err, 'Cannot delete student with existing fee payment records.');
    }
  });

  // ===========================================================================
  // 3. LECTURER MANAGEMENT MODULE
  // ===========================================================================
  app.get('/api/lecturers', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const department = typeof req.query.department === 'string' ? req.query.department.trim() : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push('(l.first_name LIKE ? OR l.last_name LIKE ? OR l.email LIKE ? OR l.department LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (department) {
      conditions.push('l.department = ?');
      params.push(department);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const lecturers = db
      .prepare(`
        SELECT l.*,
               COUNT(c.course_id) AS assigned_courses_count,
               GROUP_CONCAT(c.course_code, ', ') AS assigned_course_codes
        FROM lecturers l
        LEFT JOIN courses c ON l.lecturer_id = c.lecturer_id
        ${whereClause}
        GROUP BY l.lecturer_id
        ORDER BY l.last_name ASC, l.first_name ASC
      `)
      .all(...params);

    const departments = db
      .prepare('SELECT DISTINCT department FROM lecturers ORDER BY department ASC')
      .all() as Array<{ department: string }>;

    res.json({ lecturers, departments: departments.map((d) => d.department) });
  });

  app.post('/api/lecturers', (req, res) => {
    const { first_name, last_name, email, phone, department } = req.body ?? {};
    if (!first_name?.trim() || !last_name?.trim() || !department?.trim()) {
      res.status(400).json({ error: 'First name, last name, and department are required.' });
      return;
    }
    if (email && !isValidEmail(String(email).trim())) {
      res.status(400).json({ error: 'Provide a valid lecturer email address.' });
      return;
    }

    try {
      const info = db
        .prepare(`
          INSERT INTO lecturers (first_name, last_name, email, phone, department)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(
          String(first_name).trim(),
          String(last_name).trim(),
          email ? String(email).trim().toLowerCase() : null,
          phone ? String(phone).trim() : null,
          String(department).trim()
        );
      const created = db.prepare('SELECT * FROM lecturers WHERE lecturer_id = ?').get(info.lastInsertRowid);
      res.status(201).json({ lecturer: created });
    } catch (err) {
      handleSqlError(res, err, 'Failed to create lecturer.');
    }
  });

  app.put('/api/lecturers/:id', (req, res) => {
    const lecturerId = Number(req.params.id);
    if (!Number.isInteger(lecturerId)) {
      res.status(400).json({ error: 'Invalid lecturer ID.' });
      return;
    }
    const { first_name, last_name, email, phone, department } = req.body ?? {};
    if (!first_name?.trim() || !last_name?.trim() || !department?.trim()) {
      res.status(400).json({ error: 'First name, last name, and department are required.' });
      return;
    }
    if (email && !isValidEmail(String(email).trim())) {
      res.status(400).json({ error: 'Provide a valid email address.' });
      return;
    }

    try {
      const result = db
        .prepare(`
          UPDATE lecturers
          SET first_name = ?, last_name = ?, email = ?, phone = ?, department = ?
          WHERE lecturer_id = ?
        `)
        .run(
          String(first_name).trim(),
          String(last_name).trim(),
          email ? String(email).trim().toLowerCase() : null,
          phone ? String(phone).trim() : null,
          String(department).trim(),
          lecturerId
        );
      if (result.changes === 0) {
        res.status(404).json({ error: 'Lecturer not found.' });
        return;
      }
      const updated = db.prepare('SELECT * FROM lecturers WHERE lecturer_id = ?').get(lecturerId);
      res.json({ lecturer: updated });
    } catch (err) {
      handleSqlError(res, err, 'Failed to update lecturer.');
    }
  });

  app.delete('/api/lecturers/:id', (req, res) => {
    const lecturerId = Number(req.params.id);
    if (!Number.isInteger(lecturerId)) {
      res.status(400).json({ error: 'Invalid lecturer ID.' });
      return;
    }
    try {
      const result = db.prepare('DELETE FROM lecturers WHERE lecturer_id = ?').run(lecturerId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Lecturer not found.' });
        return;
      }
      res.json({ message: 'Lecturer record deleted.' });
    } catch (err) {
      handleSqlError(res, err, 'Cannot delete lecturer while assigned to active courses.');
    }
  });

  // ===========================================================================
  // 4. COURSE MANAGEMENT MODULE
  // ===========================================================================
  app.get('/api/courses', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push('(c.course_code LIKE ? OR c.course_name LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const courses = db
      .prepare(`
        SELECT c.*,
               (l.first_name || ' ' || l.last_name) AS lecturer_name,
               l.department AS lecturer_department,
               (SELECT COUNT(*) FROM course_registrations cr WHERE cr.course_id = c.course_id) AS enrolled_count
        FROM courses c
        LEFT JOIN lecturers l ON c.lecturer_id = l.lecturer_id
        ${whereClause}
        ORDER BY c.course_code ASC
      `)
      .all(...params);

    res.json({ courses });
  });

  app.get('/api/courses/:id/students', (req, res) => {
    const courseId = Number(req.params.id);
    const semesterId = req.query.semesterId ? Number(req.query.semesterId) : null;
    if (!Number.isInteger(courseId)) {
      res.status(400).json({ error: 'Invalid course ID.' });
      return;
    }
    const course = db.prepare('SELECT * FROM courses WHERE course_id = ?').get(courseId);
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    const students = storedProcedures.GetCourseStudentList(courseId, semesterId);
    res.json({ course, students });
  });

  app.post('/api/courses', (req, res) => {
    const { course_code, course_name, credit_hours, lecturer_id } = req.body ?? {};
    if (!course_code?.trim() || !course_name?.trim()) {
      res.status(400).json({ error: 'Course code and course name are required.' });
      return;
    }
    const credits = Number(credit_hours);
    if (!Number.isInteger(credits) || credits < 1 || credits > 12) {
      res.status(400).json({ error: 'Credit hours must be an integer between 1 and 12.' });
      return;
    }

    try {
      const info = db
        .prepare(`
          INSERT INTO courses (course_code, course_name, credit_hours, lecturer_id)
          VALUES (?, ?, ?, ?)
        `)
        .run(
          String(course_code).trim().toUpperCase(),
          String(course_name).trim(),
          credits,
          lecturer_id ? Number(lecturer_id) : null
        );
      const created = db.prepare('SELECT * FROM courses WHERE course_id = ?').get(info.lastInsertRowid);
      res.status(201).json({ course: created });
    } catch (err) {
      handleSqlError(res, err, 'Failed to create course.');
    }
  });

  app.put('/api/courses/:id', (req, res) => {
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId)) {
      res.status(400).json({ error: 'Invalid course ID.' });
      return;
    }
    const { course_code, course_name, credit_hours, lecturer_id } = req.body ?? {};
    if (!course_code?.trim() || !course_name?.trim()) {
      res.status(400).json({ error: 'Course code and course name are required.' });
      return;
    }
    const credits = Number(credit_hours);
    if (!Number.isInteger(credits) || credits < 1 || credits > 12) {
      res.status(400).json({ error: 'Credit hours must be between 1 and 12.' });
      return;
    }

    try {
      const result = db
        .prepare(`
          UPDATE courses
          SET course_code = ?, course_name = ?, credit_hours = ?, lecturer_id = ?
          WHERE course_id = ?
        `)
        .run(
          String(course_code).trim().toUpperCase(),
          String(course_name).trim(),
          credits,
          lecturer_id ? Number(lecturer_id) : null,
          courseId
        );
      if (result.changes === 0) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      const updated = db.prepare('SELECT * FROM courses WHERE course_id = ?').get(courseId);
      res.json({ course: updated });
    } catch (err) {
      handleSqlError(res, err, 'Failed to update course.');
    }
  });

  app.delete('/api/courses/:id', (req, res) => {
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId)) {
      res.status(400).json({ error: 'Invalid course ID.' });
      return;
    }
    try {
      const result = db.prepare('DELETE FROM courses WHERE course_id = ?').run(courseId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Course not found.' });
        return;
      }
      res.json({ message: 'Course deleted.' });
    } catch (err) {
      handleSqlError(res, err, 'Cannot delete course with existing student registrations.');
    }
  });

  // ===========================================================================
  // 5. SEMESTER MANAGEMENT MODULE
  // ===========================================================================
  app.get('/api/semesters', (_req, res) => {
    const semesters = db
      .prepare(`
        SELECT sem.*,
               (SELECT COUNT(*) FROM course_registrations cr WHERE cr.semester_id = sem.semester_id) AS registration_count
        FROM semesters sem
        ORDER BY sem.start_date DESC
      `)
      .all();
    res.json({ semesters });
  });

  app.post('/api/semesters', (req, res) => {
    const { semester_name, academic_year, start_date, end_date, status } = req.body ?? {};
    if (!semester_name?.trim() || !academic_year?.trim() || !start_date || !end_date) {
      res.status(400).json({ error: 'Semester name, academic year, start date, and end date are required.' });
      return;
    }
    if (String(end_date) <= String(start_date)) {
      res.status(400).json({ error: 'End date must be after start date.' });
      return;
    }

    try {
      const created = db.transaction(() => {
        if (status === 'Active') {
          db.prepare("UPDATE semesters SET status = 'Completed' WHERE status = 'Active'").run();
        }
        const info = db
          .prepare(`
            INSERT INTO semesters (semester_name, academic_year, start_date, end_date, status)
            VALUES (?, ?, ?, ?, ?)
          `)
          .run(
            String(semester_name).trim(),
            String(academic_year).trim(),
            String(start_date),
            String(end_date),
            status || 'Upcoming'
          );
        return db.prepare('SELECT * FROM semesters WHERE semester_id = ?').get(info.lastInsertRowid);
      })();
      res.status(201).json({ semester: created });
    } catch (err) {
      handleSqlError(res, err, 'Failed to create semester.');
    }
  });

  app.put('/api/semesters/:id', (req, res) => {
    const semesterId = Number(req.params.id);
    if (!Number.isInteger(semesterId)) {
      res.status(400).json({ error: 'Invalid semester ID.' });
      return;
    }
    const { semester_name, academic_year, start_date, end_date, status } = req.body ?? {};
    if (!semester_name?.trim() || !academic_year?.trim() || !start_date || !end_date) {
      res.status(400).json({ error: 'All semester fields are required.' });
      return;
    }
    if (String(end_date) <= String(start_date)) {
      res.status(400).json({ error: 'End date must be after start date.' });
      return;
    }

    try {
      const updated = db.transaction(() => {
        if (status === 'Active') {
          db.prepare("UPDATE semesters SET status = 'Completed' WHERE status = 'Active' AND semester_id != ?").run(
            semesterId
          );
        }
        const result = db
          .prepare(`
            UPDATE semesters
            SET semester_name = ?, academic_year = ?, start_date = ?, end_date = ?, status = ?
            WHERE semester_id = ?
          `)
          .run(
            String(semester_name).trim(),
            String(academic_year).trim(),
            String(start_date),
            String(end_date),
            status || 'Upcoming',
            semesterId
          );
        if (result.changes === 0) return null;
        return db.prepare('SELECT * FROM semesters WHERE semester_id = ?').get(semesterId);
      })();
      if (!updated) {
        res.status(404).json({ error: 'Semester not found.' });
        return;
      }
      res.json({ semester: updated });
    } catch (err) {
      handleSqlError(res, err, 'Failed to update semester.');
    }
  });

  app.delete('/api/semesters/:id', (req, res) => {
    const semesterId = Number(req.params.id);
    if (!Number.isInteger(semesterId)) {
      res.status(400).json({ error: 'Invalid semester ID.' });
      return;
    }
    try {
      const result = db.prepare('DELETE FROM semesters WHERE semester_id = ?').run(semesterId);
      if (result.changes === 0) {
        res.status(404).json({ error: 'Semester not found.' });
        return;
      }
      res.json({ message: 'Semester deleted.' });
    } catch (err) {
      handleSqlError(res, err, 'Cannot delete semester with existing course registrations.');
    }
  });

  // ===========================================================================
  // 6. COURSE REGISTRATION MODULE
  // ===========================================================================
  app.get('/api/registrations', (req, res) => {
    const semesterId = req.query.semesterId ? Number(req.query.semesterId) : null;
    const courseId = req.query.courseId ? Number(req.query.courseId) : null;
    const studentId = req.query.studentId ? Number(req.query.studentId) : null;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 15));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (semesterId && Number.isInteger(semesterId)) {
      conditions.push('semester_id = ?');
      params.push(semesterId);
    }
    if (courseId && Number.isInteger(courseId)) {
      conditions.push('course_id = ?');
      params.push(courseId);
    }
    if (studentId && Number.isInteger(studentId)) {
      conditions.push('student_id = ?');
      params.push(studentId);
    }
    if (search) {
      conditions.push('(registration_number LIKE ? OR student_name LIKE ? OR course_code LIKE ? OR course_name LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM student_registration_view ${whereClause}`)
      .get(...params) as { cnt: number };

    const registrations = db
      .prepare(`
        SELECT *
        FROM student_registration_view
        ${whereClause}
        ORDER BY registration_date DESC, registration_id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset);

    res.json({
      registrations,
      pagination: {
        page,
        limit,
        total: totalRow.cnt,
        totalPages: Math.max(1, Math.ceil(totalRow.cnt / limit)),
      },
    });
  });

  app.post('/api/registrations', (req, res) => {
    const { student_id, course_id, semester_id, registration_date, status } = req.body ?? {};
    const sId = Number(student_id);
    const cId = Number(course_id);
    const semId = Number(semester_id);
    if (!Number.isInteger(sId) || !Number.isInteger(cId) || !Number.isInteger(semId)) {
      res.status(400).json({ error: 'Student, course, and semester must all be selected.' });
      return;
    }

    try {
      const created = db.transaction(() => {
        const studentExists = db.prepare('SELECT 1 FROM students WHERE student_id = ?').get(sId);
        const courseExists = db.prepare('SELECT 1 FROM courses WHERE course_id = ?').get(cId);
        const semExists = db.prepare('SELECT 1 FROM semesters WHERE semester_id = ?').get(semId);
        if (!studentExists || !courseExists || !semExists) {
          throw new Error('Foreign key validation failed: referenced student, course, or semester does not exist.');
        }

        const regDate =
          typeof registration_date === 'string' && registration_date.trim()
            ? registration_date.trim()
            : new Date().toISOString().slice(0, 10);

        const info = db
          .prepare(`
            INSERT INTO course_registrations (student_id, course_id, semester_id, registration_date, status)
            VALUES (?, ?, ?, ?, ?)
          `)
          .run(sId, cId, semId, regDate, status || 'Registered');

        return db
          .prepare('SELECT * FROM student_registration_view WHERE registration_id = ?')
          .get(info.lastInsertRowid);
      })();

      res.status(201).json({ registration: created });
    } catch (err) {
      handleSqlError(res, err, 'Failed to register student for course.');
    }
  });

  app.post('/api/registrations/bulk', (req, res) => {
    const { student_id, semester_id, course_ids, registration_date, status } = req.body ?? {};
    const sId = Number(student_id);
    const semId = Number(semester_id);
    const rawCourseIds: unknown[] = Array.isArray(course_ids) ? course_ids : [];

    if (!Number.isInteger(sId) || !Number.isInteger(semId)) {
      res.status(400).json({ error: 'Student and academic semester must both be selected.' });
      return;
    }

    const uniqueCourseIds = Array.from(
      new Set(rawCourseIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
    );

    if (uniqueCourseIds.length === 0 || uniqueCourseIds.length > 50) {
      res.status(400).json({ error: 'Select between 1 and 50 courses to enroll.' });
      return;
    }

    const cleanStatus = ['Registered', 'Dropped', 'Completed'].includes(status)
      ? status
      : 'Registered';

    const regDate =
      typeof registration_date === 'string' && registration_date.trim()
        ? registration_date.trim()
        : new Date().toISOString().slice(0, 10);

    try {
      const summary = db.transaction(() => {
        const studentExists = db.prepare('SELECT 1 FROM students WHERE student_id = ?').get(sId);
        const semExists = db.prepare('SELECT 1 FROM semesters WHERE semester_id = ?').get(semId);
        if (!studentExists || !semExists) {
          throw new Error('Foreign key validation failed: referenced student or semester does not exist.');
        }

        const checkCourse = db.prepare('SELECT 1 FROM courses WHERE course_id = ?');
        const checkExisting = db.prepare(
          'SELECT 1 FROM course_registrations WHERE student_id = ? AND course_id = ? AND semester_id = ?'
        );
        const insertReg = db.prepare(`
          INSERT INTO course_registrations (student_id, course_id, semester_id, registration_date, status)
          VALUES (?, ?, ?, ?, ?)
        `);

        let enrolledCount = 0;
        let skippedCount = 0;

        for (const cId of uniqueCourseIds) {
          if (!checkCourse.get(cId)) {
            throw new Error('Foreign key validation failed: one or more selected courses do not exist.');
          }
          if (checkExisting.get(sId, cId, semId)) {
            skippedCount += 1;
            continue;
          }
          insertReg.run(sId, cId, semId, regDate, cleanStatus);
          enrolledCount += 1;
        }

        return { enrolledCount, skippedCount };
      })();

      res.status(201).json(summary);
    } catch (err) {
      handleSqlError(res, err, 'Failed to enroll student in selected courses.');
    }
  });

  app.patch('/api/registrations/:id/status', (req, res) => {
    const regId = Number(req.params.id);
    const { status } = req.body ?? {};
    if (!Number.isInteger(regId) || !['Registered', 'Dropped', 'Completed'].includes(status)) {
      res.status(400).json({ error: 'Valid registration ID and status (Registered, Dropped, Completed) required.' });
      return;
    }
    const result = db
      .prepare('UPDATE course_registrations SET status = ? WHERE registration_id = ?')
      .run(status, regId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Registration record not found.' });
      return;
    }
    const updated = db.prepare('SELECT * FROM student_registration_view WHERE registration_id = ?').get(regId);
    res.json({ registration: updated });
  });

  app.delete('/api/registrations/:id', (req, res) => {
    const regId = Number(req.params.id);
    if (!Number.isInteger(regId)) {
      res.status(400).json({ error: 'Invalid registration ID.' });
      return;
    }
    const result = db.prepare('DELETE FROM course_registrations WHERE registration_id = ?').run(regId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Registration record not found.' });
      return;
    }
    res.json({ message: 'Course registration deleted.' });
  });

  // ===========================================================================
  // 7. EXAMINATION MANAGEMENT MODULE (Trigger-Driven Validation & Grading)
  // ===========================================================================
  app.get('/api/examinations', (req, res) => {
    const semesterId = req.query.semesterId ? Number(req.query.semesterId) : null;
    const courseId = req.query.courseId ? Number(req.query.courseId) : null;
    const studentId = req.query.studentId ? Number(req.query.studentId) : null;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (semesterId && Number.isInteger(semesterId)) {
      conditions.push('sem.semester_id = ?');
      params.push(semesterId);
    }
    if (courseId && Number.isInteger(courseId)) {
      conditions.push('c.course_id = ?');
      params.push(courseId);
    }
    if (studentId && Number.isInteger(studentId)) {
      conditions.push('s.student_id = ?');
      params.push(studentId);
    }
    if (search) {
      conditions.push(
        '(s.registration_number LIKE ? OR (s.first_name || " " || s.last_name) LIKE ? OR c.course_code LIKE ? OR c.course_name LIKE ?)'
      );
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(`
        SELECT
          cr.registration_id,
          cr.status AS registration_status,
          s.student_id,
          s.registration_number,
          (s.first_name || ' ' || s.last_name) AS student_name,
          c.course_id,
          c.course_code,
          c.course_name,
          c.credit_hours,
          c.lecturer_id,
          sem.semester_id,
          sem.semester_name,
          sem.academic_year,
          er.result_id,
          er.exam_marks,
          er.assignment_marks,
          er.total_marks,
          er.grade,
          er.remarks
        FROM course_registrations cr
        INNER JOIN students s ON cr.student_id = s.student_id
        INNER JOIN courses c ON cr.course_id = c.course_id
        INNER JOIN semesters sem ON cr.semester_id = sem.semester_id
        LEFT JOIN examination_results er ON cr.registration_id = er.registration_id
        ${whereClause}
        ORDER BY sem.start_date DESC, c.course_code ASC, s.last_name ASC
      `)
      .all(...params);

    const gradingConfig = db.prepare('SELECT * FROM grading_config WHERE id = 1').get();
    res.json({ examinations: rows, gradingConfig });
  });

  app.get('/api/examinations/performance', (_req, res) => {
    const performance = db.prepare('SELECT * FROM course_performance_view ORDER BY course_code ASC').all();
    res.json({ performance });
  });

  app.get('/api/examinations/student/:studentId', (req, res) => {
    const studentId = Number(req.params.studentId);
    if (!Number.isInteger(studentId)) {
      res.status(400).json({ error: 'Invalid student ID.' });
      return;
    }

    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    const results = storedProcedures.GetStudentResults(studentId) as Array<{
      total_marks: number;
      remarks: string;
      credit_hours: number;
    }>;
    const totalCourses = results.length;
    const passed = results.filter((r) => r.remarks === 'Pass').length;
    const avgMarks =
      totalCourses > 0
        ? Number((results.reduce((acc, r) => acc + Number(r.total_marks), 0) / totalCourses).toFixed(2))
        : 0;

    res.json({
      student,
      results,
      summary: {
        totalCourses,
        passed,
        failed: totalCourses - passed,
        averageMarks: avgMarks,
      },
    });
  });

  app.post('/api/examinations', (req, res) => {
    const { registration_id, exam_marks, assignment_marks } = req.body ?? {};
    const regId = Number(registration_id);
    const examNum = Number(exam_marks);
    const assignNum = Number(assignment_marks);

    if (!Number.isInteger(regId) || Number.isNaN(examNum) || Number.isNaN(assignNum)) {
      res.status(400).json({ error: 'Registration ID, exam marks, and assignment marks must be valid numbers.' });
      return;
    }

    const reg = db
      .prepare('SELECT registration_id FROM course_registrations WHERE registration_id = ?')
      .get(regId);

    if (!reg) {
      res.status(404).json({ error: 'Course registration not found.' });
      return;
    }

    try {
      const saved = db.transaction(() => {
        const existing = db
          .prepare('SELECT result_id FROM examination_results WHERE registration_id = ?')
          .get(regId) as { result_id: number } | undefined;

        if (existing) {
          db.prepare(`
            UPDATE examination_results
            SET exam_marks = ?, assignment_marks = ?
            WHERE result_id = ?
          `).run(examNum, assignNum, existing.result_id);
        } else {
          db.prepare(`
            INSERT INTO examination_results (registration_id, exam_marks, assignment_marks)
            VALUES (?, ?, ?)
          `).run(regId, examNum, assignNum);
        }

        return db.prepare('SELECT * FROM student_results_view WHERE registration_id = ?').get(regId);
      })();

      res.status(200).json({ result: saved });
    } catch (err) {
      handleSqlError(res, err, 'Failed to save examination marks.');
    }
  });

  // ===========================================================================
  // 8. FEE PAYMENT MANAGEMENT MODULE
  // ===========================================================================
  app.get('/api/payments', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const studentId = req.query.studentId ? Number(req.query.studentId) : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 15));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (studentId && Number.isInteger(studentId)) {
      conditions.push('student_id = ?');
      params.push(studentId);
    }
    if (search) {
      conditions.push('(registration_number LIKE ? OR student_name LIKE ? OR transaction_reference LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM student_payment_view ${whereClause}`)
      .get(...params) as { cnt: number };

    const payments = db
      .prepare(`
        SELECT *
        FROM student_payment_view
        ${whereClause}
        ORDER BY payment_date DESC, payment_id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset);

    const systemSummary = db
      .prepare('SELECT COUNT(*) AS total_transactions, COALESCE(SUM(amount_paid), 0) AS total_received FROM fee_payments')
      .get();

    const studentSummaries = db
      .prepare(`
        SELECT
          s.student_id,
          s.registration_number,
          (s.first_name || ' ' || s.last_name) AS student_name,
          s.course_of_study,
          COUNT(fp.payment_id) AS payment_count,
          COALESCE(SUM(fp.amount_paid), 0) AS total_paid,
          MAX(fp.payment_date) AS last_payment_date
        FROM students s
        LEFT JOIN fee_payments fp ON s.student_id = fp.student_id
        GROUP BY s.student_id
        ORDER BY total_paid DESC, s.last_name ASC
      `)
      .all();

    res.json({
      payments,
      systemSummary,
      studentSummaries,
      pagination: {
        page,
        limit,
        total: totalRow.cnt,
        totalPages: Math.max(1, Math.ceil(totalRow.cnt / limit)),
      },
    });
  });

  app.post('/api/payments', (req, res) => {
    const { student_id, amount_paid, payment_date, payment_method, transaction_reference } = req.body ?? {};
    const sId = Number(student_id);
    const amount = Number(amount_paid);

    if (!Number.isInteger(sId) || Number.isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'Valid student and positive payment amount are required.' });
      return;
    }
    if (!payment_method?.trim() || !transaction_reference?.trim()) {
      res.status(400).json({ error: 'Payment method and unique transaction reference are required.' });
      return;
    }

    try {
      const pDate =
        typeof payment_date === 'string' && payment_date.trim()
          ? payment_date.trim()
          : new Date().toISOString().slice(0, 10);

      const info = db
        .prepare(`
          INSERT INTO fee_payments (student_id, amount_paid, payment_date, payment_method, transaction_reference)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(sId, Number(amount.toFixed(2)), pDate, String(payment_method).trim(), String(transaction_reference).trim());

      const created = db
        .prepare('SELECT * FROM student_payment_view WHERE payment_id = ?')
        .get(info.lastInsertRowid);
      res.status(201).json({ payment: created });
    } catch (err) {
      handleSqlError(res, err, 'Failed to record fee payment.');
    }
  });

  app.delete('/api/payments/:id', (req, res) => {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId)) {
      res.status(400).json({ error: 'Invalid payment ID.' });
      return;
    }
    const result = db.prepare('DELETE FROM fee_payments WHERE payment_id = ?').run(paymentId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }
    res.json({ message: 'Payment record deleted.' });
  });

  // ===========================================================================
  // 9. DATABASE & SQL LAB (Views, Stored Procedures, EXPLAIN, Grading, Scripts)
  // ===========================================================================
  app.get('/api/db-lab/overview', (_req, res) => {
    const tableNames = [
      'students',
      'lecturers',
      'courses',
      'semesters',
      'course_registrations',
      'examination_results',
      'fee_payments',
    ];
    const tables = tableNames.map((name) => {
      const cntRow = db.prepare(`SELECT COUNT(*) AS cnt FROM ${name}`).get() as { cnt: number };
      const columns = db.prepare(`PRAGMA table_info(${name})`).all();
      const indexes = db.prepare(`PRAGMA index_list(${name})`).all();
      return { name, rowCount: cntRow.cnt, columns, indexes };
    });

    const triggers = db
      .prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
      .all();
    const views = db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'view' ORDER BY name")
      .all();
    const gradingConfig = db.prepare('SELECT * FROM grading_config WHERE id = 1').get();

    const scriptFiles = [
      'schema.sql',
      'sample_data.sql',
      'stored_procedures.sql',
      'triggers.sql',
      'views.sql',
      'indexes.sql',
      'security.sql',
    ];
    const sqlDir = path.resolve(process.cwd(), 'database');
    const mysqlScripts = scriptFiles.map((file) => {
      const fullPath = path.resolve(sqlDir, file);
      const content =
        fullPath.startsWith(sqlDir + path.sep) && fs.existsSync(fullPath)
          ? fs.readFileSync(fullPath, 'utf8')
          : '';
      return { filename: file, content };
    });

    res.json({ tables, triggers, views, gradingConfig, mysqlScripts });
  });

  app.put('/api/db-lab/grading-config', (req, res) => {
    const {
      exam_weight,
      assignment_weight,
      grade_a_min,
      grade_b_min,
      grade_c_min,
      grade_d_min,
      pass_min,
    } = req.body ?? {};

    const ew = Number(exam_weight);
    const aw = Number(assignment_weight);
    const aMin = Number(grade_a_min);
    const bMin = Number(grade_b_min);
    const cMin = Number(grade_c_min);
    const dMin = Number(grade_d_min);
    const pMin = Number(pass_min);

    if (
      [ew, aw, aMin, bMin, cMin, dMin, pMin].some((n) => Number.isNaN(n)) ||
      Math.abs(ew + aw - 1) > 0.001 ||
      !(aMin > bMin && bMin > cMin && cMin > dMin && dMin >= 0)
    ) {
      res.status(400).json({
        error: 'Weights must sum to 1.00 and grade thresholds must follow A > B > C > D >= 0.',
      });
      return;
    }

    const updated = db.transaction(() => {
      db.prepare(`
        UPDATE grading_config
        SET exam_weight = ?, assignment_weight = ?, grade_a_min = ?, grade_b_min = ?, grade_c_min = ?, grade_d_min = ?, pass_min = ?
        WHERE id = 1
      `).run(ew, aw, aMin, bMin, cMin, dMin, pMin);

      db.prepare('UPDATE examination_results SET exam_marks = exam_marks, assignment_marks = assignment_marks').run();
      return db.prepare('SELECT * FROM grading_config WHERE id = 1').get();
    })();

    res.json({ gradingConfig: updated });
  });

  app.get('/api/db-lab/view/:viewName', (req, res) => {
    const allowedViews = [
      'student_results_view',
      'student_registration_view',
      'student_payment_view',
      'course_performance_view',
    ];
    const viewName = String(req.params.viewName);
    if (!allowedViews.includes(viewName)) {
      res.status(400).json({ error: 'Requested view is not in the allowlist.' });
      return;
    }
    const rows = db.prepare(`SELECT * FROM ${viewName} LIMIT 100`).all();
    res.json({ viewName, rows });
  });

  app.post('/api/db-lab/procedure', (req, res) => {
    const { procedureName, studentId, semesterId, courseId } = req.body ?? {};
    switch (procedureName) {
      case 'GetStudentDetails': {
        const sId = Number(studentId) || 1;
        const row = storedProcedures.GetStudentDetails(sId);
        res.json({
          procedureName,
          sqlPreview: 'CALL GetStudentDetails(?);',
          params: [sId],
          rows: row ? [row] : [],
        });
        return;
      }
      case 'GetStudentResults': {
        const sId = Number(studentId) || 1;
        res.json({
          procedureName,
          sqlPreview: 'CALL GetStudentResults(?);',
          params: [sId],
          rows: storedProcedures.GetStudentResults(sId),
        });
        return;
      }
      case 'GetStudentPayments': {
        const sId = Number(studentId) || 1;
        res.json({
          procedureName,
          sqlPreview: 'CALL GetStudentPayments(?);',
          params: [sId],
          rows: storedProcedures.GetStudentPayments(sId),
        });
        return;
      }
      case 'GetCourseRegistrations': {
        const semId = semesterId ? Number(semesterId) : null;
        res.json({
          procedureName,
          sqlPreview: 'CALL GetCourseRegistrations(?);',
          params: [semId],
          rows: storedProcedures.GetCourseRegistrations(semId),
        });
        return;
      }
      case 'GetCourseStudentList': {
        const cId = Number(courseId) || 1;
        const semId = semesterId ? Number(semesterId) : null;
        res.json({
          procedureName,
          sqlPreview: 'CALL GetCourseStudentList(?, ?);',
          params: [cId, semId],
          rows: storedProcedures.GetCourseStudentList(cId, semId),
        });
        return;
      }
      default:
        res.status(400).json({ error: 'Unknown stored procedure name.' });
    }
  });

  app.post('/api/db-lab/query-demo', (req, res) => {
    const { demoId } = req.body ?? {};
    type DemoConfig = {
      title: string;
      category: string;
      sql: string;
      run: () => { rows: unknown[]; plan: unknown[] };
    };

    const demos: Record<string, DemoConfig> = {
      join_group_by: {
        title: 'JOIN + GROUP BY + Aggregate Functions (Department Enrollment & Averages)',
        category: 'JOIN / GROUP BY / AGGREGATE',
        sql: `SELECT c.course_code, c.course_name, l.first_name || ' ' || l.last_name AS lecturer,
       COUNT(cr.registration_id) AS enrolled_students,
       ROUND(AVG(er.total_marks), 2) AS avg_score
FROM courses c
LEFT JOIN lecturers l ON c.lecturer_id = l.lecturer_id
LEFT JOIN course_registrations cr ON c.course_id = cr.course_id
LEFT JOIN examination_results er ON cr.registration_id = er.registration_id
GROUP BY c.course_id
ORDER BY avg_score DESC;`,
        run: () => {
          const sql = `SELECT c.course_code, c.course_name, (l.first_name || ' ' || l.last_name) AS lecturer, COUNT(cr.registration_id) AS enrolled_students, ROUND(AVG(er.total_marks), 2) AS avg_score FROM courses c LEFT JOIN lecturers l ON c.lecturer_id = l.lecturer_id LEFT JOIN course_registrations cr ON c.course_id = cr.course_id LEFT JOIN examination_results er ON cr.registration_id = er.registration_id GROUP BY c.course_id ORDER BY avg_score DESC`;
          return {
            rows: db.prepare(sql).all(),
            plan: db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(),
          };
        },
      },
      subquery_above_avg: {
        title: 'Correlated Subquery + WHERE + ORDER BY (Students Scoring Above System Average)',
        category: 'SUBQUERY / WHERE / ORDER BY',
        sql: `SELECT s.registration_number, s.first_name || ' ' || s.last_name AS student_name,
       c.course_code, er.total_marks, er.grade
FROM examination_results er
JOIN course_registrations cr ON er.registration_id = cr.registration_id
JOIN students s ON cr.student_id = s.student_id
JOIN courses c ON cr.course_id = c.course_id
WHERE er.total_marks > (SELECT AVG(total_marks) FROM examination_results)
ORDER BY er.total_marks DESC;`,
        run: () => {
          const sql = `SELECT s.registration_number, (s.first_name || ' ' || s.last_name) AS student_name, c.course_code, er.total_marks, er.grade FROM examination_results er JOIN course_registrations cr ON er.registration_id = cr.registration_id JOIN students s ON cr.student_id = s.student_id JOIN courses c ON cr.course_id = c.course_id WHERE er.total_marks > (SELECT AVG(total_marks) FROM examination_results) ORDER BY er.total_marks DESC`;
          return {
            rows: db.prepare(sql).all(),
            plan: db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(),
          };
        },
      },
      index_explain_reg_no: {
        title: 'Index Lookup Plan (UNIQUE Index on students.registration_number)',
        category: 'INDEX / EXPLAIN',
        sql: `SELECT student_id, registration_number, first_name, last_name, email, status
FROM students
WHERE registration_number = ?;`,
        run: () => {
          const sample = db.prepare('SELECT registration_number FROM students LIMIT 1').get() as
            | { registration_number: string }
            | undefined;
          const targetReg = sample?.registration_number ?? '';
          const sql = `SELECT student_id, registration_number, first_name, last_name, email, status FROM students WHERE registration_number = ?`;
          return {
            rows: db.prepare(sql).all(targetReg),
            plan: db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(targetReg),
          };
        },
      },
      index_explain_last_name: {
        title: 'Index Lookup Plan (Secondary Index idx_students_last_name)',
        category: 'INDEX / EXPLAIN',
        sql: `SELECT student_id, registration_number, first_name, last_name, course_of_study
FROM students
WHERE last_name = ?;`,
        run: () => {
          const sample = db.prepare('SELECT last_name FROM students LIMIT 1').get() as
            | { last_name: string }
            | undefined;
          const targetLast = sample?.last_name ?? '';
          const sql = `SELECT student_id, registration_number, first_name, last_name, course_of_study FROM students WHERE last_name = ?`;
          return {
            rows: db.prepare(sql).all(targetLast),
            plan: db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(targetLast),
          };
        },
      },
      index_explain_payments: {
        title: 'Index Lookup Plan (idx_fee_payments_student_id)',
        category: 'INDEX / EXPLAIN',
        sql: `SELECT payment_id, student_id, amount_paid, payment_date, transaction_reference
FROM fee_payments
WHERE student_id = ?
ORDER BY payment_date DESC;`,
        run: () => {
          const sample = db.prepare('SELECT student_id FROM fee_payments LIMIT 1').get() as
            | { student_id: number }
            | undefined;
          const targetId = sample?.student_id ?? 1;
          const sql = `SELECT payment_id, student_id, amount_paid, payment_date, transaction_reference FROM fee_payments WHERE student_id = ? ORDER BY payment_date DESC`;
          return {
            rows: db.prepare(sql).all(targetId),
            plan: db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(targetId),
          };
        },
      },
      transaction_crud_demo: {
        title: 'Atomic Transaction Lifecycle (INSERT -> SELECT -> UPDATE -> DELETE inside Savepoint)',
        category: 'TRANSACTION / DML',
        sql: `BEGIN IMMEDIATE;
INSERT INTO students (...) VALUES (...);
SELECT * FROM students WHERE registration_number = ?;
UPDATE students SET status = 'Graduated' WHERE registration_number = ?;
DELETE FROM students WHERE registration_number = ?;
COMMIT;`,
        run: () => {
          const logRows: unknown[] = [];
          const tempReg = `TX-VERIFY-${Date.now()}`;
          db.transaction(() => {
            const ins = db
              .prepare(`
                INSERT INTO students (registration_number, first_name, last_name, gender, email, course_of_study, year_of_study, date_registered, status)
                VALUES (?, 'Verification', 'Check', 'Other', ?, 'Registry Check', 1, ?, 'Active')
              `)
              .run(tempReg, `${tempReg.toLowerCase()}@verify.local`, new Date().toISOString().slice(0, 10));
            const afterInsert = db
              .prepare('SELECT student_id, registration_number, status FROM students WHERE student_id = ?')
              .get(ins.lastInsertRowid) as Record<string, unknown>;
            logRows.push({ step: '1. INSERT', ...afterInsert });

            db.prepare("UPDATE students SET status = 'Graduated' WHERE student_id = ?").run(ins.lastInsertRowid);
            const afterUpdate = db
              .prepare('SELECT student_id, registration_number, status FROM students WHERE student_id = ?')
              .get(ins.lastInsertRowid) as Record<string, unknown>;
            logRows.push({ step: '2. UPDATE', ...afterUpdate });

            const del = db.prepare('DELETE FROM students WHERE student_id = ?').run(ins.lastInsertRowid);
            logRows.push({
              step: '3. DELETE',
              student_id: ins.lastInsertRowid,
              registration_number: tempReg,
              status: `Deleted (${del.changes} row)`,
            });
          })();
          return {
            rows: logRows,
            plan: [{ detail: 'Executed atomically inside SQLite BEGIN IMMEDIATE ... COMMIT transaction' }],
          };
        },
      },
    };

    const chosen = demos[String(demoId)];
    if (!chosen) {
      res.status(400).json({ error: 'Unknown query demonstration ID.' });
      return;
    }

    const result = chosen.run();
    res.json({
      demoId,
      title: chosen.title,
      category: chosen.category,
      sql: chosen.sql,
      rows: result.rows,
      plan: result.plan,
    });
  });

  app.post('/api/db-lab/test-permissions', (_req, res) => {
    const checks: Array<{ test: string; expected: string; actual: string; passed: boolean }> = [];

    const existingReg = db
      .prepare('SELECT registration_id, student_id, course_id, semester_id FROM course_registrations LIMIT 1')
      .get() as
      | { registration_id: number; student_id: number; course_id: number; semester_id: number }
      | undefined;

    if (!existingReg) {
      checks.push({
        test: 'Trigger & Constraint Diagnostics',
        expected: 'Course registration rows available to test against',
        actual: 'No course registrations exist yet — add a student, course, semester, and registration first.',
        passed: false,
      });
    } else {
      try {
        db.exec('SAVEPOINT test_trig');
        db.prepare('INSERT INTO examination_results (registration_id, exam_marks, assignment_marks) VALUES (?, 140, 50)').run(
          existingReg.registration_id
        );
        db.exec('ROLLBACK TO test_trig; RELEASE test_trig;');
        checks.push({
          test: 'Trigger: Reject marks > 100',
          expected: 'ABORT with Validation Error',
          actual: 'Insert succeeded unexpectedly',
          passed: false,
        });
      } catch (err) {
        try {
          db.exec('ROLLBACK TO test_trig; RELEASE test_trig;');
        } catch {
          // ignore
        }
        const msg = err instanceof Error ? err.message : '';
        checks.push({
          test: 'Trigger: Reject marks > 100',
          expected: 'ABORT with Validation Error',
          actual: msg.includes('Validation Error') || msg.includes('CHECK') ? 'Rejected by DB Trigger/Check' : msg,
          passed: msg.includes('Validation Error') || msg.includes('CHECK'),
        });
      }

      try {
        db.exec('SAVEPOINT test_dup');
        db.prepare(
          'INSERT INTO course_registrations (student_id, course_id, semester_id, registration_date, status) VALUES (?, ?, ?, "2026-11-26", "Registered")'
        ).run(existingReg.student_id, existingReg.course_id, existingReg.semester_id);
        db.exec('ROLLBACK TO test_dup; RELEASE test_dup;');
        checks.push({
          test: 'Constraint: Composite UNIQUE(student_id, course_id, semester_id)',
          expected: 'UNIQUE constraint violation',
          actual: 'Duplicate allowed',
          passed: false,
        });
      } catch (err) {
        try {
          db.exec('ROLLBACK TO test_dup; RELEASE test_dup;');
        } catch {
          // ignore
        }
        const msg = err instanceof Error ? err.message : '';
        checks.push({
          test: 'Constraint: Composite UNIQUE(student_id, course_id, semester_id)',
          expected: 'UNIQUE constraint violation',
          actual: msg.includes('UNIQUE') ? 'Blocked by Composite UNIQUE Constraint' : msg,
          passed: msg.includes('UNIQUE'),
        });
      }
    }

    const viewCheck = db.prepare('SELECT COUNT(*) AS cnt FROM course_performance_view').get() as { cnt: number };
    checks.push({
      test: 'Views: course_performance_view queryable',
      expected: 'Returns aggregated course rows',
      actual: `Returned ${viewCheck.cnt} course performance rows`,
      passed: viewCheck.cnt >= 0,
    });

    res.json({ checks });
  });

  // ===========================================================================
  // 9B. PORTAL & INSTITUTION SETTINGS MODULE
  // ===========================================================================
  app.get('/api/settings', (_req, res) => {
    const portalSettings = db.prepare('SELECT * FROM portal_settings WHERE id = 1').get();
    const gradingConfig = db.prepare('SELECT * FROM grading_config WHERE id = 1').get();
    res.json({ portalSettings, gradingConfig });
  });

  app.put('/api/settings', (req, res) => {
    const {
      institution_name,
      registry_email,
      reg_number_prefix,
      default_credit_hours,
      default_payment_method,
      currency_label,
      academic_calendar_note,
    } = req.body ?? {};

    if (typeof institution_name !== 'string' || institution_name.trim().length < 2) {
      res.status(400).json({ error: 'Institution or portal title must be at least 2 characters.' });
      return;
    }

    const cleanEmail = typeof registry_email === 'string' ? registry_email.trim().toLowerCase() : '';
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      res.status(400).json({ error: 'Provide a valid registry contact email address.' });
      return;
    }

    const cleanPrefix =
      typeof reg_number_prefix === 'string'
        ? reg_number_prefix.trim().toUpperCase()
        : '';
    if (!/^[A-Z0-9]{2,10}$/.test(cleanPrefix)) {
      res.status(400).json({
        error: 'Registration number prefix must be 2–10 uppercase letters or digits (e.g., UNI or KYU).',
      });
      return;
    }

    const credits = Number(default_credit_hours);
    if (!Number.isInteger(credits) || credits < 1 || credits > 12) {
      res.status(400).json({ error: 'Default credit hours must be an integer between 1 and 12.' });
      return;
    }

    const allowedMethods = ['M-Pesa', 'Bank Transfer', 'EFT', 'Cheque', 'Card', 'Cash'];
    const cleanMethod =
      typeof default_payment_method === 'string' && allowedMethods.includes(default_payment_method)
        ? default_payment_method
        : 'M-Pesa';

    const cleanCurrency = currency_label === 'KES' ? 'KES' : 'KSh';
    const cleanNote =
      typeof academic_calendar_note === 'string' ? academic_calendar_note.trim().slice(0, 200) : '';

    try {
      db.prepare(`
        UPDATE portal_settings
        SET institution_name = ?,
            registry_email = ?,
            reg_number_prefix = ?,
            default_credit_hours = ?,
            default_payment_method = ?,
            currency_label = ?,
            academic_calendar_note = ?
        WHERE id = 1
      `).run(
        institution_name.trim().slice(0, 120),
        cleanEmail,
        cleanPrefix,
        credits,
        cleanMethod,
        cleanCurrency,
        cleanNote
      );

      const portalSettings = db.prepare('SELECT * FROM portal_settings WHERE id = 1').get();
      res.json({ portalSettings });
    } catch (err) {
      handleSqlError(res, err, 'Failed to save portal settings.');
    }
  });

  // ===========================================================================
  // 10. DATABASE BACKUP AND RECOVERY MODULE (Path-Confined)
  // ===========================================================================
  const CORE_BACKUP_TABLES = [
    'lecturers',
    'students',
    'courses',
    'semesters',
    'course_registrations',
    'examination_results',
    'fee_payments',
    'grading_config',
    'portal_settings',
  ] as const;

  function buildSqlDump(): string {
    const settingsRow = db
      .prepare('SELECT institution_name FROM portal_settings WHERE id = 1')
      .get() as { institution_name?: string } | undefined;
    const headerTitle =
      settingsRow?.institution_name?.trim() || 'University Students Information Management System';

    const lines: string[] = [
      '-- ============================================================================',
      `-- ${headerTitle} — SQL Backup Dump`,
      `-- Generated At: ${new Date().toISOString()}`,
      '-- ============================================================================',
      'PRAGMA foreign_keys = OFF;',
      'BEGIN IMMEDIATE;',
    ];

    for (const table of [...CORE_BACKUP_TABLES].reverse()) {
      lines.push(`DELETE FROM ${table};`);
    }

    for (const table of CORE_BACKUP_TABLES) {
      const rows = db.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
      if (rows.length === 0) continue;
      lines.push(`\n-- Table data: ${table} (${rows.length} rows)`);
      const cols = Object.keys(rows[0]);
      for (const row of rows) {
        const vals = cols.map((c) => escapeSqlValue(row[c]));
        lines.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
      }
    }

    lines.push('COMMIT;');
    lines.push('PRAGMA foreign_keys = ON;');
    return lines.join('\n');
  }

  app.get('/api/backup/list', (_req, res) => {
    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => /^[a-zA-Z0-9_.-]+\.sql$/.test(f))
      .map((filename) => {
        const full = path.resolve(BACKUPS_DIR, filename);
        const stat = fs.statSync(full);
        return {
          filename,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({ backups: files });
  });

  app.post('/api/backup/create', (_req, res) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `usims_backup_${stamp}.sql`;
    const targetPath = path.resolve(BACKUPS_DIR, filename);
    if (!targetPath.startsWith(BACKUPS_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid backup path.' });
      return;
    }
    const sqlDump = buildSqlDump();
    fs.writeFileSync(targetPath, sqlDump, 'utf8');
    const stat = fs.statSync(targetPath);

    res.status(201).json({
      backup: {
        filename,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      },
      preview: sqlDump.slice(0, 4000),
    });
  });

  app.get('/api/backup/download/:filename', (req, res) => {
    const filename = String(req.params.filename);
    if (!/^[a-zA-Z0-9_.-]+\.sql$/.test(filename)) {
      res.status(400).json({ error: 'Invalid backup filename.' });
      return;
    }
    const targetPath = path.resolve(BACKUPS_DIR, filename);
    if (!targetPath.startsWith(BACKUPS_DIR + path.sep) || !fs.existsSync(targetPath)) {
      res.status(404).json({ error: 'Backup file not found.' });
      return;
    }
    res.download(targetPath, filename);
  });

  app.post('/api/backup/restore', (req, res) => {
    const { filename, sqlContent } = req.body ?? {};
    let rawSql = '';

    if (typeof filename === 'string' && filename.trim()) {
      const cleanName = filename.trim();
      if (!/^[a-zA-Z0-9_.-]+\.sql$/.test(cleanName)) {
        res.status(400).json({ error: 'Invalid backup filename.' });
        return;
      }
      const targetPath = path.resolve(BACKUPS_DIR, cleanName);
      if (!targetPath.startsWith(BACKUPS_DIR + path.sep) || !fs.existsSync(targetPath)) {
        res.status(404).json({ error: 'Backup file not found.' });
        return;
      }
      rawSql = fs.readFileSync(targetPath, 'utf8');
    } else if (typeof sqlContent === 'string' && sqlContent.trim()) {
      if (sqlContent.length > 5 * 1024 * 1024) {
        res.status(400).json({ error: 'Uploaded SQL backup exceeds 5MB limit.' });
        return;
      }
      rawSql = sqlContent;
    } else {
      res.status(400).json({ error: 'Provide either a saved backup filename or SQL content to restore.' });
      return;
    }

    const statements: string[] = [];
    let current = '';
    let inString = false;
    for (let i = 0; i < rawSql.length; i++) {
      const ch = rawSql[i];
      if (ch === "'" && rawSql[i - 1] !== '\\') {
        if (inString && rawSql[i + 1] === "'") {
          current += "''";
          i++;
          continue;
        }
        inString = !inString;
      }
      if (!inString && ch === '-' && rawSql[i + 1] === '-') {
        while (i < rawSql.length && rawSql[i] !== '\n') i++;
        continue;
      }
      if (!inString && ch === ';') {
        const trimmed = current.trim();
        if (trimmed) statements.push(trimmed);
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) statements.push(current.trim());

    const allowedTableRegex = new RegExp(
      `^(DELETE\\s+FROM\\s+(?:${CORE_BACKUP_TABLES.join('|')})|INSERT\\s+INTO\\s+(?:${CORE_BACKUP_TABLES.join('|')})\\s*\\()`,
      'i'
    );

    const executableStatements: string[] = [];
    for (const stmt of statements) {
      if (/^(BEGIN|COMMIT|PRAGMA\s+foreign_keys\s*=)/i.test(stmt)) {
        continue;
      }
      if (!allowedTableRegex.test(stmt)) {
        res.status(400).json({
          error: `Unsafe or unsupported SQL statement rejected during restore: "${stmt.slice(0, 60)}..."`,
        });
        return;
      }
      const sqlOutsideStrings = stmt.replace(/'(?:''|[^'])*'/g, "''");
      if (/\b(SELECT|UNION|ATTACH|DETACH|PRAGMA|app_users|auth_sessions|sqlite_master)\b/i.test(sqlOutsideStrings)) {
        res.status(400).json({
          error: 'Unsafe SQL keyword or protected table reference rejected during restore.',
        });
        return;
      }
      executableStatements.push(stmt);
    }

    if (executableStatements.length === 0) {
      res.status(400).json({ error: 'Backup file contained no valid restoration statements.' });
      return;
    }

    try {
      db.transaction(() => {
        for (const stmt of executableStatements) {
          db.prepare(stmt).run();
        }
        initializeSchemaAndObjects();
      })();

      const fkIssues = db.prepare('PRAGMA foreign_key_check').all();
      if (fkIssues.length > 0) {
        res.status(400).json({
          error: 'Restored data failed foreign key integrity verification.',
          fkIssues,
        });
        return;
      }

      const counts = {
        students: (db.prepare('SELECT COUNT(*) AS c FROM students').get() as { c: number }).c,
        lecturers: (db.prepare('SELECT COUNT(*) AS c FROM lecturers').get() as { c: number }).c,
        courses: (db.prepare('SELECT COUNT(*) AS c FROM courses').get() as { c: number }).c,
        semesters: (db.prepare('SELECT COUNT(*) AS c FROM semesters').get() as { c: number }).c,
        registrations: (db.prepare('SELECT COUNT(*) AS c FROM course_registrations').get() as { c: number }).c,
        results: (db.prepare('SELECT COUNT(*) AS c FROM examination_results').get() as { c: number }).c,
        payments: (db.prepare('SELECT COUNT(*) AS c FROM fee_payments').get() as { c: number }).c,
      };

      res.json({
        message: 'Database backup restored and foreign-key integrity verified.',
        statementsExecuted: executableStatements.length,
        verifiedCounts: counts,
      });
    } catch (err) {
      handleSqlError(res, err, 'Backup restoration failed and was rolled back.');
    }
  });
}
