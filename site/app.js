(() => {
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
