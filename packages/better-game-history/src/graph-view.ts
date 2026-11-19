import type { ChartConfiguration } from "chart.js";
import Chart from "chart.js/auto";
import { duelSummaryPath, escapeHtml, injectStyle } from "gg-kit";
import {
  formatMetricLabel,
  getChartData,
  getTeamOptions,
  groupCandles,
  movingAverage,
} from "./chart-data.js";
import type {
  CandleMode,
  GameRecord,
  GraphFilters,
  GraphMetric,
  GraphMode,
  GraphQueue,
  GraphTimeframe,
  GraphType,
} from "./types.js";

const STYLE_ID = "bgh-graph-styles";
const FILTERS: Array<{
  key: "queue" | "metric" | "typeFilter" | "modeFilter" | "timeframe" | "candleMode";
  values: Array<{ value: string; label: string }>;
}> = [
  {
    key: "queue",
    values: [
      { value: "solo", label: "Solo" },
      { value: "team", label: "Team" },
    ],
  },
  {
    key: "metric",
    values: [
      { value: "ratingAfter", label: "Rating" },
      { value: "avgScore", label: "Score" },
      { value: "mmi", label: "Merchant" },
      { value: "avgTime", label: "Time" },
      { value: "gameCount", label: "Count" },
    ],
  },
  {
    key: "typeFilter",
    values: [
      { value: "Ranked", label: "Ranked" },
      { value: "Unranked", label: "Unranked" },
      { value: "All", label: "All status" },
    ],
  },
  {
    key: "modeFilter",
    values: [
      { value: "NMPZ", label: "NMPZ" },
      { value: "NM", label: "NM" },
      { value: "Moving", label: "Moving" },
      { value: "All", label: "All modes" },
    ],
  },
  {
    key: "timeframe",
    values: [
      { value: "24h", label: "24H" },
      { value: "7d", label: "Week" },
      { value: "30d", label: "Month" },
      { value: "All", label: "All" },
    ],
  },
  {
    key: "candleMode",
    values: [
      { value: "none", label: "Points" },
      { value: "hourly", label: "Hourly" },
      { value: "daily", label: "Daily" },
      { value: "monthly", label: "Monthly" },
    ],
  },
];

const STYLES = `
#bgh-history-graph { border: 0; padding: 0; background: transparent; color: #fff; max-width: none; max-height: none; color-scheme: dark; }
#bgh-history-graph::backdrop { background: rgba(10,10,20,.74); backdrop-filter: blur(12px); }
#bgh-graph-shell { width: min(1300px, 94vw); max-height: 92vh; display: flex; flex-direction: column; gap: 18px; padding: 28px; border: 1px solid rgba(255,255,255,.15); border-radius: 24px; background: rgba(26,26,46,.98); box-shadow: 0 40px 150px rgba(0,0,0,.6); overflow: auto; font-family: var(--font-neo-sans, sans-serif); }
#bgh-graph-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
#bgh-graph-title { margin: 0; font-size: 22px; letter-spacing: .08em; text-transform: uppercase; }
#bgh-graph-close { width: 42px; height: 42px; border: 0; border-radius: 50%; background: rgba(255,255,255,.1); color: #fff; cursor: pointer; font-size: 20px; }
.bgh-graph-toolbar { display: flex; flex-wrap: wrap; gap: 10px; }
.bgh-graph-group { display: flex; gap: 4px; padding: 4px; border-radius: 10px; background: rgba(255,255,255,.07); }
.bgh-graph-filter { border: 0; border-radius: 7px; padding: 7px 11px; background: transparent; color: #999; cursor: pointer; font-size: 10px; font-weight: 800; white-space: nowrap; }
.bgh-graph-filter.bgh-active { background: #7952e9; color: #fff; }
.bgh-graph-filter:focus-visible, #bgh-graph-close:focus-visible { outline: 2px solid #bca7ff; outline-offset: 2px; }
.bgh-graph-team { align-items: center; gap: 8px; padding-left: 10px; color: #999; font-size: 10px; font-weight: 800; }
.bgh-graph-select { border: 1px solid rgba(255,255,255,.16); border-radius: 8px; padding: 7px 10px; background-color: #1a1a2d; color: #f7f5ff; font: inherit; font-size: 11px; color-scheme: dark; }
.bgh-graph-select option { background-color: #1a1a2d; color: #f7f5ff; }
.bgh-graph-select:focus-visible { outline: 2px solid #bca7ff; outline-offset: 2px; }
.bgh-graph-chart { position: relative; flex: 1; min-height: 420px; }
.bgh-graph-empty { min-height: 420px; display: grid; place-items: center; color: rgba(255,255,255,.6); text-align: center; }
.bgh-graph-note { color: rgba(255,255,255,.5); font-size: 11px; }
@media (max-width: 700px) { #bgh-graph-shell { padding: 18px; } .bgh-graph-chart, .bgh-graph-empty { min-height: 300px; } }
`;

export interface GraphViewOptions {
  nameFor: (playerId: string | undefined, fallback?: string) => string;
  resolveNames?: (playerIds: readonly string[]) => void;
}

export interface GraphView {
  open(records: readonly GameRecord[], filters: GraphFilters): void;
  refresh(records: readonly GameRecord[]): void;
  close(): void;
  dispose(): void;
}

function filterGroup(
  key: string,
  values: Array<{ value: string; label: string }>,
  current: string,
): string {
  return `<div class="bgh-graph-group">${values
    .map(
      (item) =>
        `<button class="bgh-graph-filter ${item.value === current ? "bgh-active" : ""}" type="button" data-filter="${key}" data-value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`,
    )
    .join("")}</div>`;
}

function finiteNumbers(values: unknown[]): number[] {
  return values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
}

export function createGraphView(options: GraphViewOptions): GraphView {
  const style = injectStyle(STYLE_ID, STYLES);
  let dialog: HTMLDialogElement | null = null;
  let chart: Chart | null = null;
  let canvasHost: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let emptyState: HTMLElement | null = null;
  let refreshFrame: number | null = null;
  let records: readonly GameRecord[] = [];
  let filters: GraphFilters = {
    timeframe: "7d",
    metric: "ratingAfter",
    typeFilter: "Ranked",
    modeFilter: "All",
    queue: "solo",
    teamKey: "",
    showTrend: false,
    candleMode: "none",
  };

  const cleanup = () => {
    if (refreshFrame !== null) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(refreshFrame);
      else clearTimeout(refreshFrame);
      refreshFrame = null;
    }
    chart?.destroy();
    chart = null;
    canvasHost = null;
    canvas = null;
    emptyState = null;
    records = [];
    if (dialog) {
      dialog.remove();
      dialog = null;
    }
  };

  const close = () => {
    if (dialog?.open) dialog.close();
    else cleanup();
  };

  const render = () => {
    if (!dialog) return;
    if (refreshFrame !== null) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(refreshFrame);
      else clearTimeout(refreshFrame);
      refreshFrame = null;
    }
    const teamOptions = getTeamOptions(records, options.nameFor);
    if (filters.queue === "team") {
      if (!filters.teamKey || !teamOptions.some((team) => team.key === filters.teamKey)) {
        filters.teamKey = teamOptions[0]?.key || "";
      }
      const selectedTeam = teamOptions.find((team) => team.key === filters.teamKey);
      if (selectedTeam) options.resolveNames?.(selectedTeam.playerIds);
    } else {
      filters.teamKey = "";
    }
    const chartData = getChartData(records, filters, Date.now(), options.nameFor);
    const shell = dialog.querySelector<HTMLElement>("#bgh-graph-shell");
    if (!shell) return;
    const title = shell.querySelector<HTMLElement>("#bgh-graph-title");
    const toolbar = shell.querySelector<HTMLElement>(".bgh-graph-toolbar");
    canvasHost = shell.querySelector<HTMLElement>(".bgh-graph-chart");
    if (title) {
      const label = formatMetricLabel(filters.metric, filters.candleMode);
      title.textContent = filters.queue === "team" ? `Team ${label}` : label;
    }
    if (!toolbar || !canvasHost) return;
    const groups = FILTERS.filter(
      (group) => !(filters.queue === "team" && group.key === "modeFilter"),
    );
    const teamSelect =
      filters.queue === "team"
        ? `<div class="bgh-graph-group bgh-graph-team"><span>Team</span>
            <select id="bgh-team-select" class="bgh-graph-select" ${teamOptions.length ? "" : "disabled"}>
              ${
                teamOptions.length
                  ? teamOptions
                      .map(
                        (team) =>
                          `<option value="${escapeHtml(team.key)}" ${team.key === filters.teamKey ? "selected" : ""}>${escapeHtml(team.label)} (${team.count})</option>`,
                      )
                      .join("")
                  : `<option>No team data yet</option>`
              }
            </select>
          </div>`
        : "";
    toolbar.innerHTML =
      groups
        .map((group) =>
          filterGroup(
            group.key,
            group.values,
            String(filters[group.key as keyof GraphFilters] ?? ""),
          ),
        )
        .join("") +
      teamSelect +
      `<div class="bgh-graph-group"><button class="bgh-graph-filter ${filters.showTrend ? "bgh-active" : ""}" type="button" data-trend="1">Trend</button></div>`;
    toolbar
      .querySelector<HTMLSelectElement>("#bgh-team-select")
      ?.addEventListener("change", (event) => {
        filters.teamKey = (event.currentTarget as HTMLSelectElement).value;
        render();
      });
    toolbar.querySelectorAll<HTMLButtonElement>(".bgh-graph-filter").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.trend) {
          filters.showTrend = !filters.showTrend;
          render();
          return;
        }
        const key = button.dataset.filter as keyof GraphFilters | undefined;
        const value = button.dataset.value;
        if (!key || value === undefined) return;
        if (key === "queue") {
          filters.queue = value as GraphQueue;
          filters.teamKey = "";
        }
        if (key === "metric") filters.metric = value as GraphMetric;
        if (key === "typeFilter") filters.typeFilter = value as GraphType;
        if (key === "modeFilter") filters.modeFilter = value as GraphMode;
        if (key === "timeframe") filters.timeframe = value as GraphTimeframe;
        if (key === "candleMode") filters.candleMode = value as CandleMode;
        if (filters.metric === "gameCount" && filters.candleMode === "none") {
          filters.candleMode = "daily";
        }
        render();
      });
    });

    const note = shell.querySelector<HTMLElement>(".bgh-graph-note");
    if (note) {
      note.textContent =
        filters.queue === "team"
          ? "Team rating is separate from solo rating. Select one team composition at a time."
          : "Solo ranked duels only. Team duels use the Team queue.";
    }

    if (!canvasHost) return;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvasHost.appendChild(canvas);
    }
    if (!emptyState) {
      emptyState = document.createElement("div");
      emptyState.className = "bgh-graph-empty";
      canvasHost.appendChild(emptyState);
    }
    if (!chartData.length) {
      canvas.style.display = "none";
      emptyState.hidden = false;
      emptyState.textContent = "No games match these filters yet.";
      if (chart) {
        chart.data.labels = [];
        chart.data.datasets = [];
        chart.update("none");
      }
      return;
    }
    canvas.style.display = "";
    emptyState.hidden = true;

    const labels: string[] = [];
    const datasets: any[] = [];
    let candleGroups: ReturnType<typeof groupCandles> | null = null;
    if (filters.candleMode === "none") {
      labels.push(...chartData.map((point) => point.label));
      datasets.push({
        type: "line",
        label: "Actual",
        data: chartData.map((point) => point.value),
        operators: chartData.map((point) => point.opponent),
        modes: chartData.map((point) => point.mode),
        borderColor: "#9d7fff",
        backgroundColor: "rgba(157,127,255,.12)",
        borderWidth: 3,
        pointRadius: chartData.length > 50 ? 3 : 5,
        pointHoverRadius: 8,
        pointBackgroundColor: "#fff",
        pointBorderColor: "#7952e9",
        pointBorderWidth: 2,
        fill: true,
        tension: 0.35,
        z: 10,
      });
    } else {
      const groups = groupCandles(chartData, filters.candleMode, filters.timeframe);
      candleGroups = groups;
      labels.push(...groups.map((group) => group.label));
      if (filters.metric === "gameCount") {
        datasets.push({
          type: "bar",
          label: "Games Played",
          data: groups.map((group) => group.count),
          backgroundColor: "rgba(121,82,233,.55)",
          borderColor: "#7952e9",
          borderWidth: 2,
          borderRadius: 6,
          grouped: false,
        });
      } else {
        datasets.push({
          type: "bar",
          label: "Range",
          data: groups.map((group) => [group.low, group.high]),
          backgroundColor: (context: { dataIndex: number }) =>
            groups[context.dataIndex]?.close >= groups[context.dataIndex]?.open
              ? "#4caf50"
              : "#ff5252",
          barThickness: 2,
          grouped: false,
        });
        datasets.push({
          type: "bar",
          label: "Body",
          data: groups.map((group) => [group.open, group.close]),
          backgroundColor: (context: { dataIndex: number }) =>
            groups[context.dataIndex]?.close >= groups[context.dataIndex]?.open
              ? "#4caf50"
              : "#ff5252",
          barPercentage: 0.6,
          grouped: false,
        });
      }
    }

    if (filters.showTrend) {
      const source =
        filters.candleMode === "none"
          ? chartData.map((point) => point.value)
          : (candleGroups || []).map((group) =>
              filters.metric === "gameCount"
                ? group.count
                : group.values.reduce((total, value) => total + value, 0) / group.values.length,
            );
      datasets.push({
        type: "line",
        label: "Trend",
        data: movingAverage(source, 10),
        borderColor: "rgba(255,255,255,.5)",
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.35,
        z: 1,
        grouped: false,
      });
    }

    const context = canvas.getContext("2d");
    if (!context) return;
    const flat = finiteNumbers(
      datasets.flatMap((dataset) =>
        dataset.data.flatMap((value: unknown) =>
          Array.isArray(value) ? [value[0], value[1]] : [value],
        ),
      ),
    );
    if (!flat.length) {
      canvas.style.display = "none";
      emptyState.hidden = false;
      emptyState.textContent = "No numeric data matches these filters.";
      return;
    }
    let minimum = Math.min(...flat);
    let maximum = Math.max(...flat);
    if (filters.metric === "mmi") {
      minimum = Math.min(minimum, -0.5);
      maximum = Math.max(maximum, 0.5);
    }
    const padding = maximum - minimum === 0 ? 5 : (maximum - minimum) * 0.1;
    const isCandle = filters.candleMode !== "none";
    const chartOptions: any = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: "index" },
      layout: { padding: { left: 10, right: 10 } },
      onClick: (_event: unknown, elements: Array<{ datasetIndex: number; index: number }>) => {
        const element = elements[0];
        if (!element || filters.candleMode !== "none") return;
        const point = chartData[element.index];
        if (point) window.open(duelSummaryPath(point.gameId, point.isTeamDuel), "_blank");
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(20,20,35,.95)",
          padding: 14,
          titleColor: "#888",
          bodyColor: "#fff",
          callbacks: {
            label: (context: any) => {
              if (context.dataset.label === "Trend") {
                return `Trend: ${Number(context.parsed.y).toFixed(1)}`;
              }
              if (isCandle) {
                return `${context.dataset.label}: ${context.parsed.y ?? context.parsed._custom}`;
              }
              return `${filters.metric}: ${context.parsed.y}`;
            },
            afterLabel: (context: any) => {
              if (isCandle) return "";
              const point = chartData[context.dataIndex];
              if (!point) return [];
              return [
                `${point.teamLabel ? "Team" : "Opponent"}: ${point.teamLabel || point.opponent}`,
                `Mode: ${point.mode}`,
              ];
            },
          },
        },
      },
      scales: {
        y: {
          min: filters.metric === "gameCount" ? 0 : Math.floor(minimum - padding),
          max: Math.ceil(maximum + padding),
          grid: { color: "rgba(255,255,255,.05)" },
          ticks: { color: "#8b88a0", font: { size: 10 } },
        },
        x: {
          offset: isCandle || filters.metric === "gameCount",
          grid: { display: false },
          ticks: {
            color: "#8b88a0",
            autoSkip: true,
            maxTicksLimit: 8,
            maxRotation: 0,
            padding: 8,
            font: { size: 10, weight: "600" },
          },
        },
      },
    };
    if (!chart) {
      chart = new Chart(context, {
        type: "bar",
        data: { labels, datasets },
        options: chartOptions,
      } as ChartConfiguration);
    } else {
      chart.data.labels = labels;
      chart.data.datasets = datasets;
      (chart as unknown as { options: unknown }).options = chartOptions;
      chart.update("none");
    }
  };

  const mount = () => {
    if (dialog) return;
    dialog = document.createElement("dialog");
    dialog.id = "bgh-history-graph";
    dialog.innerHTML = `
      <div id="bgh-graph-shell">
        <div id="bgh-graph-header">
          <h2 id="bgh-graph-title"></h2>
          <button id="bgh-graph-close" type="button" aria-label="Close graph">✕</button>
        </div>
        <div class="bgh-graph-toolbar"></div>
        <div class="bgh-graph-chart"></div>
        <div class="bgh-graph-note">Solo duels only. Team duels are shown in the history drawer.</div>
      </div>`;
    dialog.querySelector<HTMLButtonElement>("#bgh-graph-close")?.addEventListener("click", close);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener("close", cleanup);
    document.body.appendChild(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };

  return {
    open(nextRecords, nextFilters) {
      records = nextRecords;
      filters = {
        ...nextFilters,
        queue: nextFilters.queue || "solo",
        teamKey: nextFilters.teamKey || "",
      };
      if (filters.metric === "gameCount" && filters.candleMode === "none") {
        filters.candleMode = "daily";
      }
      mount();
      render();
    },
    refresh(nextRecords) {
      records = nextRecords;
      if (!dialog || refreshFrame !== null) return;
      const run = () => {
        refreshFrame = null;
        render();
      };
      if (typeof requestAnimationFrame === "function") refreshFrame = requestAnimationFrame(run);
      else refreshFrame = setTimeout(run, 0) as unknown as number;
    },
    close,
    dispose() {
      cleanup();
      style?.remove();
    },
  };
}
