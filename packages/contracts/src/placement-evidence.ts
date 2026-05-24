import { z } from "zod";
import { ScriptUploadSessionRequestSchema, ScriptUploadSessionResponseSchema } from "./script.js";
import { SubmissionStatusSchema } from "./submission.js";

export const PlacementEvidenceKindSchema = z.enum(["screenshot", "pdf", "document", "url", "other"]);

export type PlacementEvidenceKind = z.infer<typeof PlacementEvidenceKindSchema>;

export const PlacementEvidenceSchema = z.object({
  id: z.string().min(1),
  placementId: z.string().min(1),
  scriptId: z.string().min(1).nullable(),
  evidenceUrl: z.string().url().nullable(),
  kind: PlacementEvidenceKindSchema,
  caption: z.string().max(500).nullable(),
  uploadedByUserId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type PlacementEvidence = z.infer<typeof PlacementEvidenceSchema>;

export const CreatePlacementEvidenceItemSchema = z.object({
  scriptId: z.string().min(1).optional(),
  evidenceUrl: z.string().url().optional(),
  kind: PlacementEvidenceKindSchema,
  caption: z.string().max(500).optional()
}).refine((value) => Boolean(value.scriptId || value.evidenceUrl), {
  message: "scriptId or evidenceUrl is required",
  path: ["scriptId"]
});

export type CreatePlacementEvidenceItem = z.infer<typeof CreatePlacementEvidenceItemSchema>;

export const CreateHistoricalPlacementRequestSchema = z.object({
  projectId: z.string().min(1),
  competitionId: z.string().min(1).optional(),
  competitionNameFreeform: z.string().min(1).max(300).optional(),
  status: SubmissionStatusSchema,
  placementDate: z.string().min(1),
  sourceNote: z.string().max(2000),
  evidenceItems: z.array(CreatePlacementEvidenceItemSchema).min(1)
}).refine((value) => Boolean(value.competitionId || value.competitionNameFreeform), {
  message: "competitionId or competitionNameFreeform is required",
  path: ["competitionId"]
});

export type CreateHistoricalPlacementRequest = z.infer<typeof CreateHistoricalPlacementRequestSchema>;

export const EvidenceUploadRequestSchema = ScriptUploadSessionRequestSchema.extend({
  visibility: z.literal("evidence").default("evidence")
});

export type EvidenceUploadRequest = z.infer<typeof EvidenceUploadRequestSchema>;

export const EvidenceUploadResponseSchema = ScriptUploadSessionResponseSchema;

export type EvidenceUploadResponse = z.infer<typeof EvidenceUploadResponseSchema>;

export const ReviewPlacementRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
  notes: z.string().max(2000).optional()
});

export type ReviewPlacementRequest = z.infer<typeof ReviewPlacementRequestSchema>;

export type CreateHistoricalPlacementData = CreateHistoricalPlacementRequest & {
  recordedByUserId: string;
};

export type CreatePlacementEvidenceData = CreatePlacementEvidenceItem & {
  placementId: string;
  uploadedByUserId: string;
};

export type PlacementVerificationUpdateData = {
  verificationState: "pending" | "verified" | "rejected";
  reviewedByUserId?: string;
  reviewNotes?: string;
};
