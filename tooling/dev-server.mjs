#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildUserscript, listConfigs, makeDevVersion } from "./build-userscript.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = path.join(ROOT, "packages");
const HOST = "127.0.0.1";
const PORT = Number(process.env.GG_DEV_PORT) || 8787;

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const allConfigs = await listConfigs();
const configs = requested.length
  ? allConfigs.filter((config) => requested.includes(config.name))
  : allConfigs;

if (!configs.length) {
  console.error(
    `No matching scripts. Available: ${allConfigs.map((config) => config.name).join(", ")}`,
  );
  process.exit(1);
}

const byFile = new Map(configs.map((config) => [path.basename(config.outfile), config]));
const outputs = new Map();
let building = false;
let pending = false;
let timer = null;

async function rebuild(reason) {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  try {
    const stamp = new Date();
    for (const config of configs) {
      const filename = path.basename(config.outfile);
      const result = await buildUserscript(config, {
        versionOverride: makeDevVersion(config.packageJson.version, stamp),
        updateUrlOverride: `http://${HOST}:${PORT}/${filename}`,
        write: false,
      });
      outputs.set(path.basename(config.outfile), result.output);
    }
    console.log(`[dev] rebuilt ${configs.map((config) => config.name).join(", ")} (${reason})`);
  } catch (error) {
    console.error(`[dev] build failed: ${error.message || error}`);
  } finally {
    building = false;
    if (pending) {
      pending = false;
      schedule("queued change");
    }
  }
}

function schedule(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => rebuild(reason), 120);
}

function watch(root) {
  try {
    fs.watch(root, { recursive: true }, (_event, filename) => {
      const name = String(filename || "");
      if (
        !name ||
        name.includes("node_modules") ||
        name.includes(`${path.sep}dist${path.sep}`) ||
        name.includes(".cache")
      )
        return;
      schedule(name);
    });
  } catch (error) {
    console.error(
      `[dev] watcher unavailable for ${path.relative(ROOT, root)}: ${error.message || error}`,
    );
  }
}

await rebuild("startup");
watch(PACKAGES);

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
  if (url.pathname === "/") {
    const rows = configs
      .map((config) => {
        const file = path.basename(config.outfile);
        return `<li><a href="/${file}">${config.name}</a> <small>${file}</small></li>`;
      })
      .join("");
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(
      `<!doctype html><meta charset="utf-8"><title>GeoGuessr userscripts</title><h1>GeoGuessr userscripts</h1><ul>${rows}</ul>`,
    );
    return;
  }

  const filename = path.basename(url.pathname);
  const config = byFile.get(filename);
  if (!config) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(
      `Unknown script. Available: ${configs.map((item) => path.basename(item.outfile)).join(", ")}\n`,
    );
    return;
  }
  try {
    const body = outputs.get(filename);
    if (!body) throw new Error("dev build is not ready yet");
    response.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(body),
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Build output unavailable: ${error.message || error}\n`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[dev] serving ${configs.map((config) => path.basename(config.outfile)).join(", ")}`);
  console.log(`[dev] open http://${HOST}:${PORT}/ then install or update the userscript URL`);
});
