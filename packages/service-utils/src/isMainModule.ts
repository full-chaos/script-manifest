import { pathToFileURL } from "node:url";

/**
 * Detect whether the current module is the process entry point (ESM equivalent of require.main === module).
 * Usage: `if (isMainModule(import.meta.url)) { startServer(); }`
 */
export function isMainModule(metaUrl: string): boolean {
  if (!process.argv[1]) {
    return false;
  }
  return metaUrl === pathToFileURL(process.argv[1]).href;
}
