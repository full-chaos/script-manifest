import { z } from "zod";
import { SubmissionStatusSchema } from "./submission.js";

export const CsvRowSchema = z.object({
  project_title: z.string().default(""),
  competition_name: z.string().default(""),
  year: z.string().default(""),
  status: z.string().default(""),
  placement_date: z.string().default(""),
  source_url: z.string().default(""),
  source_note: z.string().default("")
});
export type CsvRow = z.infer<typeof CsvRowSchema>;

export const CareerImportPreviewRowSchema = z.object({
  rowIndex: z.number().int().min(0),
  row: CsvRowSchema,
  status: z.enum(["ok", "error"]),
  errors: z.array(z.string())
});
export type CareerImportPreviewRow = z.infer<typeof CareerImportPreviewRowSchema>;

export const CareerHistoryImportSchema = z.object({
  id: z.string().min(1),
  writerId: z.string().min(1),
  filename: z.string().nullable(),
  rowCount: z.number().int().min(0),
  succeeded: z.number().int().min(0),
  failed: z.number().int().min(0),
  status: z.enum(["pending", "validated", "committed", "failed"]),
  errorLog: z.array(CareerImportPreviewRowSchema),
  createdAt: z.string().datetime({ offset: true }),
  committedAt: z.string().datetime({ offset: true }).nullable()
});
export type CareerHistoryImport = z.infer<typeof CareerHistoryImportSchema>;

export const ImportPreviewResponseSchema = z.object({
  batch: CareerHistoryImportSchema,
  rows: z.array(CareerImportPreviewRowSchema)
});
export type ImportPreviewResponse = z.infer<typeof ImportPreviewResponseSchema>;

export const ImportCommitRequestSchema = z.object({
  batchId: z.string().min(1),
  acceptedRowIndices: z.array(z.number().int().min(0)).max(500),
  rowOverrides: z.array(z.object({
    rowIndex: z.number().int().min(0),
    status: SubmissionStatusSchema
  })).max(500).optional()
});
export type ImportCommitRequest = z.infer<typeof ImportCommitRequestSchema>;

export const ImportCommitResponseSchema = z.object({
  batchId: z.string().min(1),
  committed: z.number().int().min(0),
  skipped: z.number().int().min(0)
});
export type ImportCommitResponse = z.infer<typeof ImportCommitResponseSchema>;

export const CreateCareerImportPreviewDataSchema = z.object({
  writerId: z.string().min(1),
  filename: z.string().max(255).nullable(),
  rows: z.array(CsvRowSchema).max(500)
});
export type CreateCareerImportPreviewData = z.infer<typeof CreateCareerImportPreviewDataSchema>;

export const CommitCareerImportDataSchema = ImportCommitRequestSchema.extend({
  writerId: z.string().min(1)
});
export type CommitCareerImportData = z.infer<typeof CommitCareerImportDataSchema>;

export const CareerImportStatusValues = SubmissionStatusSchema.options;
