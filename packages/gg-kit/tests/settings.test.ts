import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://www.geoguessr.com/" });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  location: dom.location,
  history: dom.history,
  localStorage: dom.localStorage,
  sessionStorage: dom.sessionStorage,
  HTMLElement: dom.HTMLElement,
  Element: dom.Element,
  Node: dom.Node,
  MutationObserver: dom.MutationObserver,
  getComputedStyle: dom.getComputedStyle.bind(dom),
});

const { defineConfig } = await import("../src/config/define-config.js");
const { registerSettings } = await import("../src/settings/host.js");

type TestConfig = {
  enabled: boolean;
  volume: number;
  mode: string;
};

function config(key: string) {
  return defineConfig<TestConfig>({
    key,
    version: 1,
    fields: {
      enabled: { type: "boolean", default: true, label: "Enabled", section: "general" },
      volume: {
        type: "range",
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Volume",
        section: "audio",
      },
      mode: {
        type: "select",
        default: "all",
        label: "Mode",
        section: "general",
        options: [
          { value: "all", label: "All" },
          { value: "ranked", label: "Ranked" },
        ],
      },
    },
  });
}

function mountDialog() {
  document.body.innerHTML = `
    <dialog open data-settings-panel>
      <div class="tabs"><div role="tablist"><button role="tab">General</button></div></div>
      <div class="panels"><div role="tabpanel">Native panel</div></div>
    </dialog>
  `;
}

test("registers one shared userscripts tab and renders controls", () => {
  mountDialog();
  const store = config("gg.settings.a");
  const handle = registerSettings({
    id: "test-script",
    title: "Test Script",
    order: 10,
    config: store,
    sections: [
      { id: "general", title: "General", fields: ["enabled", "mode"] },
      { id: "audio", title: "Audio", fields: ["volume"] },
    ],
  });

  const tab = document.getElementById("ggk-userscripts-tab");
  const panel = document.getElementById("ggk-userscripts-panel");
  assert.ok(tab);
  assert.ok(panel);
  assert.match(tab!.textContent || "", /Userscripts/);
  assert.match(panel!.textContent || "", /Test Script/);
  assert.match(panel!.textContent || "", /Enabled/);
  assert.equal(panel!.querySelectorAll(".ggk-subTab").length, 1);

  const checkbox = panel!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  checkbox.checked = false;
  checkbox.dispatchEvent(new dom.Event("change", { bubbles: true }));
  assert.equal(store.get("enabled"), false);

  const range = panel!.querySelector<HTMLInputElement>('input[type="range"]')!;
  range.value = "0.25";
  range.dispatchEvent(new dom.Event("input", { bubbles: true }));
  assert.equal(store.get("volume"), 0.25);

  handle.dispose();
  assert.equal(document.getElementById("ggk-userscripts-tab"), null);
});

test("script sub-tabs switch the rendered settings without an overlay", () => {
  mountDialog();
  const alpha = registerSettings({
    id: "alpha-script",
    title: "Alpha Script",
    shortTitle: "Alpha",
    order: 10,
    config: config("gg.settings.alpha"),
    sections: [{ id: "general", title: "General", fields: ["enabled"] }],
  });
  const beta = registerSettings({
    id: "beta-script",
    title: "Beta Script",
    shortTitle: "Beta",
    order: 20,
    config: config("gg.settings.beta"),
    sections: [{ id: "general", title: "General", fields: ["volume"] }],
  });

  const panel = document.getElementById("ggk-userscripts-panel")!;
  const tabs = [...panel.querySelectorAll<HTMLButtonElement>(".ggk-subTab")];
  assert.deepEqual(
    tabs.map((tab) => tab.textContent),
    ["Alpha", "Beta"],
  );
  assert.equal(tabs[0].getAttribute("aria-selected"), "true");
  assert.equal(tabs[1].getAttribute("aria-selected"), "false");
  assert.equal(document.getElementById("ggk-settings-fab"), null);
  assert.equal(document.getElementById("ggk-settings-modal"), null);

  tabs[1].click();
  assert.match(panel.textContent || "", /Beta Script/);
  assert.equal(
    panel
      .querySelector<HTMLButtonElement>('[data-ggk-script="beta-script"]')
      ?.getAttribute("aria-selected"),
    "true",
  );

  beta.dispose();
  alpha.dispose();
  assert.equal(document.getElementById("ggk-userscripts-tab"), null);
});

test("activating Userscripts uses a scoped class and restores native tabs", () => {
  mountDialog();
  const handle = registerSettings({
    id: "native-tab-script",
    title: "Native Tab Script",
    config: config("gg.settings.native"),
    sections: [{ id: "general", title: "General", fields: ["enabled"] }],
  });
  const dialog = document.querySelector("dialog")!;
  const nativePanel = dialog.querySelector<HTMLElement>('[role="tabpanel"]')!;
  document.getElementById("ggk-userscripts-tab")!.click();
  assert.equal(dialog.classList.contains("ggk-userscripts-active"), true);
  assert.equal(nativePanel.style.display, "");
  const nativeTab = dialog.querySelector<HTMLElement>('[role="tab"]')!;
  nativeTab.click();
  assert.equal(dialog.classList.contains("ggk-userscripts-active"), false);
  assert.equal(document.getElementById("ggk-userscripts-panel")?.hidden, true);
  handle.dispose();
});

test("native toggle, range, row, and button structures are used", () => {
  document.body.innerHTML = `
    <dialog open data-settings-panel>
      <div class="tabs"><div role="tablist"><button role="tab" class="button_button__N button_variant__V">General</button></div></div>
      <div class="panels"><div role="tabpanel" class="game-menu_panel__P">Native</div></div>
      <div class="game-menu_row__R"><p class="game-menu_rowLabel__L"></p><div class="game-menu_rowControl__C"></div><span class="game-menu_rowState__S"></span></div>
      <label class="toggle_toggle__T"><input class="toggle_input__I"></label>
      <div class="range-slider_field__F"><span class="range-slider_thumbvalue__H"><input class="range-slider_rangeSlider__RI"><span class="range-slider_bubble__B"></span></span></div>
      <button class="button_button__N"><div class="button_wrapper__W"><span class="button_label__BL"></span></div></button>
    </dialog>
  `;
  const handle = registerSettings({
    id: "native-structure-script",
    title: "Native Structure",
    config: config("gg.settings.native-structure"),
    sections: [{ id: "general", title: "General", fields: ["enabled", "volume"] }],
  });
  const panel = document.getElementById("ggk-userscripts-panel")!;
  const toggle = panel.querySelector<HTMLLabelElement>(".toggle_toggle__T")!;
  assert.ok(toggle);
  assert.ok(toggle.querySelector(".toggle_input__I"));
  assert.equal(panel.querySelector(".game-menu_rowState__S")?.textContent, "On");
  assert.ok(
    panel.querySelector(
      ".range-slider_field__F .range-slider_thumbvalue__H .range-slider_rangeSlider__RI",
    ),
  );
  assert.ok(panel.querySelector(".range-slider_bubble__B"));
  const reset = panel.querySelector<HTMLButtonElement>(".ggk-section button")!;
  assert.ok(reset.classList.contains("button_button__N"));
  assert.ok(reset.querySelector(".button_wrapper__W .button_label__BL"));
  assert.equal(panel.querySelector(".game-menu_rowLabel__L")?.tagName, "P");
  handle.dispose();
});

test("number fields use a text input without browser spinners", () => {
  mountDialog();
  const store = defineConfig<{ count: number }>({
    key: "gg.settings.number",
    version: 1,
    fields: {
      count: { type: "number", default: 10, label: "Count", section: "general" },
    },
  });
  const handle = registerSettings({
    id: "number-script",
    title: "Number Script",
    config: store,
    sections: [{ id: "general", title: "General", fields: ["count"] }],
  });
  const panel = document.getElementById("ggk-userscripts-panel")!;
  const input = panel.querySelector<HTMLInputElement>(".ggk-number")!;
  assert.equal(input.type, "text");
  assert.equal(input.inputMode, "decimal");
  input.value = "12";
  input.dispatchEvent(new dom.Event("change", { bubbles: true }));
  assert.equal(store.get("count"), 12);
  handle.dispose();
});
