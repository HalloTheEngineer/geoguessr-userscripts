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

function row(config, repo, artifactVersion, index, previews) {
  const site = config.site || {};
  const title = site.displayName || config.name;
  const filename = path.basename(config.outfile);
  const repoUrl = repo.repoUrl || `https://github.com/${repo.owner}/${repo.repo}`;
  const sourceUrl = `${repoUrl}/tree/main/packages/${config.name}`;
  const features = (site.features || [])
    .map((feature) => `<li>${escapeHtml(feature)}</li>`)
    .join("");
  const gallery = previews.length
    ? `<div class="previewGrid">${previews
        .map(
          (preview) =>
            `<button class="previewThumb" type="button" data-full="${escapeHtml(preview.src)}" data-alt="${escapeHtml(preview.alt || title)}"><img src="${escapeHtml(preview.src)}" alt="${escapeHtml(preview.alt || title)}" loading="lazy" decoding="async" /></button>`,
        )
        .join("")}</div>`
    : `<div class="previewEmpty">Preview coming soon</div>`;
  const legacyAnchors = (site.legacyAnchors || [])
    .map((anchor) => `<span id="${escapeHtml(anchor)}" class="legacyAnchor" hidden></span>`)
    .join("");
  return `${legacyAnchors}
    <article class="scriptRow" id="${escapeHtml(site.anchor || config.name)}" style="--accent: ${escapeHtml(site.accent || "#5b3df5")}">
      <div class="scriptIndex">${String(index + 1).padStart(2, "0")}</div>
      <div class="scriptInfo">
        <h3>${escapeHtml(title)}</h3>
        <p class="scriptSummary">${escapeHtml(site.summary || config.packageJson.description || "")}</p>
        <ul class="scriptTags">${features}</ul>
        <div class="scriptMeta">v${escapeHtml(artifactVersion || config.packageJson.version)}</div>
      </div>
      <div class="scriptPreview">${gallery}</div>
      <div class="scriptActions">
        <a class="button buttonPrimary" href="${escapeHtml(filename)}">Install</a>
        <a class="sourceLink" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Source</a>
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
  const resolvedPreviews = new Map();
  for (const config of visible) {
    if (config.site?.previews) {
      resolvedPreviews.set(config.name, config.site.previews);
      continue;
    }
    const dir = path.join(ROOT, "assets", "previews", config.name);
    let files = [];
    try {
      files = (await fs.readdir(dir))
        .filter((file) => /\.(webp|png|jpe?g|avif)$/i.test(file))
        .sort();
    } catch {
      // No preview directory.
    }
    resolvedPreviews.set(
      config.name,
      files.map((file, index) => ({
        src: `previews/${config.name}/${file}`,
        alt: `${config.site?.displayName || config.name} preview ${index + 1}`,
      })),
    );
  }
  const rows = visible
    .map((config, index) =>
      row(config, repo, artifactVersion, index, resolvedPreviews.get(config.name) || []),
    )
    .join("\n");
  const html = template
    .replaceAll("{{ROWS}}", rows)
    .replaceAll(
      "{{REPO_URL}}",
      escapeHtml(repo.repoUrl || `https://github.com/${repo.owner}/${repo.repo}`),
    )
    .replaceAll("{{SCRIPT_COUNT}}", String(visible.length));
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, "index.html"), html);
  await fs.writeFile(path.join(OUT, "styles.css"), styles);
  await fs.copyFile(path.join(SITE, "app.js"), path.join(OUT, "app.js"));
  for (const config of visible) {
    for (const preview of resolvedPreviews.get(config.name) || []) {
      const previewSource = path.join(ROOT, "assets", preview.src);
      const previewTarget = path.join(OUT, preview.src);
      await fs.mkdir(path.dirname(previewTarget), { recursive: true });
      try {
        await fs.copyFile(previewSource, previewTarget);
      } catch {
        // Preview is optional.
      }
    }
  }
  console.log(
    `Built ${path.relative(ROOT, path.join(OUT, "index.html"))} (${visible.length} scripts)`,
  );
  return { html, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  buildSite().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
