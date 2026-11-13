// Shared helpers reused across page-specific scripts.

function waLink(whatsappNumber) {
  return `https://wa.me/${whatsappNumber.replace(/\D/g, "")}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

// "2026-11-14" -> "14 November 2026"
function formatEventDate(eventDate) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${eventDate}T00:00:00`));
}

// Literal class names (so Tailwind's content scanner can find them) used to stagger
// card entrances; cycles for grids larger than the list.
const NEWS_STAGGER_DELAYS = ["", "delay-100", "delay-200"];

// News/event card used on the home page, the /news list and under each article.
// The whole card is a link to the article page (/news/<id>).
function newsCardMarkup(item, index = 0) {
  const image = item.image_url
    ? `<img src="${escapeHtml(item.image_url)}" alt="" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">`
    : `<div class="w-full h-full flex items-center justify-center"><i class="fa-regular fa-image text-3xl text-ink-muted/50" aria-hidden="true"></i></div>`;
  const tag = item.tag
    ? `<span class="inline-block bg-primary/10 text-primary font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">${escapeHtml(item.tag)}</span>`
    : "";
  const excerpt = item.excerpt
    ? `<p class="text-sm text-ink-muted mt-2 line-clamp-3">${escapeHtml(item.excerpt)}</p>`
    : "";

  return `
    <a href="/news/${encodeURIComponent(item.id)}" data-animate="fade-in-up" class="${NEWS_STAGGER_DELAYS[index % NEWS_STAGGER_DELAYS.length]} group flex flex-col h-full bg-surface rounded-2xl border border-ink/10 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
      <div class="aspect-video bg-canvas overflow-hidden">${image}</div>
      <div class="p-5 flex flex-col flex-grow">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <time datetime="${escapeHtml(item.event_date)}" class="font-body font-medium text-ink-muted">${formatEventDate(item.event_date)}</time>
          ${tag}
        </div>
        <h3 class="font-display font-bold uppercase tracking-tight text-lg leading-snug text-ink mt-3 line-clamp-2 transition-colors duration-300 group-hover:text-primary">${escapeHtml(item.title)}</h3>
        ${excerpt}
        <span class="inline-flex items-center gap-2 mt-auto pt-4 text-sm font-display font-bold text-primary">
          Baca selengkapnya <i class="fa-solid fa-arrow-right text-xs transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true"></i>
        </span>
      </div>
    </a>
  `;
}
