// News page: fetch news/events from the public API and render them as a grid.
// The list payload omits `content`; each card links to its own article page
// (/news/<id>, see news-detail.js), which fetches the full item.
// escapeHtml / formatEventDate / newsCardMarkup live in utils.js.

const NEWS_ENDPOINT = "/api/v1/public/news";

function showNewsState(state) {
  document.getElementById("news-loading").classList.toggle("hidden", state !== "loading");
  document.getElementById("news-empty").classList.toggle("hidden", state !== "empty");
  document.getElementById("news-error").classList.toggle("hidden", state !== "error");
  document.getElementById("news-grid").classList.toggle("hidden", state !== "grid");
}

// Filter state lives client-side: "newest" shows upcoming events (latest first), "all"
// shows everything (latest first), "oldest" shows everything (earliest first).
let allNewsItems = [];
let activeNewsFilter = "newest";

const NEWS_FILTER_META = {
  newest: { label: "Terbaru", icon: "fa-solid fa-arrow-down-wide-short" },
  all: { label: "Semua", icon: "fa-solid fa-layer-group" },
  oldest: { label: "Terlama", icon: "fa-solid fa-arrow-up-short-wide" },
};

function renderNewsGrid(items, filter) {
  if (items.length === 0) {
    document.getElementById("news-empty").textContent = filter === "newest"
      ? "Belum ada event/berita terbaru saat ini."
      : "Belum ada event/berita.";
    showNewsState("empty");
    return;
  }
  const grid = document.getElementById("news-grid");
  grid.innerHTML = items.map((item, index) => newsCardMarkup(item, index)).join("");
  window.ScrollObserver?.observeAll(grid);
  showNewsState("grid");
}

function updateActiveFilterBadge(filter) {
  const meta = NEWS_FILTER_META[filter];
  document.getElementById("news-active-filter-label").textContent = meta.label;
  document.getElementById("news-active-filter-icon").className = `${meta.icon} text-[11px]`;
}

function updateFilterMenuActiveState(filter) {
  document.querySelectorAll(".news-filter-option").forEach((btn) => {
    const isActive = btn.dataset.filter === filter;
    btn.classList.toggle("text-primary", isActive);
    btn.classList.toggle("bg-primary/5", isActive);
    btn.classList.toggle("font-bold", isActive);
    btn.querySelector(".news-filter-check").classList.toggle("opacity-100", isActive);
    btn.querySelector(".news-filter-check").classList.toggle("opacity-0", !isActive);
  });
}

function applyNewsFilter(filter) {
  activeNewsFilter = filter;

  // TODO-REWRITE-PENDING-STAKEHOLDER: backend sorts event_date ascending without a date
  // floor, so a past-but-active event would surface first. "newest" keeps only upcoming
  // events until the stakeholder decides whether past events belong there too.
  const today = new Date().toISOString().split("T")[0];
  const items = filter === "newest"
    ? allNewsItems.filter((n) => n.event_date >= today)
    : [...allNewsItems];

  items.sort((a, b) => filter === "oldest"
    ? a.event_date.localeCompare(b.event_date)
    : b.event_date.localeCompare(a.event_date));

  renderNewsGrid(items, filter);
  updateActiveFilterBadge(filter);
  updateFilterMenuActiveState(filter);
}

function openFilterMenu() {
  const menu = document.getElementById("news-filter-menu");
  document.getElementById("news-filter-chevron").classList.add("rotate-180");
  menu.classList.remove("hidden");
  requestAnimationFrame(() => menu.classList.remove("opacity-0", "scale-95"));
}

function closeFilterMenu() {
  const menu = document.getElementById("news-filter-menu");
  document.getElementById("news-filter-chevron").classList.remove("rotate-180");
  menu.classList.add("opacity-0", "scale-95");
  setTimeout(() => menu.classList.add("hidden"), 150);
}

function setupNewsFilter() {
  const toggle = document.getElementById("news-filter-toggle");
  const menu = document.getElementById("news-filter-menu");

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    menu.classList.contains("hidden") ? openFilterMenu() : closeFilterMenu();
  });

  document.querySelectorAll(".news-filter-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyNewsFilter(btn.dataset.filter);
      closeFilterMenu();
    });
  });

  document.addEventListener("click", (event) => {
    if (!menu.classList.contains("hidden") && !event.target.closest("#news-filter-dropdown")) closeFilterMenu();
  });
}

async function loadNews() {
  showNewsState("loading");
  try {
    const response = await fetch(NEWS_ENDPOINT);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    allNewsItems = Array.isArray(data) ? data : [];
    applyNewsFilter(activeNewsFilter);
  } catch (error) {
    showNewsState("error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupNewsFilter();
  loadNews();
});

