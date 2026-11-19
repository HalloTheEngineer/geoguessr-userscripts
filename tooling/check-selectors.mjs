#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = path.join(ROOT, "packages");
const EXTENSIONS = new Set([".js", ".ts", ".mjs"]);
const ALLOW = [
  /__VERSION__/g,
  /__UPDATE_URL__/g,
  /__DOWNLOAD_URL__/g,
  /__NEXT_DATA__/g,
  /__GG_[A-Z_]+__/g,
  /__reactFiber\$/g,
  /__reactInternalInstance\$/g,
];
const HASH = /__[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*/g;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".cache" ||
      entry.name === "tests" ||
      entry.name === "fixtures"
    )
      continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (EXTENSIONS.has(path.extname(entry.name)) && !entry.name.endsWith(".generated.js"))
      files.push(full);
  }
  return files;
}

function findHashes(text) {
  const matches = [];
  for (const match of text.matchAll(HASH)) {
    const value = match[0];
    if (ALLOW.some((pattern) => new RegExp(pattern.source).test(value))) continue;
    matches.push({ value, index: match.index || 0 });
  }
  return matches;
}

const files = await walk(PACKAGES);
let failures = 0;
for (const file of files) {
  const text = await fs.readFile(file, "utf8");
  const lines = text.split("\n");
  for (const [lineIndex, line] of lines.entries()) {
    if (!/class|className|querySelector|matches|closest|\.[A-Za-z][\w-]*__/.test(line)) continue;
    const hashes = findHashes(line);
    if (!hashes.length) continue;
    failures++;
    console.error(
      `${path.relative(ROOT, file)}:${lineIndex + 1}: hardcoded hashed class ${hashes[0].value}; use a prefix selector or gg-kit`,
    );
  }
}
if (failures) {
  console.error(`Found ${failures} hardcoded hashed class reference(s).`);
  process.exitCode = 1;
} else {
  console.log("No hardcoded hashed class selectors found");
}
