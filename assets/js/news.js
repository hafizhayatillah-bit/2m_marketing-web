// News page: fetch news/events from the public API and render as a grid.

const NEWS_ENDPOINT = "/api/v1/public/news";
const CONTENT_EXCERPT_LIMIT = 120;

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function formatEventDate(eventDate) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${eventDate}T00:00:00`));
}

function truncateExcerpt(content, limit) {
  if (content.length <= limit) return content;
  const cut = content.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : limit)}...`;
}

function newsCardMarkup(item) {
  const image = item.image_url
    ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" class="w-full h-full object-cover">`
    : `<div class="w-full h-full flex items-center justify-center"><iconify-icon icon="lucide:image" width="32" class="text-ink-muted"></iconify-icon></div>`;

  return `
    <article class="bg-surface rounded-2xl border border-ink/10 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-1 transition-all">
      <div class="aspect-video bg-canvas overflow-hidden">${image}</div>
      <div class="p-4">
        <span class="font-body text-sm text-ink-muted">${formatEventDate(item.event_date)}</span>
        <h3 class="font-display font-bold uppercase tracking-tight text-lg text-ink mt-1">${escapeHtml(item.title)}</h3>
        <p class="font-body text-sm text-ink-muted mt-2">${escapeHtml(truncateExcerpt(item.content, CONTENT_EXCERPT_LIMIT))}</p>
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

document.addEventListener("DOMContentLoaded", loadNews);
