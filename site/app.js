(() => {
  const INSTALL_PREFIX = "gg-toolkit.installed.v1.";

  const versionParts = (version) =>
    String(version || "")
      .split("-")[0]
      .split(".")
      .map((part) => Number(part) || 0);

  const compareVersions = (left, right) => {
    const a = versionParts(left);
    const b = versionParts(right);
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
      const delta = (a[index] || 0) - (b[index] || 0);
      if (delta) return delta;
    }
    return 0;
  };

  const readInstalled = (name) => {
    try {
      const raw = localStorage.getItem(`${INSTALL_PREFIX}${name}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return typeof parsed?.version === "string" ? parsed : null;
    } catch {
      return null;
    }
  };

  const setButtonState = (button, state, installed, current) => {
    button.dataset.installStatus = state;
    button.classList.remove("buttonInstalled", "buttonUpdate");
    button.removeAttribute("aria-disabled");
    button.removeAttribute("title");
    if (!button.dataset.installHref) {
      button.dataset.installHref = button.getAttribute("href") || "";
    }
    if (state === "installed") {
      button.textContent = "INSTALLED";
      button.classList.add("buttonInstalled");
      button.setAttribute("aria-disabled", "true");
      button.removeAttribute("href");
      button.title = `Installed version ${installed?.version || "unknown"}${current ? ` (current ${current})` : ""}`;
      return;
    }
    button.setAttribute("href", button.dataset.installHref);
    if (state === "update") {
      button.textContent = "UPDATE";
      button.classList.add("buttonUpdate");
      button.title = `Installed version ${installed?.version || "unknown"}; update to ${current}`;
      return;
    }
    button.textContent = "Install";
    button.title = "Install status is detected after the updated script runs on this page once.";
  };

  const updateInstallStatuses = () => {
    for (const row of document.querySelectorAll("[data-script][data-script-version]")) {
      const button = row.querySelector("[data-install-button]");
      if (!button) continue;
      const name = row.dataset.script;
      const current = row.dataset.scriptVersion || "";
      const installed = readInstalled(name);
      if (!installed) {
        setButtonState(button, "install", null, current);
      } else if (current && compareVersions(installed.version, current) < 0) {
        setButtonState(button, "update", installed, current);
      } else {
        setButtonState(button, "installed", installed, current);
      }
    }
  };

  updateInstallStatuses();
  window.addEventListener("load", updateInstallStatuses);
  window.addEventListener("pageshow", updateInstallStatuses);
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key?.startsWith(INSTALL_PREFIX)) updateInstallStatuses();
  });

  const dialog = document.getElementById("previewDialog");
  if (!dialog) return;
  const image = document.getElementById("previewImage");
  const caption = document.getElementById("previewCaption");
  const counter = document.getElementById("previewCounter");
  const previous = document.getElementById("previewPrev");
  const next = document.getElementById("previewNext");
  const close = document.getElementById("previewClose");
  let items = [];
  let index = 0;

  const show = (nextIndex) => {
    if (!items.length) return;
    index = Math.max(0, Math.min(items.length - 1, nextIndex));
    const item = items[index];
    image.src = item.dataset.full || "";
    image.alt = item.dataset.alt || "";
    caption.textContent = item.dataset.alt || "";
    counter.textContent = `${index + 1} / ${items.length}`;
    previous.disabled = index === 0;
    next.disabled = index === items.length - 1;
  };

  const open = (button) => {
    const row = button.closest(".scriptRow");
    items = row ? [...row.querySelectorAll(".previewThumb")] : [button];
    show(items.indexOf(button));
    dialog.showModal();
    document.body.classList.add("previewOpen");
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".previewThumb");
    if (button) open(button);
  });
  previous.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(index - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      show(index + 1);
    }
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("previewOpen");
    items[index]?.focus();
  });
})();
