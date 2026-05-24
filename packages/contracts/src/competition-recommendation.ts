import { z } from "zod";
import { CompetitionSchema } from "./competition.js";

export const CompetitionRecommendationReasonSchema = z.object({
  factor: z.string().min(1),
  contribution: z.number(),
  description: z.string().min(1)
});

export type CompetitionRecommendationReason = z.infer<typeof CompetitionRecommendationReasonSchema>;

export const CompetitionRecommendationSchema = z.object({
  competition: CompetitionSchema,
  score: z.number().min(0).max(100),
  reasons: z.array(CompetitionRecommendationReasonSchema),
  isPinned: z.boolean(),
  isDismissed: z.boolean()
});

export type CompetitionRecommendation = z.infer<typeof CompetitionRecommendationSchema>;

export const RecommendationsResponseSchema = z.object({
  projectId: z.string().min(1),
  recommendations: z.array(CompetitionRecommendationSchema)
});

export type RecommendationsResponse = z.infer<typeof RecommendationsResponseSchema>;
