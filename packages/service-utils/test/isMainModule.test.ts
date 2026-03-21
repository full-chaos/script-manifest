import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { isMainModule } from "../src/isMainModule.js";

describe("isMainModule", () => {
  let originalArgv1: string | undefined;

  beforeEach(() => {
    originalArgv1 = process.argv[1];
  });

  afterEach(() => {
    if (originalArgv1 === undefined) {
      delete (process.argv as unknown[])[1];
    } else {
      process.argv[1] = originalArgv1;
    }
  });

  it("returns true when metaUrl matches process.argv[1]", () => {
    const testPath = "/tmp/test-entry.ts";
    process.argv[1] = testPath;
    const metaUrl = pathToFileURL(testPath).href;
    assert.ok(isMainModule(metaUrl));
  });

  it("returns false when metaUrl does not match process.argv[1]", () => {
    process.argv[1] = "/tmp/entry.ts";
    const metaUrl = pathToFileURL("/tmp/other-file.ts").href;
    assert.ok(!isMainModule(metaUrl));
  });

  it("returns false when process.argv[1] is undefined", () => {
    delete (process.argv as unknown[])[1];
    assert.ok(!isMainModule("file:///tmp/anything.ts"));
  });

  it("handles file URLs correctly", () => {
    const testPath = "/home/user/project/src/index.ts";
    process.argv[1] = testPath;
    assert.ok(isMainModule(pathToFileURL(testPath).href));
  });
});
