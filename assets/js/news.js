// News page: fetch news/events from the public API and render as a grid.
// Stage 1 (list) intentionally omits `content` for a fast/light payload; stage 2
// (detail) is fetched on-demand only when a card is clicked.

const NEWS_ENDPOINT = "/api/v1/public/news";

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function formatEventDate(eventDate) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${eventDate}T00:00:00`));
}

// Literal class names (so Tailwind's content scanner can find them) used to stagger
// card entrances; cycles for grids larger than the list.
const STAGGER_DELAYS = ["", "delay-100", "delay-200", "delay-300", "delay-400"];

function newsCardMarkup(item, index) {
  const image = item.image_url
    ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">`
    : `<div class="w-full h-full flex items-center justify-center"><iconify-icon icon="lucide:image" width="32" class="text-ink-muted"></iconify-icon></div>`;

  const tag = item.tag
    ? `<span class="inline-block text-xs font-bold text-primary uppercase tracking-wide bg-primary/10 px-2.5 py-1 rounded-full">${escapeHtml(item.tag)}</span>`
    : "";
  const excerpt = item.excerpt
    ? `<p class="text-sm text-ink-muted mt-2 line-clamp-3">${escapeHtml(item.excerpt)}</p>`
    : "";

  return `
    <article data-news-id="${item.id}" data-animate="fade-in-up" class="${STAGGER_DELAYS[index % STAGGER_DELAYS.length]} group cursor-pointer bg-surface rounded-2xl border border-ink/10 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/30 h-full flex flex-col">
      <div class="relative aspect-video bg-canvas overflow-hidden">
        ${image}
        <span class="absolute top-3 right-3 bg-surface/95 backdrop-blur text-ink-muted text-xs font-bold px-3 py-1 rounded-full shadow-sm">${formatEventDate(item.event_date)}</span>
      </div>
      <div class="p-4 flex flex-col flex-grow">
        <div class="flex-grow">
          ${tag}
          <h3 class="font-display font-bold uppercase tracking-tight text-lg text-ink mt-1 line-clamp-2 min-h-14 transition-colors duration-300 group-hover:text-primary">${escapeHtml(item.title)}</h3>
          ${excerpt}
        </div>
        <span class="inline-flex items-center gap-2 mt-4 self-start text-sm font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
          Baca Selengkapnya <i class="fa-solid fa-arrow-right text-xs"></i>
        </span>
      </div>
    </article>
  `;
}

function showNewsState(state) {
  document.getElementById("news-loading").classList.toggle("hidden", state !== "loading");
  document.getElementById("news-empty").classList.toggle("hidden", state !== "empty");
  document.getElementById("news-error").classList.toggle("hidden", state !== "error");
  document.getElementById("news-grid").classList.toggle("hidden", state !== "grid");
}

// Filter state lives client-side: "newest"/"oldest" sort by event_date, "all" also
// drops the upcoming-only restriction so past events become visible.
let allNewsItems = [];
let activeNewsFilter = "newest";

const NEWS_FILTER_META = {
  newest: { label: "Terbaru", icon: "fa-solid fa-arrow-down-wide-short" },
  all: { label: "Semua", icon: "fa-solid fa-layer-group" },
  oldest: { label: "Terlama", icon: "fa-solid fa-arrow-up-short-wide" },
};

function renderNewsGrid(items) {
  if (items.length === 0) {
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
  // floor, so a past-but-active event would surface first. Drop this filter once the
  // stakeholder decides whether past events should still be shown (e.g. as an archive).
  const today = new Date().toISOString().split("T")[0];
  const items = filter === "all"
    ? [...allNewsItems]
    : allNewsItems.filter((n) => n.event_date >= today);

  items.sort((a, b) => filter === "oldest"
    ? a.event_date.localeCompare(b.event_date)
    : b.event_date.localeCompare(a.event_date));

  renderNewsGrid(items);
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

const NEWS_MODAL_TRANSITION_MS = 300; // keep in sync with the duration-300 classes on the modal/panel

function openNewsModal(item) {
  const modal = document.getElementById("news-modal");
  const panel = document.getElementById("news-modal-panel");
  const imageWrap = document.getElementById("news-modal-image-wrap");
  const image = document.getElementById("news-modal-image");

  if (item.image_url) {
    image.src = item.image_url;
    image.alt = item.title;
    imageWrap.classList.remove("hidden");
  } else {
    imageWrap.classList.add("hidden");
  }

  document.getElementById("news-modal-date").textContent = formatEventDate(item.event_date);
  const tagEl = document.getElementById("news-modal-tag");
  if (item.tag) {
    tagEl.textContent = item.tag;
    tagEl.classList.remove("hidden");
  } else {
    tagEl.classList.add("hidden");
  }
  document.getElementById("news-modal-title").textContent = item.title;
  // Sanitize CMS-authored HTML before injecting to guard against stored XSS.
  document.getElementById("news-modal-content").innerHTML = DOMPurify.sanitize(item.content);

  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");

  // wait a frame after un-hiding so the fade/scale-in transition actually plays
  requestAnimationFrame(() => {
    modal.classList.remove("opacity-0");
    panel.classList.remove("opacity-0", "scale-95", "translate-y-4");
  });
}

function closeNewsModal() {
  const modal = document.getElementById("news-modal");
  const panel = document.getElementById("news-modal-panel");

  modal.classList.add("opacity-0");
  panel.classList.add("opacity-0", "scale-95", "translate-y-4");
  document.body.classList.remove("overflow-hidden");

  setTimeout(() => modal.classList.add("hidden"), NEWS_MODAL_TRANSITION_MS);
}

async function openNewsDetail(newsId) {
  try {
    const response = await fetch(`${NEWS_ENDPOINT}/${newsId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    openNewsModal(await response.json());
  } catch (error) {
    // Detail fetch failing shouldn't break the list view — just skip opening the modal.
  }
}

function setupNewsModal() {
  const modal = document.getElementById("news-modal");
  document.getElementById("news-modal-close").addEventListener("click", closeNewsModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeNewsModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNewsModal();
  });

  document.getElementById("news-grid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-news-id]");
    if (card) openNewsDetail(card.dataset.newsId);
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
  setupNewsModal();
  setupNewsFilter();
  loadNews();
});

