import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCoverageThresholds,
  extractCoverageMetrics
} from "./coverage-thresholds.mjs";

test("extractCoverageMetrics returns rounded metrics", () => {
  const metrics = extractCoverageMetrics({
    total: {
      lines: { pct: 83.279 },
      functions: { pct: 72.019 },
      statements: { pct: 81.999 },
      branches: { pct: 64.559 }
    }
  });

  assert.deepEqual(metrics, {
    lines: 83.27,
    functions: 72.01,
    statements: 81.99,
    branches: 64.55
  });
});

test("evaluateCoverageThresholds reports regressions and ratchet values", () => {
  const result = evaluateCoverageThresholds({
    baseline: {
      services: { lines: 60, functions: 60, statements: 60, branches: 40 },
      web: { lines: 70, functions: 70, statements: 70, branches: 70 }
    },
    actual: {
      services: { lines: 58, functions: 62, statements: 61, branches: 38 },
      web: { lines: 74, functions: 69, statements: 71, branches: 74 }
    }
  });

  assert.equal(result.failures.length, 3);
  assert.deepEqual(result.failures.map((item) => `${item.scope}.${item.metric}`).sort(), [
    "services.branches",
    "services.lines",
    "web.functions"
  ]);

  assert.deepEqual(result.ratchet, {
    services: { lines: 60, functions: 62, statements: 61, branches: 40 },
    web: { lines: 74, functions: 70, statements: 71, branches: 74 }
  });
});
