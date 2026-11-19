import { hasDom } from "./window.js";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function injectStyle(id: string, css: string): HTMLStyleElement | null {
  if (!hasDom()) return null;
  const existing = document.getElementById(id);
  if (existing && existing.tagName === "STYLE") return existing as HTMLStyleElement;
  const root = document.head || document.documentElement;
  if (!root) {
    setTimeout(() => injectStyle(id, css), 20);
    return null;
  }
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  root.appendChild(style);
  return style;
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
