#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = path.join(ROOT, "packages");

export function makeDevVersion(version, stamp = new Date()) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  const date = stamp instanceof Date ? stamp : new Date(stamp);
  const timestamp = date
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  if (!match) return `0.0.1-dev.${timestamp}`;
  const patch = Number(match[3]) + 1;
  return `${match[1]}.${match[2]}.${patch}-dev.${timestamp}`;
}

export async function loadRepoConfig() {
  return JSON.parse(await fs.readFile(path.join(ROOT, "repo.config.json"), "utf8"));
}

export async function loadConfig(name) {
  const dir = path.join(PACKAGES, name);
  const configPath = path.join(dir, "userscript.config.mjs");
  const config = (await import(pathToFileURL(configPath).href)).default;
  const packageJson = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));
  return { ...config, dir, packageJson, name: config.name || packageJson.name };
}

export async function listConfigs() {
  const entries = await fs.readdir(PACKAGES, { withFileTypes: true });
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await fs.access(path.join(PACKAGES, entry.name, "userscript.config.mjs"));
      names.push(entry.name);
    } catch {
      // not a userscript package
    }
  }
  return Promise.all(names.map((name) => loadConfig(name)));
}

function withVersion(url, version) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

function renderMeta(
  metaTemplate,
  { version, publish, filename, repo, resource, webRequest, updateUrlOverride = "" },
) {
  const pagesUrl = repo?.pagesUrl || "";
  const updateUrl =
    updateUrlOverride ||
    publish?.updateUrl ||
    (pagesUrl ? `${pagesUrl}/${publish?.filename || filename}` : "");
  const resourceLines = resource
    ? `// @resource ${resource.name} ${withVersion(resource.url, version)}`
    : "";
  const webRequestLines = (webRequest || [])
    .map((rule) => `// @webRequest ${JSON.stringify(rule)}`)
    .join("\n");
  let meta = metaTemplate
    .replaceAll("__VERSION__", version)
    .replaceAll("__UPDATE_URL__", updateUrl)
    .replaceAll("__DOWNLOAD_URL__", updateUrl)
    .replaceAll("__RESOURCE_LINES__", resourceLines)
    .replaceAll("__WEBREQUEST_LINES__", webRequestLines);
  if (!updateUrl) {
    meta = meta
      .split("\n")
      .filter((line) => !/^\/\/ @(updateURL|downloadURL)\s+$/.test(line))
      .join("\n");
  }
  meta = meta
    .split("\n")
    .filter((line) => !/^\/\/ @(resource|webRequest)\s+$/.test(line))
    .join("\n");
  return `${meta.trimEnd()}\n`;
}

function validateMeta(meta, config) {
  const required = ["@name", "@version", "@match", "@run-at", "@grant"];
  for (const key of required) {
    if (!new RegExp(`^// ${key}\\s+`, "m").test(meta)) {
      throw new Error(`${config.name}: metadata is missing ${key}`);
    }
  }
  if (/__[A-Z_]+__/.test(meta)) {
    throw new Error(`${config.name}: metadata still contains unresolved placeholders`);
  }
  if (!/^\/\/ @name\s+GeoGuessr Toolkit: /m.test(meta)) {
    throw new Error(`${config.name}: @name must start with "GeoGuessr Toolkit: "`);
  }
  if (!/^\/\/ @version\s+\d{4}\.\d{1,2}\.\d{1,2}(?:\.\d+)?$/m.test(meta)) {
    throw new Error(`${config.name}: @version must use YYYY.MM.DD[.run]`);
  }
  for (const key of ["@author", "@license", "@homepageURL", "@supportURL", "@icon"]) {
    if (!new RegExp(`^// ${key}\\s+`, "m").test(meta)) {
      throw new Error(`${config.name}: metadata is missing ${key}`);
    }
  }
  if (config.noframes && !/^\/\/ @noframes$/m.test(meta)) {
    throw new Error(`${config.name}: metadata is missing @noframes`);
  }
  if (config.publish && !/^\/\/ @updateURL\s+https:\/\//m.test(meta)) {
    throw new Error(`${config.name}: metadata is missing a publish URL`);
  }
  if (/^\/\/ @require\s+/m.test(meta)) {
    throw new Error(`${config.name}: runtime @require dependencies are not allowed`);
  }
  if (!/^\/\/ ==UserScript==/m.test(meta) || !/^\/\/ ==\/UserScript==/m.test(meta)) {
    throw new Error(`${config.name}: metadata block is malformed`);
  }
}

export async function buildUserscript(
  config,
  {
    check = false,
    minify = false,
    versionOverride = null,
    updateUrlOverride = "",
    write = true,
  } = {},
) {
  const version = versionOverride || config.packageJson.version;
  const repo = await loadRepoConfig();
  const metaTemplate = await fs.readFile(path.join(config.dir, config.meta), "utf8");
  const outfile = path.join(config.dir, config.outfile);
  const filename = path.basename(outfile);
  const resource = config.resource ? { ...config.resource } : null;
  const meta = renderMeta(metaTemplate, {
    version,
    publish: config.publish,
    filename: config.publish?.filename || filename,
    repo,
    resource,
    webRequest: config.webRequest,
    updateUrlOverride,
  });
  validateMeta(meta, config);

  const define = {};
  if (config.versionDefine) define[config.versionDefine] = JSON.stringify(version);
  if (config.resourceUrlDefine && resource) {
    define[config.resourceUrlDefine] = JSON.stringify(withVersion(resource.url, version));
  }

  const result = await build({
    absWorkingDir: config.dir,
    entryPoints: [path.join(config.dir, config.entry)],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["chrome100", "firefox100", "safari15"],
    charset: "utf8",
    legalComments: "none",
    sourcemap: false,
    minify,
    define,
    banner: { js: meta },
    logLevel: "silent",
  });

  const output = `${result.outputFiles[0].text.trimEnd()}\n`;
  if (config.sizeBudget && output.length > config.sizeBudget) {
    throw new Error(
      `${config.name}: bundle is ${output.length} bytes, over the ${config.sizeBudget} byte budget`,
    );
  }

  if (check) {
    let current = "";
    try {
      current = await fs.readFile(outfile, "utf8");
    } catch {
      throw new Error(`${path.relative(ROOT, outfile)} is missing; run npm run build`);
    }
    if (current !== output) {
      throw new Error(`${path.relative(ROOT, outfile)} is out of date; run npm run build`);
    }
    console.log(`${path.relative(ROOT, outfile)} is up to date`);
    return { output, outfile };
  }

  if (write) {
    await fs.mkdir(path.dirname(outfile), { recursive: true });
    const temporary = `${outfile}.${process.pid}.tmp`;
    await fs.writeFile(temporary, output);
    await fs.rename(temporary, outfile);
    console.log(`Built ${path.relative(ROOT, outfile)} (${output.length} bytes)`);
  }
  return { output, outfile };
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const minify = args.includes("--minify");
  const all = args.includes("--all");
  const versionIndex = args.indexOf("--version-override");
  const versionOverride =
    versionIndex >= 0 ? args[versionIndex + 1] : process.env.ARTIFACT_VERSION || null;
  const consumed = new Set(versionIndex >= 0 ? [versionIndex, versionIndex + 1] : []);
  const names = args.filter((arg, index) => !arg.startsWith("--") && !consumed.has(index));

  const configs =
    all || names.length === 0 ? await listConfigs() : await Promise.all(names.map(loadConfig));
  if (!configs.length) throw new Error("No userscript packages found");

  const results = await Promise.allSettled(
    configs.map((config) => buildUserscript(config, { check, minify, versionOverride })),
  );
  let failed = false;
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      failed = true;
      console.error(`${configs[index].name}: ${result.reason?.message || result.reason}`);
    }
  }
  if (failed) process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
