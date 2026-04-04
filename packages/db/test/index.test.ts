import assert from "node:assert/strict";
import test from "node:test";
import { closePool, getPool, toFtsPrefixQuery } from "../src/index.js";

test("getPool caches pool instances per connection string", async () => {
  const urlA = "postgresql://manifest:manifest@localhost:5432/manifest_a";
  const urlB = "postgresql://manifest:manifest@localhost:5432/manifest_b";

  const firstA = getPool(urlA);
  const secondA = getPool(urlA);
  const firstB = getPool(urlB);

  assert.equal(firstA, secondA);
  assert.notEqual(firstA, firstB);

  await closePool(urlA);
  const recreatedA = getPool(urlA);
  assert.notEqual(firstA, recreatedA);

  await closePool();
});

test("toFtsPrefixQuery converts words to prefix tsquery format", () => {
  assert.equal(toFtsPrefixQuery("screen"), "screen:*");
  assert.equal(toFtsPrefixQuery("drama fellowship"), "drama:* & fellowship:*");
  assert.equal(toFtsPrefixQuery("  screenplay  sprint  "), "screenplay:* & sprint:*");
  assert.equal(toFtsPrefixQuery(""), "");
  assert.equal(toFtsPrefixQuery("   "), "");
  assert.equal(toFtsPrefixQuery("sci-fi"), "sci-fi:*");
  assert.equal(toFtsPrefixQuery("@#$"), "");
});

test("closePool is safe for unknown connection strings and closes all pools", async () => {
  const url = "postgresql://manifest:manifest@localhost:5432/manifest_c";
  const original = getPool(url);

  await closePool("postgresql://manifest:manifest@localhost:5432/unknown_db");
  const stillCached = getPool(url);
  assert.equal(original, stillCached);

  await closePool();
  const recreated = getPool(url);
  assert.notEqual(original, recreated);

  await closePool();
});
