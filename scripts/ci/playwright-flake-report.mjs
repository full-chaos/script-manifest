import fs from "node:fs";
import path from "node:path";

const FAILING_STATUSES = new Set(["failed", "timedOut", "interrupted"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseQuarantineFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function normalizeForMatch(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("›", " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function walkSuites(suites, parentTitles, tests) {
  for (const suite of suites ?? []) {
    const chain = suite.title ? [...parentTitles, suite.title] : parentTitles;

    for (const spec of suite.specs ?? []) {
      for (const testCase of spec.tests ?? []) {
        tests.push({
          title: [...chain, spec.title].filter(Boolean).join(" › "),
          projectName: testCase.projectName ?? "",
          status: testCase.status,
          results: testCase.results ?? []
        });
      }
    }

    walkSuites(suite.suites ?? [], chain, tests);
  }
}

export function analyzePlaywrightReport(reportJson, quarantinePatterns = []) {
  const tests = [];
  walkSuites(reportJson.suites ?? [], [], tests);

  const summary = {
    total: tests.length,
    flaky: [],
    failed: [],
    quarantinedFlakes: []
  };

  for (const testCase of tests) {
    const statuses = testCase.results.map((result) => result.status);
    const hadFailure = statuses.some((status) => FAILING_STATUSES.has(status));
    const passed = statuses.includes("passed");
    const inferredFlaky = hadFailure && passed;
    const explicitFlaky = testCase.status === "flaky";

    const item = {
      title: testCase.title,
      projectName: testCase.projectName,
      statuses
    };

    if (inferredFlaky || explicitFlaky) {
      const normalizedCandidate = normalizeForMatch(
        `${testCase.projectName} ${testCase.title}`
      );
      const matchesQuarantine = quarantinePatterns.some((pattern) =>
        normalizedCandidate.includes(normalizeForMatch(pattern))
      );

      if (matchesQuarantine) {
        summary.quarantinedFlakes.push(item);
      } else {
        summary.flaky.push(item);
      }
      continue;
    }

    if (testCase.status === "unexpected" || hadFailure) {
      summary.failed.push(item);
    }
  }

  return summary;
}

function formatMarkdown(summary) {
  const lines = [
    "# Playwright Flake Summary",
    "",
    `- Total tests: ${summary.total}`,
    `- Flaky (non-quarantined): ${summary.flaky.length}`,
    `- Flaky (quarantined): ${summary.quarantinedFlakes.length}`,
    `- Failed: ${summary.failed.length}`,
    ""
  ];

  if (summary.flaky.length > 0) {
    lines.push("## Flaky Tests (Action Required)");
    for (const item of summary.flaky) {
      lines.push(`- [${item.projectName}] ${item.title} -> ${item.statuses.join(", ")}`);
    }
    lines.push("");
  }

  if (summary.quarantinedFlakes.length > 0) {
    lines.push("## Quarantined Flakes");
    for (const item of summary.quarantinedFlakes) {
      lines.push(`- [${item.projectName}] ${item.title} -> ${item.statuses.join(", ")}`);
    }
    lines.push("");
  }

  if (summary.failed.length > 0) {
    lines.push("## Failed Tests");
    for (const item of summary.failed) {
      lines.push(`- [${item.projectName}] ${item.title} -> ${item.statuses.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function parseArgs(argv) {
  const args = {
    input: ".artifacts/playwright-results.json",
    output: ".artifacts/playwright-flakes.json",
    markdown: ".artifacts/playwright-flakes.md",
    quarantineFile: "tests/e2e/quarantine.list"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--input" && next) {
      args.input = next;
      i += 1;
    } else if (arg === "--output" && next) {
      args.output = next;
      i += 1;
    } else if (arg === "--markdown" && next) {
      args.markdown = next;
      i += 1;
    } else if (arg === "--quarantine-file" && next) {
      args.quarantineFile = next;
      i += 1;
    }
  }

  return args;
}

export function runPlaywrightFlakeReport(cliArgs = process.argv.slice(2)) {
  const args = parseArgs(cliArgs);
  const report = readJson(args.input);
  const quarantinePatterns = parseQuarantineFile(args.quarantineFile);
  const summary = analyzePlaywrightReport(report, quarantinePatterns);

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(summary, null, 2));
  fs.writeFileSync(args.markdown, formatMarkdown(summary));

  console.log(`Flake summary written to ${args.output}`);
  console.log(`Flake markdown written to ${args.markdown}`);
}

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
  : false;

if (isDirectExecution) {
  runPlaywrightFlakeReport();
}
