import { z, type ZodTypeAny } from "zod";

export const ApiErrorSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
  details: z.unknown().optional()
});

export const UnauthorizedErrorSchema = z.object({
  error: z.literal("unauthorized"),
  detail: z.string().optional()
});

export function toOpenApiSchema(schema: ZodTypeAny): Record<string, unknown> {
  const converted = z.toJSONSchema(schema) as Record<string, unknown>;
  // Remove $schema property — Fastify/AJV doesn't expect it in route schemas
  delete converted.$schema;
  return converted;
}
