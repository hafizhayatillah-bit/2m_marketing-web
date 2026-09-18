// Custom mouse cursor (dot + trailing outline). Skipped on touch devices
// since there's no real cursor to replace there.
(function () {
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  const outline = document.createElement("div");
  outline.className = "cursor-outline";
  document.body.append(dot, outline);
  document.body.classList.add("custom-cursor-active");

  window.addEventListener("mousemove", (e) => {
    dot.style.left = `${e.clientX}px`;
    dot.style.top = `${e.clientY}px`;
    outline.style.left = `${e.clientX}px`;
    outline.style.top = `${e.clientY}px`;
  });

  document.addEventListener("mousedown", () => outline.classList.add("cursor-outline--active"));
  document.addEventListener("mouseup", () => outline.classList.remove("cursor-outline--active"));
})();
