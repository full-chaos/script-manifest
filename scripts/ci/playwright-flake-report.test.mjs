import assert from "node:assert/strict";
import test from "node:test";

import { analyzePlaywrightReport } from "./playwright-flake-report.mjs";

test("analyzePlaywrightReport classifies flaky and failed tests", () => {
  const report = {
    suites: [
      {
        title: "chromium-desktop",
        specs: [
          {
            title: "home flow",
            tests: [
              {
                projectName: "chromium-desktop",
                status: "flaky",
                results: [{ status: "failed" }, { status: "passed" }]
              }
            ]
          },
          {
            title: "profile flow",
            tests: [
              {
                projectName: "chromium-desktop",
                status: "unexpected",
                results: [{ status: "failed" }]
              }
            ]
          }
        ]
      }
    ]
  };

  const summary = analyzePlaywrightReport(report, []);

  assert.equal(summary.total, 2);
  assert.equal(summary.flaky.length, 1);
  assert.equal(summary.failed.length, 1);
  assert.equal(summary.quarantinedFlakes.length, 0);
});

test("analyzePlaywrightReport respects quarantine patterns", () => {
  const report = {
    suites: [
      {
        title: "chromium-mobile",
        specs: [
          {
            title: "signin flow",
            tests: [
              {
                projectName: "chromium-mobile",
                status: "flaky",
                results: [{ status: "failed" }, { status: "passed" }]
              }
            ]
          }
        ]
      }
    ]
  };

  const summary = analyzePlaywrightReport(report, ["chromium-mobile signin flow"]);

  assert.equal(summary.flaky.length, 0);
  assert.equal(summary.quarantinedFlakes.length, 1);
});
