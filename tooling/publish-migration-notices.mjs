#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listConfigs, loadRepoConfig } from "./build-userscript.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = [
  { id: "5359dc6c14186c8abcc4e262ac9d5276", file: "geoguessr-adblocker.user.js" },
  { id: "c3adcee6d281d12199e7b3ebc6c489c9", file: "geoguessr-match-notifier.user.js" },
  { id: "30e6ab630a8a06d5ce16cc54454a4f8b", file: "geoguessr-persistent-game-summary.user.js" },
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const confirm = args.includes("--confirm-pages-live");
if (!dryRun && !confirm) {
  console.error("Refusing to modify gists without --confirm-pages-live or --dry-run.");
  process.exit(1);
}

const [configs, repo] = await Promise.all([listConfigs(), loadRepoConfig()]);
const pagesUrl = repo.pagesUrl.replace(/\/$/, "");

async function check(url) {
  const response = await fetch(url, { method: "HEAD", redirect: "follow" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
}

if (confirm) {
  await check(`${pagesUrl}/`);
  for (const config of configs) {
    const filenames = [
      config.publish.filename || path.basename(config.outfile),
      ...(config.publish.compatibilityFilenames || []),
    ];
    for (const filename of filenames) await check(`${pagesUrl}/${filename}`);
  }
  await check(`${pagesUrl}/previews/geosurfer/01.webp`);
  console.log("Pages and artifact URLs are live.");
}

for (const legacy of SOURCES) {
  const artifact = path.join(ROOT, "migration", legacy.file);
  await fs.access(artifact);
  console.log(`${legacy.file}: gist ${legacy.id}${dryRun ? " (dry run)" : ""}`);
  if (!dryRun) {
    execFileSync("gh", ["gist", "edit", legacy.id, "--filename", legacy.file, artifact], {
      stdio: "inherit",
    });
  }
}
console.log(dryRun ? "Dry run complete" : "Migration notices published");
