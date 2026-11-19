#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listConfigs, loadRepoConfig } from "./build-userscript.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const OUT = path.join(ROOT, ".pages");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function monogram(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function card(config, repo, artifactVersion) {
  const site = config.site || {};
  const title = site.displayName || config.name;
  const filename = path.basename(config.outfile);
  const sourceUrl = `${repo.repoUrl}/tree/main/packages/${config.name}`;
  const features = (site.features || [])
    .map((feature) => `<li>${escapeHtml(feature)}</li>`)
    .join("");
  const poster = site.poster
    ? `<img class="poster" src="${escapeHtml(site.poster)}" alt="" loading="lazy" decoding="async" />`
    : "";
  return `
    <article class="card${site.poster ? " cardPoster" : ""}" id="${escapeHtml(site.anchor || config.name)}" style="--accent: ${escapeHtml(site.accent || "#7952e9")}">
      <div class="cardHeader">
        <span class="monogram">${escapeHtml(monogram(title))}</span>
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p class="cardSummary">${escapeHtml(site.summary || config.packageJson.description || "")}</p>
        </div>
      </div>
      ${poster}
      <ul class="features">${features}</ul>
      <div class="cardFooter">
        <span class="version">v${escapeHtml(artifactVersion || config.packageJson.version)}</span>
        <div class="cardActions">
          <a class="sourceLink" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Source</a>
          <a class="installLink" href="${escapeHtml(filename)}">Install</a>
        </div>
      </div>
    </article>`;
}

export async function buildSite() {
  const [template, styles, configs, repo] = await Promise.all([
    fs.readFile(path.join(SITE, "index.template.html"), "utf8"),
    fs.readFile(path.join(SITE, "styles.css"), "utf8"),
    listConfigs(),
    loadRepoConfig(),
  ]);
  const visible = configs
    .filter((config) => config.site)
    .sort((left, right) => (left.site.order || 0) - (right.site.order || 0));
  const artifactVersion = process.env.ARTIFACT_VERSION || "";
  const cards = visible.map((config) => card(config, repo, artifactVersion)).join("\n");
  const html = template
    .replaceAll("{{CARDS}}", cards)
    .replaceAll(
      "{{REPO_URL}}",
      escapeHtml(repo.repoUrl || `https://github.com/${repo.owner}/${repo.repo}`),
    )
    .replaceAll("{{SCRIPT_COUNT}}", String(visible.length));
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, "index.html"), html);
  await fs.writeFile(path.join(OUT, "styles.css"), styles);
  for (const config of visible) {
    if (!config.site?.poster) continue;
    const source = path.join(ROOT, "assets", "geosurfer", "poster.webp");
    try {
      await fs.copyFile(source, path.join(OUT, config.site.poster));
    } catch {
      // Poster is optional.
    }
  }
  console.log(
    `Built ${path.relative(ROOT, path.join(OUT, "index.html"))} (${visible.length} scripts)`,
  );
  return { html, cards };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  buildSite().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
