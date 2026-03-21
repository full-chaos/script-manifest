import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { ApiErrorSchema, UnauthorizedErrorSchema, toOpenApiSchema } from "./openapi.js";

test("toOpenApiSchema converts zod schema and removes $schema metadata", () => {
  const schema = toOpenApiSchema(
    z.object({
      name: z.string(),
      count: z.number().int().nonnegative().optional()
    })
  );

  assert.equal("$schema" in schema, false);
  assert.equal((schema.type as string | undefined) ?? "", "object");

  const properties = schema.properties as Record<string, { type?: string }> | undefined;
  assert.equal(properties?.name?.type, "string");
  assert.equal(properties?.count?.type, "integer");
});

test("error schemas validate expected payload shapes", () => {
  const apiError = ApiErrorSchema.safeParse({
    error: "invalid_payload",
    detail: "missing fields"
  });
  assert.equal(apiError.success, true);

  const unauthorized = UnauthorizedErrorSchema.safeParse({
    error: "unauthorized",
    detail: "missing token"
  });
  assert.equal(unauthorized.success, true);
});
