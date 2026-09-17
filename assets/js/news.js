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

function newsCardMarkup(item) {
  const image = item.image_url
    ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">`
    : `<div class="w-full h-full flex items-center justify-center"><iconify-icon icon="lucide:image" width="32" class="text-ink-muted"></iconify-icon></div>`;

  return `
    <article data-news-id="${item.id}" class="group cursor-pointer bg-surface rounded-2xl border border-ink/10 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/30">
      <div class="relative aspect-video bg-canvas overflow-hidden">
        ${image}
        <span class="absolute bottom-3 left-3 bg-surface/95 backdrop-blur text-ink-muted text-xs font-bold px-3 py-1 rounded-full shadow-sm">${formatEventDate(item.event_date)}</span>
      </div>
      <div class="p-4">
        <h3 class="font-display font-bold uppercase tracking-tight text-lg text-ink transition-colors duration-300 group-hover:text-primary">${escapeHtml(item.title)}</h3>
        <span class="inline-flex items-center gap-1 mt-3 text-sm font-bold text-primary opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
          Baca Selengkapnya <iconify-icon icon="lucide:arrow-right" width="16"></iconify-icon>
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

    // TODO-REWRITE-PENDING-STAKEHOLDER: backend sorts event_date ascending without a date
    // floor, so a past-but-active event would surface first. Drop this filter once the
    // stakeholder decides whether past events should still be shown (e.g. as an archive).
    const today = new Date().toISOString().split("T")[0];
    const upcoming = Array.isArray(data) ? data.filter((n) => n.event_date >= today) : [];

    if (upcoming.length === 0) {
      showNewsState("empty");
      return;
    }

    document.getElementById("news-grid").innerHTML = upcoming.map(newsCardMarkup).join("");
    showNewsState("grid");
  } catch (error) {
    showNewsState("error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupNewsModal();
  loadNews();
});

