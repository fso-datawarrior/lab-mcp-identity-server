/**
 * Claude Desktop launcher: pins cwd to the repo root so data/audit.jsonl and
 * data/pending resolve inside the repo (same store as pnpm approve/deny).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repoRoot);
process.env.OKTA_CLIENT_MODE ??= "real";
await import(new URL("../dist/index.js", import.meta.url).href);
