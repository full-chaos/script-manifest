import { z } from "zod";
import { CompetitionSchema } from "./competition.js";

export const ReminderConfigSchema = z.object({
  remindDaysBefore: z.array(z.number().int().positive()).min(1).max(10).default([14, 7, 1])
});

export type ReminderConfig = z.infer<typeof ReminderConfigSchema>;

export const SaveCompetitionRequestSchema = z.object({
  writerId: z.string().min(1),
  remindDaysBefore: z.array(z.number().int().positive()).min(1).max(10).optional()
});

export type SaveCompetitionRequest = z.infer<typeof SaveCompetitionRequestSchema>;

export const SavedCompetitionSchema = z.object({
  writerId: z.string().min(1),
  competitionId: z.string().min(1),
  savedAt: z.string().datetime({ offset: true }),
  remindDaysBefore: z.array(z.number().int().positive()),
  competition: CompetitionSchema.optional()
});

export type SavedCompetition = z.infer<typeof SavedCompetitionSchema>;

export const SavedCompetitionsResponseSchema = z.object({
  savedCompetitions: z.array(SavedCompetitionSchema)
});

export type SavedCompetitionsResponse = z.infer<typeof SavedCompetitionsResponseSchema>;
