import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("docker workflow throttles matrix parallelism", () => {
  const workflow = readFile(".github/workflows/docker.yml");
  assert.match(workflow, /max-parallel:\s*4/);
});

test("service and frontend dockerfiles include npm retry guardrails", () => {
  const files = [
    "infra/docker/service.Dockerfile",
    "infra/docker/frontend.Dockerfile",
    "infra/docker/node-dev.Dockerfile"
  ];

  for (const file of files) {
    const dockerfile = readFile(file);
    assert.match(dockerfile, /NPM_CONFIG_FETCH_RETRIES=5/);
    assert.match(dockerfile, /for attempt in 1 2 3 4 5;/);
  }
});

test("service and frontend dockerfiles use cached pnpm installs with retries", () => {
  const files = [
    "infra/docker/service.Dockerfile",
    "infra/docker/frontend.Dockerfile"
  ];

  for (const file of files) {
    const dockerfile = readFile(file);
    assert.match(dockerfile, /--mount=type=cache,id=pnpm-store,target=\/pnpm\/store,sharing=locked/);
    assert.match(dockerfile, /--fetch-retries=5/);
    assert.match(dockerfile, /--prefer-offline/);
  }
});
