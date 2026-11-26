export interface Student {
  student_id: number;
  registration_number: string;
  first_name: string;
  last_name: string;
  gender: 'Male' | 'Female' | 'Other';
  email: string | null;
  phone: string | null;
  course_of_study: string;
  year_of_study: number;
  date_registered: string;
  status: 'Active' | 'Inactive' | 'Graduated' | 'Suspended';
}

export interface Lecturer {
  lecturer_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  department: string;
  assigned_courses_count?: number;
  assigned_course_codes?: string | null;
}

export interface Course {
  course_id: number;
  course_code: string;
  course_name: string;
  credit_hours: number;
  lecturer_id: number | null;
  lecturer_name?: string | null;
  lecturer_department?: string | null;
  enrolled_count?: number;
}

export interface Semester {
  semester_id: number;
  semester_name: string;
  academic_year: string;
  start_date: string;
  end_date: string;
  status: 'Active' | 'Upcoming' | 'Completed';
  registration_count?: number;
}

export interface CourseRegistration {
  registration_id: number;
  student_id: number;
  registration_number: string;
  student_name: string;
  course_id: number;
  course_code: string;
  course_name: string;
  lecturer_id: number | null;
  semester_id: number;
  semester: string;
  academic_year: string;
  registration_date: string;
  registration_status: 'Registered' | 'Dropped' | 'Completed';
}

export interface ExaminationRow {
  registration_id: number;
  registration_status: string;
  student_id: number;
  registration_number: string;
  student_name: string;
  course_id: number;
  course_code: string;
  course_name: string;
  credit_hours: number;
  lecturer_id: number | null;
  semester_id: number;
  semester_name: string;
  academic_year: string;
  result_id: number | null;
  exam_marks: number | null;
  assignment_marks: number | null;
  total_marks: number | null;
  grade: string | null;
  remarks: string | null;
}

export interface GradingConfig {
  id: number;
  exam_weight: number;
  assignment_weight: number;
  grade_a_min: number;
  grade_b_min: number;
  grade_c_min: number;
  grade_d_min: number;
  pass_min: number;
}

export interface FeePayment {
  payment_id: number;
  student_id: number;
  registration_number: string;
  student_name: string;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  transaction_reference: string;
}

export interface CoursePerformance {
  course_id: number;
  course_code: string;
  course_name: string;
  number_of_registered_students: number;
  average_marks: number | null;
  highest_marks: number | null;
  lowest_marks: number | null;
}

export type NavSection =
  | 'dashboard'
  | 'students'
  | 'lecturers'
  | 'courses'
  | 'semesters'
  | 'registrations'
  | 'examinations'
  | 'payments'
  | 'db-lab'
  | 'settings';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  text: string;
}

export interface AuthUser {
  userId: number;
  username: string;
  fullName: string;
  email: string;
  department: string;
  hasRecoveryPin?: boolean;
}

export type ThemeMode = 'light' | 'dark';

export interface AuthStatus {
  hasUsers: boolean;
}

export interface PortalSettings {
  id: number;
  institution_name: string;
  registry_email: string;
  reg_number_prefix: string;
  default_credit_hours: number;
  default_payment_method: string;
  currency_label: string;
  academic_calendar_note: string;
}

