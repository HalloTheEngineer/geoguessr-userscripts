#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "./build-site.mjs";
import { listConfigs } from "./build-userscript.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, ".pages");

await fs.rm(OUTPUT, { recursive: true, force: true });
await fs.mkdir(OUTPUT, { recursive: true });
for (const config of await listConfigs()) {
  const source = path.join(config.dir, config.outfile);
  const target = path.join(OUTPUT, path.basename(config.outfile));
  await fs.copyFile(source, target);
  console.log(`Staged ${path.relative(ROOT, target)}`);
}

await buildSite();
