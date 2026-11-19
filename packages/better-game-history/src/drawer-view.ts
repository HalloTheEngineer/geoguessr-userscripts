import { escapeHtml, injectStyle } from "gg-kit";
import { formatDate, formatRatingChange, isFiniteNumber } from "./format.js";
import type { GameRecord } from "./types.js";

const STYLE_ID = "bgh-history-styles";

const STYLES = `
#bgh-history-drawer-root {
  position: fixed; inset: 0 auto 0 0; z-index: 10000; display: flex; align-items: center;
  pointer-events: none; font-family: var(--font-neo-sans, sans-serif); color: #fff;
}
#bgh-history-drawer {
  position: relative; z-index: 1;
  width: min(400px, 92vw); height: 100%; display: flex; flex-direction: column;
  background: rgba(18, 18, 35, 0.94); border-right: 1px solid rgba(255,255,255,.15);
  box-shadow: 20px 0 60px rgba(0,0,0,.4); backdrop-filter: blur(30px);
  transform: translateX(-100%); transition: transform .35s cubic-bezier(.16,1,.3,1);
  pointer-events: auto; overflow: hidden;
}
#bgh-history-drawer-root.bgh-open #bgh-history-drawer { transform: translateX(0); }
#bgh-drawer-trigger-tab {
  position: fixed; left: 0; top: 50%; transform: translateY(-50%); z-index: 0;
  width: 30px; height: 120px; padding: 0; border: 1px solid rgba(255,255,255,.2); border-left: 0;
  border-radius: 0 16px 16px 0; background: rgba(121,82,233,.3); color: #fff;
  cursor: pointer; font-size: 24px; line-height: 1; pointer-events: auto;
}
#bgh-drawer-trigger-tab:hover { background: rgba(121,82,233,.55); }
#bgh-drawer-trigger-tab:focus-visible { outline: 2px solid #bca7ff; outline-offset: 2px; }
#bgh-history-drawer-header {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 24px 20px; background: rgba(255,255,255,.06); border-bottom: 1px solid rgba(255,255,255,.1);
}
#bgh-history-drawer-header h2 { margin: 0; font-size: 16px; letter-spacing: .08em; text-transform: uppercase; }
#bgh-show-graph {
  border: 0; border-radius: 10px; padding: 8px 14px; background: #7952e9; color: #fff;
  cursor: pointer; font-size: 11px; font-weight: 800; letter-spacing: .06em;
}
#bgh-history-scroll-area { flex: 1; overflow-y: auto; padding: 18px; scrollbar-width: thin; }
.bgh-history-row {
  display: block; width: 100%; padding: 16px; margin: 0 0 14px; border-radius: 16px;
  border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.04); color: #fff;
  text-align: left; cursor: pointer; transition: background .2s, border-color .2s, transform .2s;
}
.bgh-history-row:hover, .bgh-history-row:focus-visible { background: rgba(255,255,255,.09); border-color: rgba(188,167,255,.5); outline: none; }
.bgh-history-row.bgh-active { background: rgba(121,82,233,.35); border-color: #b094ff; }
.bgh-history-row-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.bgh-history-mode { padding: 4px 9px; border-radius: 6px; background: rgba(0,0,0,.35); font-size: 9px; font-weight: 900; letter-spacing: .05em; }
.bgh-history-result { font-size: 10px; font-weight: 900; }
.bgh-history-result.bgh-win { color: #4caf50; }
.bgh-history-result.bgh-loss { color: #ff5252; }
.bgh-history-change { font-size: 13px; font-weight: 900; }
.bgh-history-row-bottom { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.bgh-history-opponent { max-width: 230px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #fff; font-size: 16px; font-weight: 800; text-decoration: none; }
a.bgh-history-opponent:hover { text-decoration: underline; }
.bgh-history-date { flex: 0 0 auto; color: rgba(255,255,255,.5); font-size: 10px; }
.bgh-history-pending { color: rgba(255,255,255,.55); font-style: italic; }
.bgh-history-empty { padding: 30px 10px; color: rgba(255,255,255,.6); text-align: center; line-height: 1.5; }
`;

export interface DrawerViewOptions {
  onGraph: () => void;
  onOpenGame: (record: Pick<GameRecord, "gameId" | "isTeamDuel">) => void;
  nameFor: (playerId: string | undefined, fallback?: string) => string;
}

export interface DrawerView {
  render(records: readonly GameRecord[], activeGameId: string | null): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

function kindLabel(record: GameRecord): string {
  return `${record.isTeamDuel ? "TEAM " : ""}${record.mode}`;
}

function rowSignature(
  record: GameRecord,
  active: boolean,
  nameFor: DrawerViewOptions["nameFor"],
): string {
  return [
    record.gameId,
    record.time,
    record.mode,
    record.isTeamDuel ? "1" : "0",
    nameFor(record.opponentId, record.opponent),
    record.opponentId || "",
    record.win === undefined ? "" : record.win ? "1" : "0",
    record.ratingChange === undefined ? "" : String(record.ratingChange),
    record.hydration.state,
    active ? "1" : "0",
  ].join("|");
}

function rowHtml(
  record: GameRecord,
  active: boolean,
  nameFor: DrawerViewOptions["nameFor"],
): string {
  const opponent = nameFor(record.opponentId, record.opponent);
  const opponentHtml = record.opponentId
    ? `<a class="bgh-history-opponent" href="/user/${escapeHtml(record.opponentId)}" target="_blank" rel="noopener">${escapeHtml(opponent)}</a>`
    : `<span class="bgh-history-opponent">${escapeHtml(opponent)}</span>`;
  const change = isFiniteNumber(record.ratingChange)
    ? formatRatingChange(record.ratingChange)
    : record.hydration.state === "pending"
      ? "..."
      : "—";
  const changeColor =
    isFiniteNumber(record.ratingChange) && record.ratingChange > 0
      ? "#4caf50"
      : isFiniteNumber(record.ratingChange) && record.ratingChange < 0
        ? "#ff5252"
        : "#aaa";
  const result =
    typeof record.win === "boolean"
      ? `<span class="bgh-history-result ${record.win ? "bgh-win" : "bgh-loss"}">${record.win ? "WIN" : "LOSS"}</span>`
      : "";
  const opponentContent =
    record.hydration.state === "ok"
      ? opponentHtml
      : record.hydration.state === "unavailable"
        ? `<span class="bgh-history-opponent bgh-history-pending">Details unavailable</span>`
        : `<span class="bgh-history-opponent bgh-history-pending">Syncing...</span>`;
  return `
    <div class="bgh-history-row ${active ? "bgh-active" : ""}" role="button" tabindex="0" data-game-id="${escapeHtml(record.gameId)}" data-team="${record.isTeamDuel ? "1" : "0"}">
      <span class="bgh-history-row-top">
        <span class="bgh-history-mode">${escapeHtml(kindLabel(record))}</span>
        <span style="display:flex;gap:8px;align-items:center;">${result}<span class="bgh-history-change" style="color:${changeColor}">${escapeHtml(change)}</span></span>
      </span>
      <span class="bgh-history-row-bottom">${opponentContent}<span class="bgh-history-date">${escapeHtml(formatDate(record.time))}</span></span>
    </div>`;
}

export function createDrawerView(options: DrawerViewOptions): DrawerView {
  const style = injectStyle(STYLE_ID, STYLES);
  let root: HTMLElement | null = null;
  let scrollArea: HTMLElement | null = null;
  let activeId: string | null = null;
  let visible = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const setOpen = (next: boolean) => {
    if (!root) return;
    root.classList.toggle("bgh-open", next);
    root
      .querySelector<HTMLButtonElement>("#bgh-drawer-trigger-tab")
      ?.setAttribute("aria-expanded", String(next));
  };
  const cancelClose = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  };
  const open = () => {
    cancelClose();
    setOpen(true);
  };
  const close = () => {
    cancelClose();
    setOpen(false);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer = setTimeout(() => {
      closeTimer = null;
      setOpen(false);
    }, 450);
  };

  const mount = () => {
    if (root || !document.body) return;
    root = document.createElement("div");
    root.id = "bgh-history-drawer-root";
    root.innerHTML = `
      <div id="bgh-history-drawer">
        <div id="bgh-history-drawer-header">
          <h2>Game History</h2>
          <button id="bgh-show-graph" type="button">Graph</button>
        </div>
        <div id="bgh-history-scroll-area"></div>
      </div>
      <button id="bgh-drawer-trigger-tab" type="button" aria-label="Open game history" aria-expanded="false" aria-controls="bgh-history-drawer">›</button>`;
    const drawer = root.querySelector<HTMLElement>("#bgh-history-drawer");
    const tab = root.querySelector<HTMLButtonElement>("#bgh-drawer-trigger-tab");
    scrollArea = root.querySelector<HTMLElement>("#bgh-history-scroll-area");
    root
      .querySelector<HTMLButtonElement>("#bgh-show-graph")
      ?.addEventListener("click", options.onGraph);
    tab?.addEventListener("pointerenter", open);
    tab?.addEventListener("pointerleave", scheduleClose);
    tab?.addEventListener("focus", open);
    tab?.addEventListener("click", () => {
      if (root?.classList.contains("bgh-open")) close();
      else open();
    });
    tab?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    drawer?.addEventListener("pointerenter", open);
    drawer?.addEventListener("pointerleave", scheduleClose);
    drawer?.addEventListener("focusin", open);
    drawer?.addEventListener("focusout", (event) => {
      if (!root?.contains(event.relatedTarget as Node | null)) scheduleClose();
    });
    drawer?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    const openRow = (row: HTMLElement) => {
      if (!row.dataset.gameId) return;
      options.onOpenGame({
        gameId: row.dataset.gameId,
        isTeamDuel: row.dataset.team === "1",
      });
    };
    scrollArea?.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      if (target?.closest("a")) return;
      const row = target?.closest<HTMLElement>("[data-game-id]");
      if (row) openRow(row);
    });
    scrollArea?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = (event.target as Element | null)?.closest<HTMLElement>("[data-game-id]");
      if (!row) return;
      event.preventDefault();
      openRow(row);
    });
    document.body.appendChild(root);
  };

  const render = (records: readonly GameRecord[], activeGameId: string | null) => {
    if (!visible) return;
    mount();
    if (!scrollArea) return;
    activeId = activeGameId;
    const scrollTop = scrollArea.scrollTop;
    if (!records.length) {
      if (!scrollArea.querySelector(".bgh-history-empty")) {
        const empty = document.createElement("div");
        empty.className = "bgh-history-empty";
        empty.textContent = "No games recorded yet. Play a duel to start your history.";
        scrollArea.replaceChildren(empty);
      }
      return;
    }
    const existing = new Map<string, HTMLElement>();
    for (const child of scrollArea.querySelectorAll<HTMLElement>("[data-game-id]")) {
      if (child.dataset.gameId) existing.set(child.dataset.gameId, child);
    }
    const rows: HTMLElement[] = [];
    for (const record of records) {
      const signature = rowSignature(record, record.gameId === activeId, options.nameFor);
      let row = existing.get(record.gameId);
      if (!row || row.dataset.signature !== signature) {
        const template = document.createElement("template");
        template.innerHTML = rowHtml(record, record.gameId === activeId, options.nameFor);
        const nextRow = template.content.firstElementChild as HTMLElement | null;
        if (!nextRow) continue;
        if (row) row.replaceWith(nextRow);
        nextRow.dataset.signature = signature;
        row = nextRow;
      }
      rows.push(row);
    }
    const currentRows = [...scrollArea.children];
    const sameOrder =
      currentRows.length === rows.length &&
      currentRows.every((child, index) => child === rows[index]);
    if (!sameOrder) scrollArea.replaceChildren(...rows);
    scrollArea.scrollTop = scrollTop;
  };

  return {
    render,
    setVisible(next) {
      visible = next;
      if (!visible) {
        cancelClose();
        root?.remove();
        root = null;
        scrollArea = null;
        return;
      }
      mount();
    },
    dispose() {
      cancelClose();
      root?.remove();
      root = null;
      scrollArea = null;
      style?.remove();
    },
  };
}
