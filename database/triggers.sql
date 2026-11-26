-- =============================================================================
-- University Student Information Management System
-- File: database/triggers.sql
-- Weighting: 70% Exam + 30% Assignment
-- Grading Scheme: A (70-100), B (60-69.99), C (50-59.99), D (40-49.99), E (<40)
-- Note: MySQL allows multiple triggers per timing/event or combined BEFORE
-- triggers using FOLLOWS. Here BEFORE INSERT and BEFORE UPDATE handle validation,
-- total mark calculation, and grade/remarks assignment cleanly without recursion.
-- =============================================================================

USE university_student_db;

DELIMITER //

DROP TRIGGER IF EXISTS trg_exam_validate_before_insert //
CREATE TRIGGER trg_exam_validate_before_insert
BEFORE INSERT ON examination_results
FOR EACH ROW
BEGIN
  IF NEW.exam_marks < 0 OR NEW.exam_marks > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation Error: Examination marks must be between 0 and 100.';
  END IF;

  IF NEW.assignment_marks < 0 OR NEW.assignment_marks > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation Error: Assignment marks must be between 0 and 100.';
  END IF;

  -- Trigger 2 logic: Automatic total calculation (70% Exam + 30% Assignment)
  SET NEW.total_marks = ROUND((NEW.exam_marks * 0.70) + (NEW.assignment_marks * 0.30), 2);

  -- Trigger 3 logic: Automatic grade & pass/fail remarks calculation
  IF NEW.total_marks >= 70 THEN
    SET NEW.grade = 'A';
    SET NEW.remarks = 'Pass';
  ELSEIF NEW.total_marks >= 60 THEN
    SET NEW.grade = 'B';
    SET NEW.remarks = 'Pass';
  ELSEIF NEW.total_marks >= 50 THEN
    SET NEW.grade = 'C';
    SET NEW.remarks = 'Pass';
  ELSEIF NEW.total_marks >= 40 THEN
    SET NEW.grade = 'D';
    SET NEW.remarks = 'Pass';
  ELSE
    SET NEW.grade = 'E';
    SET NEW.remarks = 'Fail';
  END IF;
END //

DROP TRIGGER IF EXISTS trg_exam_validate_before_update //
CREATE TRIGGER trg_exam_validate_before_update
BEFORE UPDATE ON examination_results
FOR EACH ROW
BEGIN
  IF NEW.exam_marks < 0 OR NEW.exam_marks > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation Error: Examination marks must be between 0 and 100.';
  END IF;

  IF NEW.assignment_marks < 0 OR NEW.assignment_marks > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Validation Error: Assignment marks must be between 0 and 100.';
  END IF;

  SET NEW.total_marks = ROUND((NEW.exam_marks * 0.70) + (NEW.assignment_marks * 0.30), 2);

  IF NEW.total_marks >= 70 THEN
    SET NEW.grade = 'A';
    SET NEW.remarks = 'Pass';
  ELSEIF NEW.total_marks >= 60 THEN
    SET NEW.grade = 'B';
    SET NEW.remarks = 'Pass';
  ELSEIF NEW.total_marks >= 50 THEN
    SET NEW.grade = 'C';
    SET NEW.remarks = 'Pass';
  ELSEIF NEW.total_marks >= 40 THEN
    SET NEW.grade = 'D';
    SET NEW.remarks = 'Pass';
  ELSE
    SET NEW.grade = 'E';
    SET NEW.remarks = 'Fail';
  END IF;
END //

DELIMITER ;
