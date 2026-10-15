#!/usr/bin/env node
/**
 * Contract check (REST cheatsheet: "fail the build on undocumented endpoints"):
 * every route coded in src/app/api/v1 must be in openapi.yaml, and the other way round.
 *   npm run contract:check
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const API_DIR = join(ROOT, "src/app/api/v1");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
// Path parameters are compared by position only: [id] in the code ↔ {spotId} in the contract.
const normalize = (path) => path.replace(/\{[^}]+\}|\[[^\]]+\]/g, "{}");

function* routeFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* routeFiles(full);
    else if (name === "route.ts") yield full;
  }
}

const coded = new Set();
for (const file of routeFiles(API_DIR)) {
  const path = "/" + relative(API_DIR, file).split(sep).slice(0, -1).join("/");
  const src = readFileSync(file, "utf8");
  for (const m of METHODS) if (new RegExp(`export const ${m}\\b`).test(src)) coded.add(`${m} ${normalize(path)}`);
}

const documented = new Set();
let current = null;
for (const line of readFileSync(join(ROOT, "openapi.yaml"), "utf8").split("\n")) {
  if (/^components:/.test(line)) break;
  const path = line.match(/^ {2}(\/[^:]*):\s*$/);
  if (path) current = normalize(path[1]);
  const method = line.match(/^ {4}(get|post|put|patch|delete):/);
  if (method && current) documented.add(`${method[1].toUpperCase()} ${current}`);
}

const undocumented = [...coded].filter((r) => !documented.has(r));
const missing = [...documented].filter((r) => !coded.has(r));
for (const r of undocumented) console.log(`✘ coded but not in openapi.yaml: ${r}`);
for (const r of missing) console.log(`✘ in openapi.yaml but not coded: ${r}`);
if (undocumented.length || missing.length) process.exit(1);
console.log(`✔ Contract and code match: ${coded.size} operations.`);
