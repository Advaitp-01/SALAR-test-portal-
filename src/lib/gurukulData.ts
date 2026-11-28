import type {
  Course,
  CourseModule,
  FrontendCustomizationConfig,
  FrontendSubjectItem,
  InstituteSettings,
  TestSeries,
} from '../types/portal';

export const PCMB_DEFAULT_SUBJECTS: FrontendSubjectItem[] = [
  {
    id: 'subj-physics',
    name: 'Physics',
    tagline: 'Mechanics · Electrodynamics · Modern Physics',
    description:
      'Concept-first derivations, numerical problem-solving, and vector/graph intuition for IIT-JEE, NEET, and MHT-CET.',
    topics: 'Laws of Motion, Electrostatics, Optics, Thermodynamics',
  },
  {
    id: 'subj-chemistry',
    name: 'Chemistry',
    tagline: 'Physical · Organic · Inorganic Chemistry',
    description:
      'NCERT line-by-line mastery, reaction mechanism mapping, and rapid numerical drills across all three branches.',
    topics: 'Chemical Equilibrium, Coordination Compounds, Organic Mechanisms',
  },
  {
    id: 'subj-mathematics',
    name: 'Mathematics',
    tagline: 'Calculus · Algebra · Coordinate Geometry',
    description:
      'Multi-concept analytical fluency, graphical transformations, and speed-accuracy strategies for JEE Main, Advanced & MHT-CET.',
    topics: 'Definite Integration, Matrices, Vectors & 3D, Conic Sections',
  },
  {
    id: 'subj-biology',
    name: 'Biology',
    tagline: 'Botany · Zoology · NCERT Diagram Mastery',
    description:
      'Statement-based NCERT recall, human physiology, genetics, and high-yield assertion-reason practice for NEET-UG.',
    topics: 'Human Physiology, Genetics & Biotechnology, Plant Diversity',
  },
];

export const GURUKUL_DEFAULT_FRONTEND: FrontendCustomizationConfig = {
  announcementEnabled: true,
  announcementText: 'Admissions open for the new academic batch — limited seats per batch.',
  announcementCtaLabel: 'G-PAT Scholarship Test',
  establishedYear: '2009',
  founderName: 'IITian Prof. Pradip Giri',
  motto: 'Study with Enjoyment',
  aboutHeading: 'Excellence in Education. Excellence in Results. Excellence in Life.',
  aboutBody:
    'Founded in 2009 under IITian Prof. Pradip Giri, our academic ecosystem covers Physics, Chemistry, Mathematics, and Biology (PCMB) with small batches, daily DPP sheets, 6-hour teacher-supervised study, and NTA-grade CBT diagnostics.',
  officeHours: 'Monday to Sunday, 8:00 AM – 8:00 PM',
  highlights: [
    { value: '2009', label: 'Established' },
    { value: 'PCMB', label: 'Physics · Chem · Maths · Bio' },
    { value: 'AIR 8', label: 'JEE Advanced (General)' },
    { value: '677+', label: 'NEET Score' },
  ],
  subjects: PCMB_DEFAULT_SUBJECTS,
  approachSteps: [
    {
      title: 'Learn',
      description: 'Understand fundamental PCMB concepts through structured classroom teaching.',
    },
    {
      title: 'Understand',
      description: 'Develop conceptual clarity with doubt-solving and application-based learning.',
    },
    {
      title: 'Practise',
      description: 'Improve through regular problem-solving, daily DPP sheets, and CBT tests.',
    },
    {
      title: 'Excel',
      description: 'Achieve IIT-JEE, NEET, MHT-CET, and Board goals with mock tests and revision.',
    },
  ],
  features: [
    {
      title: 'Small Batch Strength',
      description: 'Limited seats so every student receives direct attention and daily tracking.',
    },
    {
      title: 'DPP – Daily Practice Test',
      description: 'A short daily practice paper in Physics, Chemistry, Maths & Biology, checked in class.',
    },
    {
      title: 'Teacher-Supervised 6-Hour Study',
      description: 'Six hours of daily study completed under the active observation of subject teachers.',
    },
    {
      title: 'Weekly CBT & Board Assessment',
      description: 'Tests every week with NTA-grade analytics, rank review, and parent feedback.',
    },
  ],
  campusFacilities: [
    {
      title: 'Residential Campus',
      description:
        'Safe, disciplined and fully supervised residential ecosystem for outstation students with separate boys and girls accommodation.',
      imageUrl: '/assets/gurukul/campus_0.webp',
    },
    {
      title: 'Day-Care / Day-Boarding Facility',
      description:
        'Extended campus study hours for day scholars with supervised doubt clearing, meals, and individual academic monitoring.',
      imageUrl: '/assets/gurukul/campus_1.webp',
    },
  ],
  performers: [
    { name: 'Omkar', exam: 'IIT-JEE', score: 'AIR 3 (Reserved)', imageUrl: '/assets/gurukul/result_0.webp' },
    { name: 'Sarthak Athawale', exam: 'JEE Advanced', score: 'AIR 24 (PRE)' },
    { name: 'Varad V. Bochare', exam: 'JEE Advanced', score: 'AIR 738' },
    { name: 'Soumyadeep Giri', exam: 'JEE Advanced', score: 'AIR 1803' },
    { name: 'Gururav Gaikwad', exam: 'JEE Advanced', score: 'AIR 2502' },
    { name: 'Utkarsh Zawar', exam: 'NEET-UG', score: 'Selected at AIIMS (MBBS)' },
    { name: 'Yash Rathi', exam: 'NEET-UG', score: 'Selected at AIIMS (MBBS)' },
  ],
  testimonial: {
    name: 'Advait Padhye',
    role: 'Student · 11th & 12th Batch',
    quote:
      'I completed my 11th and 12th in Gurukul Classes. Earlier I felt less concentration in my studies, and after meeting Giri Sir, he helped improve my concentration, suggested the best approach to study, and gave me clear direction throughout.',
  },
  gpatSchedules: [
    { title: 'GPAT Exam 7th 2025-2026', classLevel: 'Class 7', code: 'GC-GPAT-07', duration: '60 mins' },
    { title: 'GPAT Exam 8th 2025-2026', classLevel: 'Class 8', code: 'GC-GPAT-08', duration: '60 mins' },
    { title: 'GPAT Exam 9th 2025-2026', classLevel: 'Class 9', code: 'GC-GPAT-09', duration: '60 mins' },
    { title: 'GPAT Exam 10th 2025-2026', classLevel: 'Class 10', code: 'GC-GPAT-10', duration: '60 mins' },
  ],
  sectionHeadings: {
    subjectsHeading: 'Subjects Taught — Physics, Chemistry, Mathematics & Biology',
    subjectsSubheading: 'Complete PCMB preparation under subject-specialist faculty for IIT-JEE, NEET, MHT-CET & Boards.',
    coursesHeading: 'Programmes for Classes VIII–XII & Integrated Tracks',
    coursesSubheading: 'Structured PCM & PCB classroom tracks with daily practice papers and CBT drills.',
    testSeriesHeading: 'Competitive & G-PAT Online CBT Packs',
    testSeriesSubheading: 'Practice NTA-grade timed papers across Physics, Chemistry, Mathematics, and Biology.',
    liveExamsHeading: 'Open / Public & Scheduled Exams',
    performersHeading: 'Consistent IIT, NIT & AIIMS Selections',
    campusHeading: 'Residential & Day-Boarding Ecosystem',
  },
  footerNote: 'Powered by dedicated PCMB faculty & NTA-grade CBT examination infrastructure.',
  sectionVisibility: {
    showAnnouncement: true,
    showHighlights: true,
    showSubjects: true,
    showAbout: true,
    showApproach: true,
    showFeatures: true,
    showCampus: true,
    showPerformers: true,
    showCourses: true,
    showTestSeries: true,
    showLiveExams: true,
    showGpat: true,
    showTestimonial: true,
    showContact: true,
  },
};

export function buildDefaultFrontendConfig(instituteName?: string): FrontendCustomizationConfig {
  const cleanName = instituteName?.trim();
  if (!cleanName || cleanName === "Giri Sir's Gurukul Classes") {
    return {
      ...GURUKUL_DEFAULT_FRONTEND,
      highlights: GURUKUL_DEFAULT_FRONTEND.highlights.map((h) => ({ ...h })),
      subjects: GURUKUL_DEFAULT_FRONTEND.subjects.map((s) => ({ ...s })),
      approachSteps: GURUKUL_DEFAULT_FRONTEND.approachSteps.map((a) => ({ ...a })),
      features: GURUKUL_DEFAULT_FRONTEND.features.map((f) => ({ ...f })),
      campusFacilities: GURUKUL_DEFAULT_FRONTEND.campusFacilities.map((c) => ({ ...c })),
      performers: GURUKUL_DEFAULT_FRONTEND.performers.map((p) => ({ ...p })),
      testimonial: { ...GURUKUL_DEFAULT_FRONTEND.testimonial },
      gpatSchedules: GURUKUL_DEFAULT_FRONTEND.gpatSchedules.map((g) => ({ ...g })),
      sectionHeadings: { ...GURUKUL_DEFAULT_FRONTEND.sectionHeadings },
      sectionVisibility: { ...GURUKUL_DEFAULT_FRONTEND.sectionVisibility },
    };
  }
  return {
    ...GURUKUL_DEFAULT_FRONTEND,
    announcementEnabled: false,
    announcementText: `Admissions & Online CBT Series open at ${cleanName}.`,
    establishedYear: String(new Date().getFullYear()),
    founderName: `${cleanName} Academic Desk`,
    aboutHeading: `${cleanName} — Disciplined Preparation in Physics, Chemistry, Mathematics & Biology`,
    aboutBody: `${cleanName} offers structured classroom & Computer-Based Testing (CBT) programmes across Physics, Chemistry, Mathematics, and Biology for IIT-JEE, NEET, MHT-CET, and Foundation aspirants.`,
    highlights: [
      { value: 'PCMB', label: 'Physics · Chem · Maths · Bio' },
      { value: 'CBT', label: 'NTA-Grade Exam Engine' },
      { value: 'DPP', label: 'Daily Practice Sheets' },
      { value: '1:1', label: 'Faculty Doubt Support' },
    ],
    subjects: PCMB_DEFAULT_SUBJECTS.map((s) => ({ ...s })),
    approachSteps: GURUKUL_DEFAULT_FRONTEND.approachSteps.map((a) => ({ ...a })),
    features: GURUKUL_DEFAULT_FRONTEND.features.map((f) => ({ ...f })),
    campusFacilities: [],
    performers: [],
    testimonial: {
      name: '',
      role: '',
      quote: '',
    },
    gpatSchedules: GURUKUL_DEFAULT_FRONTEND.gpatSchedules.map((g) => ({ ...g })),
    sectionHeadings: { ...GURUKUL_DEFAULT_FRONTEND.sectionHeadings },
    footerNote: `Official Examination & Academic Portal of ${cleanName}.`,
    sectionVisibility: {
      ...GURUKUL_DEFAULT_FRONTEND.sectionVisibility,
      showAnnouncement: false,
      showCampus: false,
      showPerformers: false,
      showTestimonial: false,
    },
  };
}

export const GURUKUL_PORTAL_META = {
  websiteUrl: 'https://cloudflare-gurukul.gurukulclassestech.workers.dev/',
  establishedYear: GURUKUL_DEFAULT_FRONTEND.establishedYear,
  founderName: GURUKUL_DEFAULT_FRONTEND.founderName,
  motto: GURUKUL_DEFAULT_FRONTEND.motto,
  aboutHeading: GURUKUL_DEFAULT_FRONTEND.aboutHeading,
  officeHours: GURUKUL_DEFAULT_FRONTEND.officeHours,
  announcementText: GURUKUL_DEFAULT_FRONTEND.announcementText,
  highlights: GURUKUL_DEFAULT_FRONTEND.highlights,
  approachSteps: GURUKUL_DEFAULT_FRONTEND.approachSteps,
  features: GURUKUL_DEFAULT_FRONTEND.features,
  campusFacilities: GURUKUL_DEFAULT_FRONTEND.campusFacilities,
  performers: GURUKUL_DEFAULT_FRONTEND.performers,
  testimonial: GURUKUL_DEFAULT_FRONTEND.testimonial,
  gpatSchedules: GURUKUL_DEFAULT_FRONTEND.gpatSchedules,
};

export const GURUKUL_DEFAULT_SETTINGS: InstituteSettings = {
  instituteName: "Giri Sir's Gurukul Classes",
  tagline:
    'Physics, Chemistry, Mathematics & Biology (PCMB) — Disciplined teaching for IIT-JEE, NEET, MHT-CET & Foundation.',
  storageTag: 'gurukul-vault-prod',
  logoUrl: '/assets/gurukul/logo.webp',
  logoWidth: 48,
  logoHeight: 40,
  heroImage: '/assets/gurukul/hero_banner_0.webp',
  heroTitle: 'Where serious PCMB preparation meets personal attention',
  heroSubtitle:
    'Founded in 2009 under IITian Prof. Pradip Giri in Chhatrapati Sambhajinagar — Physics, Chemistry, Mathematics & Biology faculty, daily DPP sheets, 6-hour supervised study, and NTA-grade CBT assessments.',
  primaryCta: 'Student Portal Login',
  secondaryCta: 'Quick Join Candidate',
  faviconUrl: '/assets/gurukul/favicon.png',
  primaryColor: '#0032A0',
  secondaryColor: '#2563EB',
  address: "Giri Sir's Gurukul Classes, Chhatrapati Sambhajinagar, Maharashtra, India",
  phone: '+91 9860968994',
  whatsapp: '+91 8459847998',
  email: 'gurukulclassestech@gmail.com',
  website: 'https://cloudflare-gurukul.gurukulclassestech.workers.dev/',
  socialLinks: {
    youtube: 'https://youtube.com',
    instagram: 'https://instagram.com',
    telegram: 'https://t.me',
  },
  portalConfig: {
    allowGoogleAuth: true,
    allowEmailPasswordAuth: true,
    allowQuickJoin: true,
    allowPublicRegistration: true,
    autoSubmitOnExpiry: true,
    strictNegativeMarking: true,
    upiId: 'gurukulclasses@upi',
    upiPayeeName: "Giri Sir's Gurukul Classes",
    bankDetails:
      'Admissions Office: Monday to Sunday, 8:00 AM – 8:00 PM. Submit 12-digit UPI UTR reference or verify with admissions desk.',
    storageProvider: 'Local Vault + Firestore Sync',
    enableEmailNotifications: true,
    enableWhatsAppNotifications: true,
    compactTables: false,
    frontend: GURUKUL_DEFAULT_FRONTEND,
  },
};

const buildDefaultModules = (courseSlug: string): CourseModule[] => {
  if (courseSlug === 'iit-jee-integrated') {
    return [
      {
        id: 'mod-jee-1',
        title: 'Module 01: Physics, Chemistry & Mathematics Core Concepts',
        chapters: [
          { id: 'ch-jee-1', title: 'Calculus, Coordinate Geometry & Vectors (Mathematics)', duration: 'Weekly DPP + CBT' },
          { id: 'ch-jee-2', title: 'Mechanics, Electrodynamics & Modern Physics', duration: 'Weekly DPP + CBT' },
          { id: 'ch-jee-3', title: 'Physical, Organic & Inorganic Chemistry Drills', duration: 'Weekly DPP + CBT' },
        ],
      },
      {
        id: 'mod-jee-2',
        title: 'Module 02: JEE Main, JEE Advanced & MHT-CET PYQ Mastery',
        chapters: [
          { id: 'ch-jee-4', title: 'Full-Length Mock Papers & Rank Review', duration: '6-Hour Supervised Study' },
        ],
      },
    ];
  }
  if (courseSlug === 'neet-integrated') {
    return [
      {
        id: 'mod-neet-1',
        title: 'Module 01: NCERT-Aligned Biology, Physics & Chemistry',
        chapters: [
          { id: 'ch-neet-1', title: 'Diagram-Based Botany & Human Physiology (Biology)', duration: 'Weekly DPP + CBT' },
          { id: 'ch-neet-2', title: 'NEET Numerical Physics & Speed Accuracy', duration: 'Weekly DPP + CBT' },
          { id: 'ch-neet-3', title: 'Organic Mechanisms & NCERT Chemistry Line-by-Line', duration: 'Weekly DPP + CBT' },
        ],
      },
    ];
  }
  return [
    {
      id: `mod-${courseSlug}-1`,
      title: 'Module 01: School Syllabus + Competitive Foundation',
      chapters: [
        { id: `ch-${courseSlug}-1`, title: 'Physics, Chemistry, Mathematics & Biology Concept Building', duration: 'Daily DPP' },
        { id: `ch-${courseSlug}-2`, title: 'G-PAT, Olympiad & Early IIT-JEE / NEET Problem Solving', duration: 'Weekly Assessment' },
      ],
    },
  ];
};

export const GURUKUL_COURSES_CATALOG: Array<Omit<Course, 'id'>> = [
  {
    name: 'Two-Year IIT-JEE Integrated Regular Course',
    description:
      'Integrated two-year classroom programme for Class XI & XII IIT-JEE aspirants preparing for JEE Main, JEE Advanced and MHT-CET. Morning & Evening batches with daily DPPs, 6-hour supervised study, weekly CBT tests, and regular parent updates.',
    category: 'JEE Advanced',
    classLevel: 'Class 11th & 12th',
    subjectTag: 'PHYSICS · CHEMISTRY · MATHEMATICS',
    duration: '2 Years',
    targetExams: 'JEE Main, JEE Advanced, MHT-CET',
    price: 45000,
    thumbnailUrl: '/assets/gurukul/course_two-year-iit-jee-integrated-course.webp',
    status: 'PUBLISHED',
    enrolledCount: 168,
    modules: buildDefaultModules('iit-jee-integrated'),
    examIds: [],
  },
  {
    name: 'Two-Year NEET Integrated Regular Course',
    description:
      'Integrated two-year classroom programme for Class XI & XII NEET aspirants preparing for NEET-UG and MHT-CET. Features NCERT-aligned conceptual teaching, diagram-based Biology mastery, weekly tests, and full-length mock analysis.',
    category: 'NEET',
    classLevel: 'Class 11th & 12th',
    subjectTag: 'PHYSICS · CHEMISTRY · BIOLOGY',
    duration: '2 Years',
    targetExams: 'NEET-UG, MHT-CET',
    price: 45000,
    thumbnailUrl: '/assets/gurukul/course_two-year-neet-integrated-course.webp',
    status: 'PUBLISHED',
    enrolledCount: 142,
    modules: buildDefaultModules('neet-integrated'),
    examIds: [],
  },
  {
    name: 'Five-Year Foundation Programme',
    description:
      'Five-year integrated foundation programme starting from Class VIII. Builds strong conceptual foundations in Physics, Chemistry, Mathematics & Biology alongside school academics and early IIT-JEE / NEET / Olympiad preparation.',
    category: 'Foundation',
    classLevel: 'Class 8th (5-Year)',
    subjectTag: 'PCMB FOUNDATION',
    duration: '5 Years',
    targetExams: 'IIT-JEE & NEET Foundation · G-PAT',
    price: 28000,
    thumbnailUrl: '/assets/gurukul/course_five-year-foundation-programme.webp',
    status: 'PUBLISHED',
    enrolledCount: 94,
    modules: buildDefaultModules('five-year-foundation'),
    examIds: [],
  },
  {
    name: 'Four-Year Foundation Programme',
    description:
      'Four-year integrated foundation programme starting from Class IX. Combines school syllabus mastery with analytical reasoning, Olympiad practice, G-PAT assessments, and early exposure to IIT-JEE & NEET level questions.',
    category: 'Foundation',
    classLevel: 'Class 9th (4-Year)',
    subjectTag: 'PCMB FOUNDATION',
    duration: '4 Years',
    targetExams: 'IIT-JEE & NEET Foundation · G-PAT',
    price: 30000,
    thumbnailUrl: '/assets/gurukul/course_four-year-foundation-programme.webp',
    status: 'PUBLISHED',
    enrolledCount: 112,
    modules: buildDefaultModules('four-year-foundation'),
    examIds: [],
  },
  {
    name: 'Three-Year Foundation Programme',
    description:
      'Three-year integrated foundation programme starting from Class X. Completes the SSC/CBSE Board syllabus with deep conceptual clarity in Physics, Chemistry, Mathematics & Biology while initiating structured competitive exam preparation.',
    category: 'Foundation',
    classLevel: 'Class 10th (3-Year)',
    subjectTag: 'PCMB FOUNDATION',
    duration: '3 Years',
    targetExams: 'SSC/Boards + IIT-JEE & NEET Foundation',
    price: 32000,
    thumbnailUrl: '/assets/gurukul/course_three-year-foundation-programme.webp',
    status: 'PUBLISHED',
    enrolledCount: 126,
    modules: buildDefaultModules('three-year-foundation'),
    examIds: [],
  },
];

export const GURUKUL_TEST_SERIES_CATALOG: Array<Omit<TestSeries, 'id'>> = [
  {
    title: 'Gurukul All-India IIT-JEE (Main + Advanced) CBT Test Series',
    description:
      'Full-length Computer-Based Tests simulating NTA JEE Main & IIT JEE Advanced patterns with previous-year papers, multi-concept drills, rank list & post-test performance review.',
    price: 2999,
    mockTestCount: 25,
    classLevel: 'Class 11th & 12th',
    examCategory: 'IIT-JEE',
    status: 'PUBLISHED',
    examIds: [],
  },
  {
    title: 'Gurukul NEET-UG Integrated NCERT Full Mock Test Series',
    description:
      'NCERT line-by-line Physics, Chemistry & Biology mock tests designed for 650+ target scorers with timer enforcement, accuracy analytics, and parent performance reports.',
    price: 2499,
    mockTestCount: 20,
    classLevel: 'Class 11th & 12th',
    examCategory: 'NEET',
    status: 'PUBLISHED',
    examIds: [],
  },
  {
    title: 'Gurukul MHT-CET (PCM & PCB) 99+ Percentile CBT Series',
    description:
      'Maharashtra State Board + MHT-CET speed-accuracy timed tests with instant scorecards, question-wise solution review, and chapter-level revision diagnostics.',
    price: 1499,
    mockTestCount: 20,
    classLevel: 'Class 12th',
    examCategory: 'MHT-CET',
    status: 'PUBLISHED',
    examIds: [],
  },
  {
    title: 'G-PAT Scholarship & Foundation CBT Series (Classes 7th–10th)',
    description:
      'Gurukul Performance & Aptitude Test (G-PAT) 60-minute scholarship & early IIT-JEE/NEET foundation series for Classes 7th, 8th, 9th and 10th.',
    price: 499,
    mockTestCount: 12,
    classLevel: 'Class 7th–10th',
    examCategory: 'G-PAT',
    status: 'PUBLISHED',
    examIds: [],
  },
];
