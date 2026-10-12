import { z } from "zod";
import { CHECKLIST_APPLICABILITY, CHECKLIST_REQUIREMENTS } from "./checklist-state";

const identity = {
  applicationId: z.string().min(1),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
};
export const checklistMutationSchema = z.discriminatedUnion("operation", [
  z.object({
    ...identity,
    operation: z.literal("save"),
    itemId: z.string().min(1).optional(),
    applicantId: z.string().min(1).nullable(),
    documentName: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4000),
    requirementType: z.enum(CHECKLIST_REQUIREMENTS),
    applicability: z.enum(CHECKLIST_APPLICABILITY),
    requirementCondition: z.string().trim().max(2000),
  }),
  z.object({ ...identity, operation: z.literal("remove"), itemId: z.string().min(1) }),
]);
export type ChecklistMutation = z.infer<typeof checklistMutationSchema>;
