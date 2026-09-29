import { relations } from "drizzle-orm";
import { userTable } from "./user";
import { visaApplicationTable } from "./visa-application";
import {
  marketingContactTable,
  marketingEmailSendTable,
  marketingEventTable,
  marketingSequenceEnrollmentTable,
} from "./marketing";
import { applicantTable } from "./applicant";
import { checklistItemTable } from "./checklist";
import { uploadedDocumentTable, documentEvaluationTable } from "./document";
import { chatMessageTable, chatConversationTable } from "./chat";
import { applicationMembershipTable, applicationRoleTable, applicationInvitationTable } from "./collaboration";
import { supportTicketTable, supportMessageTable } from "./support";
import {
  agencyClientTable,
  agencyTeamMemberTable,
  clientReportTable,
  reviewIssueTable,
} from "./agency";

export const userRelations = relations(userTable, ({ many }) => ({
  supportTickets: many(supportTicketTable),
  marketingContacts: many(marketingContactTable),
  marketingEnrollments: many(marketingSequenceEnrollmentTable),
  marketingEvents: many(marketingEventTable),
  agencyTeamMemberships: many(agencyTeamMemberTable),
}));

export const visaApplicationRelations = relations(visaApplicationTable, ({ one, many }) => ({
  user: one(userTable, {
	  fields: [visaApplicationTable.userId],
	  references: [userTable.id],
	}),
  applicants: many(applicantTable),
  checklistItems: many(checklistItemTable),
  uploadedDocuments: many(uploadedDocumentTable),
  evaluations: many(documentEvaluationTable),
  chatMessages: many(chatMessageTable),
  conversations: many(chatConversationTable),
  memberships: many(applicationMembershipTable),
  invitations: many(applicationInvitationTable),
  roles: many(applicationRoleTable),
  marketingEnrollments: many(marketingSequenceEnrollmentTable),
  marketingEvents: many(marketingEventTable),
  reviewIssues: many(reviewIssueTable),
  clientReports: many(clientReportTable),
}));

export const agencyClientRelations = relations(agencyClientTable, () => ({}));

export const agencyTeamMemberRelations = relations(agencyTeamMemberTable, ({ one }) => ({
  user: one(userTable, {
    fields: [agencyTeamMemberTable.userId],
    references: [userTable.id],
  }),
  invitedByUser: one(userTable, {
    fields: [agencyTeamMemberTable.invitedBy],
    references: [userTable.id],
  }),
}));

export const marketingContactRelations = relations(marketingContactTable, ({ one }) => ({
  user: one(userTable, {
    fields: [marketingContactTable.userId],
    references: [userTable.id],
  }),
}));

export const marketingSequenceEnrollmentRelations = relations(marketingSequenceEnrollmentTable, ({ many, one }) => ({
  user: one(userTable, {
    fields: [marketingSequenceEnrollmentTable.userId],
    references: [userTable.id],
  }),
  application: one(visaApplicationTable, {
    fields: [marketingSequenceEnrollmentTable.applicationId],
    references: [visaApplicationTable.id],
  }),
  sends: many(marketingEmailSendTable),
}));

export const marketingEmailSendRelations = relations(marketingEmailSendTable, ({ one }) => ({
  enrollment: one(marketingSequenceEnrollmentTable, {
    fields: [marketingEmailSendTable.enrollmentId],
    references: [marketingSequenceEnrollmentTable.id],
  }),
}));

export const marketingEventRelations = relations(marketingEventTable, ({ one }) => ({
  user: one(userTable, {
    fields: [marketingEventTable.userId],
    references: [userTable.id],
  }),
  application: one(visaApplicationTable, {
    fields: [marketingEventTable.applicationId],
    references: [visaApplicationTable.id],
  }),
}));

export const applicantRelations = relations(applicantTable, ({ one, many }) => ({
  application: one(visaApplicationTable, {
    fields: [applicantTable.applicationId],
    references: [visaApplicationTable.id],
  }),
  user: one(userTable, {
    fields: [applicantTable.userId],
    references: [userTable.id],
  }),
  checklistItems: many(checklistItemTable),
  uploadedDocuments: many(uploadedDocumentTable),
  evaluations: many(documentEvaluationTable),
}));

export const checklistItemRelations = relations(checklistItemTable, ({ one, many }) => ({
  application: one(visaApplicationTable, {
    fields: [checklistItemTable.applicationId],
    references: [visaApplicationTable.id],
  }),
  applicant: one(applicantTable, {
    fields: [checklistItemTable.applicantId],
    references: [applicantTable.id],
  }),
  uploadedDocuments: many(uploadedDocumentTable),
}));

export const uploadedDocumentRelations = relations(uploadedDocumentTable, ({ one }) => ({
  application: one(visaApplicationTable, {
    fields: [uploadedDocumentTable.applicationId],
    references: [visaApplicationTable.id],
  }),
  checklistItem: one(checklistItemTable, {
    fields: [uploadedDocumentTable.checklistItemId],
    references: [checklistItemTable.id],
  }),
}));

export const reviewIssueRelations = relations(reviewIssueTable, ({ one }) => ({
  application: one(visaApplicationTable, {
    fields: [reviewIssueTable.applicationId],
    references: [visaApplicationTable.id],
  }),
  applicant: one(applicantTable, {
    fields: [reviewIssueTable.applicantId],
    references: [applicantTable.id],
  }),
  checklistItem: one(checklistItemTable, {
    fields: [reviewIssueTable.checklistItemId],
    references: [checklistItemTable.id],
  }),
  document: one(uploadedDocumentTable, {
    fields: [reviewIssueTable.documentId],
    references: [uploadedDocumentTable.id],
  }),
  assignedTo: one(userTable, {
    fields: [reviewIssueTable.assignedToId],
    references: [userTable.id],
  }),
  createdBy: one(userTable, {
    fields: [reviewIssueTable.createdById],
    references: [userTable.id],
  }),
}));

export const clientReportRelations = relations(clientReportTable, ({ one }) => ({
  application: one(visaApplicationTable, {
    fields: [clientReportTable.applicationId],
    references: [visaApplicationTable.id],
  }),
  createdBy: one(userTable, {
    fields: [clientReportTable.createdById],
    references: [userTable.id],
  }),
}));

export const documentEvaluationRelations = relations(documentEvaluationTable, ({ one }) => ({
  application: one(visaApplicationTable, {
    fields: [documentEvaluationTable.applicationId],
    references: [visaApplicationTable.id],
  }),
}));

export const chatMessageRelations = relations(chatMessageTable, ({ one }) => ({
  application: one(visaApplicationTable, {
    fields: [chatMessageTable.applicationId],
    references: [visaApplicationTable.id],
  }),
  conversation: one(chatConversationTable, {
    fields: [chatMessageTable.conversationId],
    references: [chatConversationTable.id],
  }),
}));

export const chatConversationRelations = relations(chatConversationTable, ({ one, many }) => ({
  application: one(visaApplicationTable, {
    fields: [chatConversationTable.applicationId],
    references: [visaApplicationTable.id],
  }),
  messages: many(chatMessageTable),
}));

export const applicationMembershipRelations = relations(applicationMembershipTable, ({ one }) => ({
  application: one(visaApplicationTable, {
    fields: [applicationMembershipTable.applicationId],
    references: [visaApplicationTable.id],
  }),
  user: one(userTable, {
    fields: [applicationMembershipTable.userId],
    references: [userTable.id],
  }),
  invitedByUser: one(userTable, {
    fields: [applicationMembershipTable.invitedBy],
    references: [userTable.id],
  }),
}));

export const applicationRoleRelations = relations(applicationRoleTable, ({ one }) => ({
  application: one(visaApplicationTable, {
    fields: [applicationRoleTable.applicationId],
    references: [visaApplicationTable.id],
  }),
}));

export const applicationInvitationRelations = relations(applicationInvitationTable, ({ one }) => ({
  application: one(visaApplicationTable, {
    fields: [applicationInvitationTable.applicationId],
    references: [visaApplicationTable.id],
  }),
  invitedByUser: one(userTable, {
    fields: [applicationInvitationTable.invitedBy],
    references: [userTable.id],
  }),
  acceptedByUser: one(userTable, {
    fields: [applicationInvitationTable.acceptedBy],
    references: [userTable.id],
  }),
}));

export const supportTicketRelations = relations(supportTicketTable, ({ many, one }) => ({
  user: one(userTable, {
    fields: [supportTicketTable.userId],
    references: [userTable.id],
  }),
  messages: many(supportMessageTable),
}));

export const supportMessageRelations = relations(supportMessageTable, ({ one }) => ({
  ticket: one(supportTicketTable, {
    fields: [supportMessageTable.ticketId],
    references: [supportTicketTable.id],
  }),
  user: one(userTable, {
    fields: [supportMessageTable.userId],
    references: [userTable.id],
  }),
}));
