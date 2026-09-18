// Home page: hero image fallback + promo section fetched from the public API.

const PROMOS_ENDPOINT = "/api/v1/public/promos";

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function computeDiscountPercent(normalPrice, promoPrice) {
  if (!normalPrice) return null; // guard div-by-zero, avoid NaN%
  return Math.round((1 - promoPrice / normalPrice) * 100);
}

function promoCardMarkup(promo) {
  const discountPct = computeDiscountPercent(promo.normal_price, promo.promo_price);
  const badge = discountPct !== null
    ? `<span class="absolute top-3 left-3 bg-accent text-ink text-xs font-display font-bold px-3 py-1 rounded-full">-${discountPct}%</span>`
    : "";
  const image = promo.image_url
    ? `<img src="${escapeHtml(promo.image_url)}" alt="${escapeHtml(promo.title)}" loading="lazy" class="w-full h-full object-cover">`
    : `<div class="w-full h-full flex items-center justify-center"><iconify-icon icon="lucide:image" width="32" class="text-ink-muted"></iconify-icon></div>`;
  const description = promo.description
    ? `<p class="font-body text-sm text-ink-muted mt-1">${escapeHtml(promo.description)}</p>`
    : "";

  return `
    <article class="relative bg-surface rounded-2xl border border-ink/10 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-1 transition-all">
      ${badge}
      <div class="aspect-square bg-canvas">${image}</div>
      <div class="p-4">
        <h3 class="font-display font-bold uppercase tracking-tight text-lg text-ink">${escapeHtml(promo.title)}</h3>
        ${description}
        <div class="mt-3 flex items-baseline gap-2">
          <span class="font-body text-sm text-ink-muted line-through">${formatRupiah(promo.normal_price)}</span>
          <span class="font-display font-bold text-xl text-primary">${formatRupiah(promo.promo_price)}</span>
        </div>
      </div>
    </article>
  `;
}

function showPromoState(state) {
  document.getElementById("promo-loading").classList.toggle("hidden", state !== "loading");
  document.getElementById("promo-empty").classList.toggle("hidden", state !== "empty");
  document.getElementById("promo-error").classList.toggle("hidden", state !== "error");
  document.getElementById("promo-grid").classList.toggle("hidden", state !== "grid");
}

async function loadPromos() {
  showPromoState("loading");
  try {
    const response = await fetch(PROMOS_ENDPOINT);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const promos = await response.json();

    if (!Array.isArray(promos) || promos.length === 0) {
      showPromoState("empty");
      return;
    }

    document.getElementById("promo-grid").innerHTML = promos.map(promoCardMarkup).join("");
    showPromoState("grid");
  } catch (error) {
    showPromoState("error");
  }
}

// --- Hero slider (full-screen, auto-advancing, zoom-out + progress bar) ---
// Wrapped in an IIFE so slide/timer state stays private; only initHeroSlider is exposed.
const initHeroSlider = (() => {
  const SLIDE_INTERVAL_MS = 5000;

  // Removing then re-adding a class doesn't restart a CSS animation unless the
  // browser is forced to reflow in between, hence the `void el.offsetWidth` reads.
  function restartAnimation(el, animationClass) {
    el.classList.remove(animationClass);
    void el.offsetWidth;
    el.classList.add(animationClass);
  }

  return function initHeroSlider() {
    const slider = document.getElementById("hero-slider");
    if (!slider) return;

    const slides = Array.from(slider.querySelectorAll("[data-hero-slide]"));
    const dots = Array.from(slider.querySelectorAll("[data-hero-dot]"));
    if (slides.length === 0) return;

    let activeIndex = 0;

    function setDotActive(dot, isActive) {
      const label = dot.querySelector(".hero-dot__label");
      const fill = dot.querySelector(".hero-dot__fill");
      label.classList.toggle("text-white", isActive);
      label.classList.toggle("text-white/50", !isActive);
      if (isActive) {
        restartAnimation(fill, "animate-hero-progress-fill");
      } else {
        // no active class = animation stops applying, width snaps back to the base w-0
        fill.classList.remove("animate-hero-progress-fill");
      }
    }

    function goToSlide(index) {
      slides[activeIndex].classList.replace("opacity-100", "opacity-0");
      if (dots[activeIndex]) setDotActive(dots[activeIndex], false);

      activeIndex = index;
      const next = slides[activeIndex];
      next.classList.replace("opacity-0", "opacity-100");
      restartAnimation(next, "animate-hero-zoom-out");
      if (dots[activeIndex]) setDotActive(dots[activeIndex], true);
    }

    restartAnimation(slides[activeIndex], "animate-hero-zoom-out");
    if (dots[activeIndex]) setDotActive(dots[activeIndex], true);

    setInterval(() => goToSlide((activeIndex + 1) % slides.length), SLIDE_INTERVAL_MS);
  };
})();

// Legacy promo section: not deleted, just unmounted unless the feature flag is re-enabled.
async function mountPromoSectionIfEnabled() {
  if (!FEATURE_FLAGS.showPromoSection) return;
  const mount = document.getElementById("promo-section-mount");
  if (!mount) return;
  const response = await fetch("/partials/promo-section.html");
  mount.innerHTML = await response.text();
  loadPromos();
}

// --- Produk Unggulan (featured products) ---

const FEATURED_PRODUCTS_ENDPOINT = "/api/v1/public/featured-products?limit=48&offset=0";
const FEATURED_PRODUCTS_PAGE_SIZE = 4;
const FEATURED_LAZY_LOAD_START_INDEX = 5; // items before this position load eagerly (above the fold)

let featuredProductsItems = [];
let featuredProductsPage = 0;

function featuredProductCardMarkup(item, indexInFullList) {
  const isLazy = indexInFullList >= FEATURED_LAZY_LOAD_START_INDEX; 
  return `
    <a href="/product?id=${encodeURIComponent(item.product_id)}"
       class="group featured-product-card flex flex-col bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-emerald-100/60 hover:border-emerald-200 cursor-pointer opacity-0 -translate-y-1 h-full">
      
      <!-- 1. Kontainer Gambar (padded, contain agar tidak terpotong) -->
      <div class="w-full h-48 md:h-56 shrink-0 p-4 bg-white overflow-hidden">
        <img src="${escapeHtml(item.image_url || "")}" alt="${escapeHtml(item.name)}" 
             loading="${isLazy ? "lazy" : "eager"}" decoding="async" 
             class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
             onerror="this.src='https://via.placeholder.com/300?text=No+Image'">
      </div>
      
      <!-- 2. Kontainer Teks (Punya padding sendiri, background putih) -->
      <div class="p-5 md:p-6 flex flex-col grow">
        <h3 class="font-display font-bold text-slate-900 text-left text-base md:text-lg line-clamp-2 mt-auto transition-colors duration-300 group-hover:text-emerald-600">
          ${escapeHtml(item.name)}
        </h3>
      </div>
      
    </a>
  `;
}

function totalFeaturedPages() {
  return Math.ceil(featuredProductsItems.length / FEATURED_PRODUCTS_PAGE_SIZE);
}

function renderFeaturedProductsPage() {
  const grid = document.getElementById("featured-products-grid");
  const start = featuredProductsPage * FEATURED_PRODUCTS_PAGE_SIZE;
  const pageItems = featuredProductsItems.slice(start, start + FEATURED_PRODUCTS_PAGE_SIZE);

  // only as many slots as there are items left — no blank placeholder cards
  grid.innerHTML = pageItems.map((item, i) => featuredProductCardMarkup(item, start + i)).join("");

  // staggered per-card entrance (delay increases per slot) instead of a container-wide transform
  grid.querySelectorAll(".featured-product-card").forEach((card, i) => {
    card.style.transitionDelay = `${i * 80}ms`;
    requestAnimationFrame(() => {
      card.classList.add("transition-all", "duration-300");
      card.classList.remove("opacity-0", "-translate-y-1");
    });
  });

  document.getElementById("featured-prev").disabled = featuredProductsPage === 0;
  document.getElementById("featured-next").disabled = featuredProductsPage >= totalFeaturedPages() - 1;
}

function setupFeaturedProductsNav() {
  document.getElementById("featured-prev").addEventListener("click", () => {
    if (featuredProductsPage === 0) return;
    featuredProductsPage -= 1; // moves a full page (4 items) at a time, not one-by-one
    renderFeaturedProductsPage();
  });
  document.getElementById("featured-next").addEventListener("click", () => {
    if (featuredProductsPage >= totalFeaturedPages() - 1) return;
    featuredProductsPage += 1;
    renderFeaturedProductsPage();
  });
}

async function loadFeaturedProducts() {
  const section = document.getElementById("featured-products-section");
  if (!section) return;
  try {
    const response = await fetch(FEATURED_PRODUCTS_ENDPOINT);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    featuredProductsItems = Array.isArray(data.items) ? data.items : [];

    if (featuredProductsItems.length === 0) {
      section.classList.add("hidden"); // total = 0: no container rendered at all
      return;
    }

    section.classList.remove("hidden");
    setupFeaturedProductsNav();
    renderFeaturedProductsPage();
  } catch (error) {
    section.classList.add("hidden");
  }
}

// --- Artikel Terbaru (latest news preview + shared detail modal, same UX as /news) ---

const LATEST_NEWS_ENDPOINT = "/api/v1/public/news";
const LATEST_NEWS_COUNT = 3;
const LATEST_NEWS_MODAL_TRANSITION_MS = 300; // keep in sync with the duration-300 classes on the modal/panel

function formatNewsEventDate(eventDate) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${eventDate}T00:00:00`));
}

function latestNewsCardMarkup(item) {
  const image = item.image_url
    ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">`
    : `<div class="w-full h-full flex items-center justify-center"><iconify-icon icon="lucide:image" width="32" class="text-ink-muted"></iconify-icon></div>`;

  const tag = item.tag
    ? `<span class="text-xs font-bold text-primary uppercase tracking-wide">${escapeHtml(item.tag)}</span>`
    : "";
  const excerpt = item.excerpt
    ? `<p class="text-sm text-ink-muted mt-2 line-clamp-3">${escapeHtml(item.excerpt)}</p>`
    : "";

  return `
    <article data-news-id="${item.id}" class="group cursor-pointer bg-surface rounded-2xl border border-ink/10 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/30 h-full flex flex-col">
      <div class="relative aspect-video bg-canvas overflow-hidden">
        ${image}
        <span class="absolute top-3 right-3 bg-surface/95 backdrop-blur text-ink-muted text-xs font-bold px-3 py-1 rounded-full shadow-sm">${formatNewsEventDate(item.event_date)}</span>
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

function openLatestNewsModal(item) {
  const modal = document.getElementById("home-news-modal");
  const panel = document.getElementById("home-news-modal-panel");
  const imageWrap = document.getElementById("home-news-modal-image-wrap");
  const image = document.getElementById("home-news-modal-image");

  if (item.image_url) {
    image.src = item.image_url;
    image.alt = item.title;
    imageWrap.classList.remove("hidden");
  } else {
    imageWrap.classList.add("hidden");
  }

  document.getElementById("home-news-modal-date").textContent = formatNewsEventDate(item.event_date);
  const tagEl = document.getElementById("home-news-modal-tag");
  if (item.tag) {
    tagEl.textContent = item.tag;
    tagEl.classList.remove("hidden");
  } else {
    tagEl.classList.add("hidden");
  }
  document.getElementById("home-news-modal-title").textContent = item.title;
  // Sanitize CMS-authored HTML before injecting to guard against stored XSS.
  document.getElementById("home-news-modal-content").innerHTML = DOMPurify.sanitize(item.content);

  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");

  requestAnimationFrame(() => {
    modal.classList.remove("opacity-0");
    panel.classList.remove("opacity-0", "scale-95", "translate-y-4");
  });
}

function closeLatestNewsModal() {
  const modal = document.getElementById("home-news-modal");
  const panel = document.getElementById("home-news-modal-panel");

  modal.classList.add("opacity-0");
  panel.classList.add("opacity-0", "scale-95", "translate-y-4");
  document.body.classList.remove("overflow-hidden");

  setTimeout(() => modal.classList.add("hidden"), LATEST_NEWS_MODAL_TRANSITION_MS);
}

async function openLatestNewsDetail(newsId) {
  try {
    const response = await fetch(`${LATEST_NEWS_ENDPOINT}/${newsId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    openLatestNewsModal(await response.json());
  } catch (error) {
    // Detail fetch failing shouldn't break the section — just skip opening the modal.
  }
}

function setupLatestNewsModal() {
  const modal = document.getElementById("home-news-modal");
  if (!modal) return;
  document.getElementById("home-news-modal-close").addEventListener("click", closeLatestNewsModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeLatestNewsModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLatestNewsModal();
  });

  document.getElementById("latest-news-grid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-news-id]");
    if (card) openLatestNewsDetail(card.dataset.newsId);
  });
}

async function loadLatestNews() {
  const section = document.getElementById("latest-news-section");
  if (!section) return;
  try {
    const response = await fetch(LATEST_NEWS_ENDPOINT);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const items = Array.isArray(data) ? data : [];
    // "Terbaru" = most recent event_date first, capped to a small preview count.
    const latest = items
      .slice()
      .sort((a, b) => b.event_date.localeCompare(a.event_date))
      .slice(0, LATEST_NEWS_COUNT);

    if (latest.length === 0) {
      section.classList.add("hidden");
      return;
    }

    document.getElementById("latest-news-grid").innerHTML = latest.map(latestNewsCardMarkup).join("");
    section.classList.remove("hidden");
  } catch (error) {
    section.classList.add("hidden");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initHeroSlider();
  mountPromoSectionIfEnabled();
  if (FEATURE_FLAGS.showFeaturedProducts) loadFeaturedProducts();
  setupLatestNewsModal();
  loadLatestNews();
});

