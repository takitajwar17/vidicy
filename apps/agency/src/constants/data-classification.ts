/**
 * PII Data Classification Map
 *
 * Inventory of all personally identifiable information stored by the application.
 * Used for GDPR compliance audits, data subject access requests, and retention enforcement.
 *
 * Sensitivity levels:
 *   CRITICAL — Government-issued IDs, biometric data, financial documents
 *   HIGH     — Direct personal identifiers (name, email, DOB)
 *   MEDIUM   — Indirect identifiers (IP address, device fingerprint)
 *   LOW      — Non-identifying operational data (preferences, timestamps)
 */

export const DATA_SENSITIVITY = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export const LAWFUL_BASIS = {
  CONTRACT: "contract",
  CONSENT: "consent",
  LEGITIMATE_INTEREST: "legitimate_interest",
  LEGAL_OBLIGATION: "legal_obligation",
} as const;

export const DATA_CLASSIFICATION = {
  // ── User table ──────────────────────────────────────────────
  USER_EMAIL: {
    table: "user",
    column: "email",
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "contact",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until account deletion",
  },
  USER_NAME: {
    table: "user",
    columns: ["firstName", "lastName"],
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "identity",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until account deletion",
  },
  USER_PASSWORD_HASH: {
    table: "user",
    column: "passwordHash",
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "credential",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until account deletion",
    encryption: "PBKDF2-SHA256 (100k iterations, 128-bit salt)",
  },
  USER_SIGNUP_IP: {
    table: "user",
    column: "signUpIpAddress",
    sensitivity: DATA_SENSITIVITY.MEDIUM,
    category: "network",
    lawfulBasis: LAWFUL_BASIS.LEGITIMATE_INTEREST,
    retentionPolicy: "Until account deletion",
    purpose: "Fraud prevention and abuse detection at sign-up",
  },
  USER_GOOGLE_ACCOUNT_ID: {
    table: "user",
    column: "googleAccountId",
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "identity",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until account deletion",
  },

  // ── Applicant table ─────────────────────────────────────────
  APPLICANT_NAME: {
    table: "applicant",
    column: "name",
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "identity",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until application deletion",
  },
  APPLICANT_DOB: {
    table: "applicant",
    column: "dateOfBirth",
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "identity",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until application deletion",
  },
  APPLICANT_PASSPORT: {
    table: "applicant",
    column: "passportNumber",
    sensitivity: DATA_SENSITIVITY.CRITICAL,
    category: "government_id",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until application deletion",
    notes: "Government-issued travel document number — highest sensitivity",
  },
  APPLICANT_NATIONALITY: {
    table: "applicant",
    column: "nationality",
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "identity",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until application deletion",
  },
  APPLICANT_EMAIL: {
    table: "applicant",
    column: "email",
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "contact",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until application deletion",
  },

  // ── Document evaluation table ───────────────────────────────
  EVALUATION_EXTRACTED_FIELDS: {
    table: "document_evaluation",
    column: "itemFeedback.extractedFields",
    sensitivity: DATA_SENSITIVITY.CRITICAL,
    category: "extracted_pii",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until application deletion",
    notes: "AI-extracted PII: holderName, documentNumber, expiryDate, issuingAuthority",
  },

  // ── Uploaded document table ─────────────────────────────────
  DOCUMENT_TEXT_CONTENT: {
    table: "uploaded_document",
    column: "textContent",
    sensitivity: DATA_SENSITIVITY.CRITICAL,
    category: "document_content",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until application deletion",
    notes: "Extracted PDF text may contain passport details, financial figures, personal addresses",
  },

  // ── R2 object storage ──────────────────────────────────────
  R2_DOCUMENT_FILES: {
    storage: "R2",
    bucket: "visa-documents",
    keyPattern: "visa-documents/{userId}/{appId}/{subPath}/{timestamp}-{name}",
    sensitivity: DATA_SENSITIVITY.CRITICAL,
    category: "document_files",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until application deletion",
    encryption: "Cloudflare R2 AES-256 server-side encryption at rest (default)",
  },

  // ── Vectorize embeddings ────────────────────────────────────
  VECTORIZE_EMBEDDINGS: {
    storage: "Vectorize",
    index: "visa-document-chunks",
    idPattern: "{documentId}-{chunkIndex}",
    sensitivity: DATA_SENSITIVITY.MEDIUM,
    category: "derived_data",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until application deletion",
    notes: "Numerical vector representations — cannot be reverse-engineered to original text",
  },

  // ── Support ticket table ────────────────────────────────────
  SUPPORT_USER_AGENT: {
    table: "support_ticket",
    column: "userAgent",
    sensitivity: DATA_SENSITIVITY.MEDIUM,
    category: "device_fingerprint",
    lawfulBasis: LAWFUL_BASIS.LEGITIMATE_INTEREST,
    retentionPolicy: "Until ticket resolution + 90 days",
  },
  SUPPORT_IP_ADDRESS: {
    table: "support_ticket",
    column: "ipAddress",
    sensitivity: DATA_SENSITIVITY.MEDIUM,
    category: "network",
    lawfulBasis: LAWFUL_BASIS.LEGITIMATE_INTEREST,
    retentionPolicy: "Until ticket resolution + 90 days",
  },

  // ── Enterprise inquiry table ────────────────────────────────
  ENTERPRISE_EMAIL: {
    table: "enterprise_inquiry",
    column: "email",
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "contact",
    lawfulBasis: LAWFUL_BASIS.CONSENT,
    retentionPolicy: "90 days after inquiry or until manually deleted",
  },
  ENTERPRISE_NAME: {
    table: "enterprise_inquiry",
    column: "name",
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "identity",
    lawfulBasis: LAWFUL_BASIS.CONSENT,
    retentionPolicy: "90 days after inquiry or until manually deleted",
  },

  // ── Collaboration tables ────────────────────────────────────
  INVITATION_EMAIL: {
    table: "application_invitation",
    column: "email",
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "contact",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "Until invitation expires or application deletion",
  },

  // ── KV session storage ──────────────────────────────────────
  KV_SESSION_DATA: {
    storage: "KV",
    keyPattern: "session:{userId}:{sessionId}",
    sensitivity: DATA_SENSITIVITY.HIGH,
    category: "session",
    lawfulBasis: LAWFUL_BASIS.CONTRACT,
    retentionPolicy: "30 days (automatic KV TTL expiration)",
    notes: "Contains user profile snapshot (name, email, role), IP, user agent, geolocation",
    encryption: "Cloudflare KV encrypted at rest",
  },
} as const;
