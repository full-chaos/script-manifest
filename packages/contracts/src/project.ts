import { z } from "zod";

export const ProjectSchema = z.object({
  id: z.string().min(1),
  ownerUserId: z.string().min(1),
  title: z.string().min(1),
  logline: z.string().default(""),
  synopsis: z.string().default(""),
  format: z.string().min(1),
  genre: z.string().min(1),
  pageCount: z.number().int().nonnegative().default(0),
  isDiscoverable: z.boolean().default(false),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type Project = z.infer<typeof ProjectSchema>;

export const ProjectCreateRequestSchema = z.object({
  title: z.string().min(1),
  logline: z.string().default(""),
  synopsis: z.string().default(""),
  format: z.string().min(1),
  genre: z.string().min(1),
  pageCount: z.number().int().nonnegative().default(0),
  isDiscoverable: z.boolean().default(false)
});

export type ProjectCreateRequest = z.infer<typeof ProjectCreateRequestSchema>;

export const ProjectCreateInternalSchema = ProjectCreateRequestSchema.extend({
  ownerUserId: z.string().min(1)
});

export type ProjectCreateInternal = z.infer<typeof ProjectCreateInternalSchema>;

export const ProjectUpdateRequestSchema = z.object({
  title: z.string().min(1).optional(),
  logline: z.string().optional(),
  synopsis: z.string().optional(),
  format: z.string().min(1).optional(),
  genre: z.string().min(1).optional(),
  pageCount: z.number().int().nonnegative().optional(),
  isDiscoverable: z.boolean().optional()
});

export type ProjectUpdateRequest = z.infer<typeof ProjectUpdateRequestSchema>;

export const ProjectFiltersSchema = z.object({
  ownerUserId: z.string().trim().min(1).optional(),
  genre: z.string().trim().min(1).optional(),
  format: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(100).default(30).optional(),
  offset: z.number().int().nonnegative().default(0).optional()
});

export type ProjectFilters = z.infer<typeof ProjectFiltersSchema>;

export const ProjectCoWriterSchema = z.object({
  projectId: z.string().min(1),
  ownerUserId: z.string().min(1),
  coWriterUserId: z.string().min(1),
  creditOrder: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true })
});

export type ProjectCoWriter = z.infer<typeof ProjectCoWriterSchema>;

export const ProjectCoWriterCreateRequestSchema = z.object({
  coWriterUserId: z.string().min(1),
  creditOrder: z.number().int().positive().default(1)
});

export type ProjectCoWriterCreateRequest = z.infer<typeof ProjectCoWriterCreateRequestSchema>;

export const DraftLifecycleStateSchema = z.enum(["active", "archived"]);

export type DraftLifecycleState = z.infer<typeof DraftLifecycleStateSchema>;

export const ProjectDraftSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  ownerUserId: z.string().min(1),
  scriptId: z.string().min(1),
  versionLabel: z.string().min(1),
  changeSummary: z.string().default(""),
  pageCount: z.number().int().nonnegative().default(0),
  lifecycleState: DraftLifecycleStateSchema,
  isPrimary: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type ProjectDraft = z.infer<typeof ProjectDraftSchema>;

export const ProjectDraftCreateRequestSchema = z.object({
  scriptId: z.string().min(1),
  versionLabel: z.string().min(1),
  changeSummary: z.string().max(4000).default(""),
  pageCount: z.number().int().nonnegative().default(0),
  setPrimary: z.boolean().default(true)
});

export type ProjectDraftCreateRequest = z.infer<typeof ProjectDraftCreateRequestSchema>;

export const ProjectDraftCreateInternalSchema = ProjectDraftCreateRequestSchema.extend({
  ownerUserId: z.string().min(1)
});

export type ProjectDraftCreateInternal = z.infer<typeof ProjectDraftCreateInternalSchema>;

export const ProjectDraftUpdateRequestSchema = z.object({
  versionLabel: z.string().min(1).optional(),
  changeSummary: z.string().max(4000).optional(),
  pageCount: z.number().int().nonnegative().optional(),
  lifecycleState: DraftLifecycleStateSchema.optional()
});

export type ProjectDraftUpdateRequest = z.infer<typeof ProjectDraftUpdateRequestSchema>;

export const ProjectDraftPrimaryRequestSchema = z.object({});

export type ProjectDraftPrimaryRequest = z.infer<typeof ProjectDraftPrimaryRequestSchema>;

export const ProjectDraftPrimaryInternalSchema = ProjectDraftPrimaryRequestSchema.extend({
  ownerUserId: z.string().min(1)
});

export type ProjectDraftPrimaryInternal = z.infer<typeof ProjectDraftPrimaryInternalSchema>;
