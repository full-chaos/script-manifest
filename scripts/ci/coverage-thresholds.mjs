import fs from "node:fs";
import path from "node:path";

const METRICS = ["lines", "functions", "statements", "branches"];

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function roundDown(value) {
  return Math.floor(value * 100) / 100;
}

export function extractCoverageMetrics(summaryJson) {
  const total = summaryJson?.total;
  if (!total || typeof total !== "object") {
    throw new Error("Coverage summary is missing a 'total' section.");
  }

  const metrics = {};
  for (const metric of METRICS) {
    const pct = total?.[metric]?.pct;
    if (typeof pct !== "number") {
      throw new Error(`Coverage summary is missing total.${metric}.pct`);
    }
    metrics[metric] = roundDown(pct);
  }

  return metrics;
}

export function evaluateCoverageThresholds({ baseline, actual }) {
  const failures = [];
  const ratchet = {};

  for (const scope of ["services", "web"]) {
    ratchet[scope] = {};
    const scopeBaseline = baseline?.[scope] ?? {};
    const scopeActual = actual?.[scope] ?? {};

    for (const metric of METRICS) {
      const expected = Number(scopeBaseline?.[metric] ?? 0);
      const observed = Number(scopeActual?.[metric] ?? 0);
      ratchet[scope][metric] = roundDown(Math.max(expected, observed));

      if (observed < expected) {
        failures.push({
          scope,
          metric,
          expected,
          observed
        });
      }
    }
  }

  return { failures, ratchet };
}

function parseArgs(argv) {
  const args = {
    baseline: ".github/coverage-thresholds.json",
    servicesSummary: ".coverage/services/coverage-summary.json",
    webSummary: "apps/writer-web/coverage/coverage-summary.json",
    ratchetOut: ".artifacts/coverage-thresholds-ratchet.json"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--baseline" && next) {
      args.baseline = next;
      i += 1;
    } else if (arg === "--services-summary" && next) {
      args.servicesSummary = next;
      i += 1;
    } else if (arg === "--web-summary" && next) {
      args.webSummary = next;
      i += 1;
    } else if (arg === "--ratchet-out" && next) {
      args.ratchetOut = next;
      i += 1;
    }
  }

  return args;
}

export function runCoverageThresholdCheck(cliArgs = process.argv.slice(2)) {
  const args = parseArgs(cliArgs);

  const baseline = readJson(args.baseline);
  const servicesSummary = readJson(args.servicesSummary);
  const webSummary = readJson(args.webSummary);

  const actual = {
    services: extractCoverageMetrics(servicesSummary),
    web: extractCoverageMetrics(webSummary)
  };

  const result = evaluateCoverageThresholds({ baseline, actual });

  fs.mkdirSync(path.dirname(args.ratchetOut), { recursive: true });
  fs.writeFileSync(args.ratchetOut, JSON.stringify(result.ratchet, null, 2));

  console.log("Coverage baseline check");
  console.log(JSON.stringify({ actual, baseline, failures: result.failures }, null, 2));
  console.log(`Ratchet suggestion written to ${args.ratchetOut}`);

  if (result.failures.length > 0) {
    console.error("Coverage threshold regressions detected:");
    for (const failure of result.failures) {
      console.error(
        `- ${failure.scope}.${failure.metric}: expected >= ${failure.expected}, observed ${failure.observed}`
      );
    }
    process.exitCode = 1;
  }
}

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
  : false;

if (isDirectExecution) {
  runCoverageThresholdCheck();
}
