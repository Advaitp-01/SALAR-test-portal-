# GYANSAI Maths IIT Center - Security Specification & Data Invariants

## 1. Core Data Invariants
1. **Strict Role Separation**: Only two roles exist: `SUPER_ADMIN` (verified bootstrapped admin email or `/admins/{uid}` document) and `STUDENT` (authenticated student user). Faculty Directory is management-only with zero auth privileges.
2. **Exam Isolation**: Every examination owns an independent subcollection `/exams/{examId}/questions/{questionId}`. Cloning or editing one exam never mutates any other exam or the master Question Bank.
3. **Terminal Attempt Locking**: Once an `ExamAttempt` transitions from `IN_PROGRESS` to `SUBMITTED` or `EVALUATED`, students can never modify answers, timestamps, or scores. Only `SUPER_ADMIN` can perform manual evaluation overrides (recorded in immutable `/evaluationLogs`).
4. **Payment Integrity**: Students may only submit payments with `status == "PENDING"`. Unverified UTRs never grant enrollments. Only `SUPER_ADMIN` can transition payments to `APPROVED` or `REJECTED` and issue `/enrollments`.
5. **PII Isolation**: Student emails, mobile/WhatsApp numbers, faculty contacts, and payment UTRs are restricted strictly to `SUPER_ADMIN` or the owning student (`uid == request.auth.uid`).

## 2. The "Dirty Dozen" Attack Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Student Read**: Anonymous client attempts `getDocs(collection(db, "students"))`.
2. **Self-Assigned Admin Privilege**: Student attempts `setDoc(doc(db, "admins", myUid), { uid: myUid, email: myEmail, createdAt: serverTimestamp() })`.
3. **Spoofed Email Unverified**: User with `email_verified: false` attempts admin mutation.
4. **Shadow Field Injection on Student Create**: Student includes `isAdmin: true` or `role: "SUPER_ADMIN"` in `/students/{uid}` create payload.
5. **Pre-Approved Payment Fraud**: Student creates `/payments/{id}` with `status: "APPROVED"` instead of `"PENDING"`.
6. **Attempt Score Tampering**: Student updates `/examAttempts/{attemptId}` to set `finalScore: 100` or modifies answers after `status == "SUBMITTED"`.
7. **Cross-Student PII Scraping**: Student A queries `/students` or `/payments` without `where("uid", "==", studentA_uid)`.
8. **Question Bank Leak**: Student attempts to read `/questions` (master bank) or `/exams/{draftId}/questions` for a `DRAFT` exam.
9. **Resource Poisoning / Oversized ID**: Client writes a 500-character document ID or invalid characters (`../evil`) into any path.
10. **Audit Log Tampering**: Any user attempts `update` or `delete` on `/evaluationLogs/{logId}`.
11. **Course / Test Series Price Manipulation**: Student attempts to update `/courses/{courseId}` price to `0`.
12. **Unverified Enrollment Creation**: Student attempts to directly create `/enrollments/{enrollmentId}` without admin payment approval.
