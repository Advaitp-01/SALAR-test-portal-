export type UserRole = 'SUPER_ADMIN' | 'STUDENT';

export type AdminModule =
  | 'dashboard'
  | 'students'
  | 'faculty'
  | 'batches'
  | 'question-bank'
  | 'exams'
  | 'attendance'
  | 'study-material'
  | 'notifications'
  | 'results'
  | 'evaluation'
  | 'payments'
  | 'courses'
  | 'test-series'
  | 'settings';

export type StudentModule =
  | 'dashboard'
  | 'exams'
  | 'courses'
  | 'test-series'
  | 'purchases'
  | 'profile';

export interface FrontendSubjectItem {
  id: string;
  name: string;
  tagline: string;
  description: string;
  topics: string;
}

export interface FrontendHighlightItem {
  value: string;
  label: string;
}

export interface FrontendTitleDescItem {
  title: string;
  description: string;
}

export interface FrontendCampusItem {
  title: string;
  description: string;
  imageUrl?: string;
}

export interface FrontendPerformerItem {
  name: string;
  exam: string;
  score: string;
  imageUrl?: string;
}

export interface FrontendGpatItem {
  title: string;
  classLevel: string;
  code: string;
  duration: string;
}

export interface FrontendSectionVisibility {
  showAnnouncement: boolean;
  showHighlights: boolean;
  showSubjects: boolean;
  showAbout: boolean;
  showApproach: boolean;
  showFeatures: boolean;
  showCampus: boolean;
  showPerformers: boolean;
  showCourses: boolean;
  showTestSeries: boolean;
  showLiveExams: boolean;
  showGpat: boolean;
  showTestimonial: boolean;
  showContact: boolean;
}

export interface FrontendCustomizationConfig {
  announcementEnabled: boolean;
  announcementText: string;
  announcementCtaLabel: string;
  establishedYear: string;
  founderName: string;
  motto: string;
  aboutHeading: string;
  aboutBody: string;
  officeHours: string;
  highlights: FrontendHighlightItem[];
  subjects: FrontendSubjectItem[];
  approachSteps: FrontendTitleDescItem[];
  features: FrontendTitleDescItem[];
  campusFacilities: FrontendCampusItem[];
  performers: FrontendPerformerItem[];
  testimonial: {
    name: string;
    role: string;
    quote: string;
  };
  gpatSchedules: FrontendGpatItem[];
  sectionHeadings: {
    subjectsHeading: string;
    subjectsSubheading: string;
    coursesHeading: string;
    coursesSubheading: string;
    testSeriesHeading: string;
    testSeriesSubheading: string;
    liveExamsHeading: string;
    performersHeading: string;
    campusHeading: string;
  };
  footerNote: string;
  sectionVisibility: FrontendSectionVisibility;
}

export interface InstituteSettings {
  id?: string;
  instituteName: string;
  tagline: string;
  storageTag: string;
  logoUrl: string;
  logoWidth: number;
  logoHeight: number;
  heroImage: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryCta: string;
  secondaryCta: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  socialLinks: {
    youtube?: string;
    instagram?: string;
    telegram?: string;
  };
  portalConfig: {
    allowGoogleAuth: boolean;
    allowEmailPasswordAuth: boolean;
    allowQuickJoin: boolean;
    allowPublicRegistration: boolean;
    autoSubmitOnExpiry: boolean;
    strictNegativeMarking: boolean;
    upiId: string;
    upiPayeeName: string;
    bankDetails: string;
    storageProvider: string;
    enableEmailNotifications: boolean;
    enableWhatsAppNotifications: boolean;
    compactTables: boolean;
    frontend?: Partial<FrontendCustomizationConfig>;
  };
  updatedAt?: string;
}

export interface StudentProfile {
  id: string;
  uid?: string;
  name: string;
  email?: string;
  mobile?: string;
  whatsapp?: string;
  classLevel?: 'Class 11th' | 'Class 12th' | 'Dropper / Repeater';
  targetExam?: 'JEE Main' | 'JEE Advanced' | 'MHT-CET' | 'NEET' | 'Boards + CET' | 'JEE Main + Advanced' | 'PCMB Foundation';
  rollNumber?: string;
  username?: string;
  enrollmentId?: string;
  batchId?: string;
  batchName?: string;
  origin: 'PORTAL_SIGNUP' | 'QUICK_JOIN' | 'ADMIN_ADDED';
  status: 'ACTIVE' | 'QUICK_JOIN' | 'INACTIVE' | 'SUSPENDED';
  photoUrl?: string;
  attemptsCount?: number;
  avgPercentage?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface FacultyProfile {
  id: string;
  name: string;
  qualification: string;
  subjectSpecialization: string;
  experience?: string;
  email?: string;
  contactNumber?: string;
  photoUrl?: string;
  assignedBatches?: string[];
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
  updatedAt?: string;
}

export interface Batch {
  id: string;
  name: string;
  classLevel: 'Class 11th' | 'Class 12th';
  academicYear: string;
  schedule?: string;
  capacity: number;
  facultyName?: string;
  assignedExamIds?: string[];
  studentCount?: number;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt?: string;
  updatedAt?: string;
}

export interface BatchStudent {
  id: string;
  batchId: string;
  studentId: string;
  studentUid?: string;
  studentName: string;
  rollNumber?: string;
  assignedAt?: string;
}

export interface QuestionFolder {
  id: string;
  name: string;
  classLevel?: string;
  chapter?: string;
  examCategory?: string;
  createdAt?: string;
}

export type QuestionType = 'SINGLE_MCQ' | 'MULTI_MCQ' | 'NUMERICAL' | 'INTEGER' | 'IMAGE_BASED';

export interface QuestionOption {
  id: string;
  text: string;
  imageUrl?: string;
}

export interface Question {
  id: string;
  folderId?: string;
  folderName?: string;
  title: string;
  questionText: string;
  questionImageUrl?: string;
  questionType: QuestionType;
  options?: QuestionOption[];
  correctAnswer: string;
  explanation?: string;
  positiveMarks: number;
  negativeMarks: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  classLevel: 'Class 11th' | 'Class 12th';
  subject?: string;
  chapter?: string;
  topic?: string;
  examCategory: 'JEE Main' | 'JEE Advanced' | 'MHT-CET' | 'NEET' | 'Foundation';
  createdAt?: string;
  updatedAt?: string;
}

export interface Exam {
  id: string;
  title: string;
  code: string;
  classLevel: 'Class 11th' | 'Class 12th' | 'All Classes';
  target: 'JEE Main' | 'JEE Advanced' | 'MHT-CET' | 'NEET' | 'PCMB Foundation';
  subject?: string;
  examTag?: string;
  folderName?: string;
  examType?: string;
  durationMinutes: number;
  totalMarks: number;
  passingMarks?: number;
  questionCount?: number;
  openingDate?: string;
  startAt?: string;
  endAt?: string;
  status: 'LIVE' | 'DRAFT';
  isPublic?: boolean;
  webcamEnabled?: boolean;
  randomizeQuestions?: boolean;
  assignedCount?: number;
  assignedBatchIds?: string[];
  pdfUrl?: string;
  answerKeyNotes?: string;
  instructions?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExamQuestion {
  id: string;
  examId: string;
  examStatus: 'LIVE' | 'DRAFT';
  orderIndex: number;
  title?: string;
  subject?: string;
  questionText: string;
  questionImageUrl?: string;
  questionType: QuestionType;
  options?: QuestionOption[];
  correctAnswer: string;
  explanation?: string;
  positiveMarks: number;
  negativeMarks: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  chapter?: string;
  topic?: string;
  createdAt?: string;
}

export interface ExamAssignment {
  id: string;
  examId: string;
  studentId: string;
  studentUid: string;
  studentName?: string;
  batchId?: string;
  assignedAt?: string;
}

export interface QuestionResultItem {
  questionId: string;
  title: string;
  questionText: string;
  questionType: QuestionType;
  candidateAnswer: string;
  officialAnswer: string;
  marksAwarded: number;
  maxMarks: number;
  status: 'CORRECT' | 'INCORRECT' | 'UNATTEMPTED' | 'OVERRIDDEN';
  manualOverride?: boolean;
  comment?: string;
}

export interface StudentAnswerEntry {
  response: string;
  markedForReview?: boolean;
  visited?: boolean;
  timeSpentSec?: number;
}

export interface ExamAttempt {
  id: string;
  examId: string;
  examTitle: string;
  examCode?: string;
  studentUid: string;
  studentId?: string;
  studentName: string;
  rollNumber?: string;
  classLevel?: string;
  startedAt: string;
  submittedAt?: string;
  expiresAt?: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED';
  answers?: Record<string, StudentAnswerEntry>;
  questionResults?: QuestionResultItem[];
  autoScore?: number;
  manualAdjustment?: number;
  finalScore?: number;
  totalMarks: number;
  percentage?: number;
  accuracy?: number;
  correctCount?: number;
  incorrectCount?: number;
  unattemptedCount?: number;
  resultsPublished?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EvaluationLog {
  id: string;
  attemptId: string;
  examId: string;
  examTitle?: string;
  studentName?: string;
  previousScore: number;
  newScore: number;
  adjustmentDelta?: number;
  reason: string;
  evaluatorEmail: string;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  batchId: string;
  batchName?: string;
  studentId: string;
  studentUid?: string;
  studentName: string;
  rollNumber?: string;
  status: 'PRESENT' | 'ABSENT';
  remarks?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudyMaterial {
  id: string;
  title: string;
  description?: string;
  classLevel: 'Class 11th' | 'Class 12th' | 'Both';
  subject: string;
  chapter?: string;
  category: 'Notes' | 'Formula Sheets' | 'DPP' | 'PDF' | 'Practice Worksheets';
  fileUrl: string;
  fileName: string;
  fileSize?: string;
  downloadCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PortalNotification {
  id: string;
  title: string;
  message: string;
  type: 'EXAM_REMINDER' | 'RESULT' | 'PAYMENT' | 'MATERIAL' | 'GENERAL';
  targetType: 'ALL' | 'BATCH' | 'STUDENT';
  targetBatchId?: string;
  targetBatchName?: string;
  targetStudentUid?: string;
  readBy?: string[];
  createdAt: string;
}

export interface CourseChapter {
  id: string;
  title: string;
  pdfUrl?: string;
  pdfName?: string;
  videoUrl?: string;
  duration?: string;
}

export interface CourseModule {
  id: string;
  title: string;
  chapters: CourseChapter[];
}

export interface Course {
  id: string;
  name: string;
  description?: string;
  category: 'JEE Main' | 'JEE Advanced' | 'MHT-CET' | 'NEET' | 'Foundation';
  classLevel?: string;
  subjectTag?: string;
  duration?: string;
  targetExams?: string;
  price: number;
  thumbnailUrl?: string;
  status: 'PUBLISHED' | 'DRAFT';
  enrolledCount?: number;
  modules?: CourseModule[];
  examIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TestSeries {
  id: string;
  title: string;
  description?: string;
  price: number;
  mockTestCount: number;
  classLevel?: string;
  examCategory:
    | 'IIT-JEE'
    | 'JEE Main'
    | 'JEE Advanced'
    | 'MHT-CET'
    | 'NEET'
    | 'G-PAT'
    | 'Foundation'
    | 'JEE Main PCMB'
    | 'JEE Advanced PCMB'
    | 'MHT-CET PCMB'
    | 'NEET PCB'
    | 'PCMB Foundation'
    | 'JEE Main Mathematics'
    | 'JEE Advanced Mathematics'
    | 'MHT-CET Mathematics';
  status: 'PUBLISHED' | 'DRAFT';
  examIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentRecord {
  id: string;
  studentUid: string;
  studentId?: string;
  studentName: string;
  studentEmail?: string;
  itemType: 'COURSE' | 'TEST_SERIES';
  itemId: string;
  itemTitle: string;
  amount: number;
  utr: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submissionDate: string;
  verifiedBy?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Enrollment {
  id: string;
  studentUid: string;
  studentId?: string;
  studentName?: string;
  itemType: 'COURSE' | 'TEST_SERIES';
  itemId: string;
  itemTitle: string;
  paymentId?: string;
  status: 'ACTIVE' | 'REVOKED';
  enrolledAt: string;
}
