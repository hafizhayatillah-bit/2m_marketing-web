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

function setupHeroImageFallback() {
  const heroImage = document.getElementById("hero-image");
  if (!heroImage) return;
  heroImage.addEventListener("error", () => heroImage.classList.add("hidden"), { once: true });
  // image may have already failed to load before this listener attached
  if (heroImage.complete && heroImage.naturalWidth === 0) {
    heroImage.classList.add("hidden");
  }
}

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
       class="featured-product-card block rounded-2xl overflow-hidden border border-ink/10 shadow-sm hover:shadow-md transition-all opacity-0 -translate-y-1">
      <img src="${escapeHtml(item.image_url || "")}" alt="${escapeHtml(item.name)}" width="300" height="300"
           loading="${isLazy ? "lazy" : "eager"}" decoding="async" class="w-full aspect-square object-cover bg-canvas">
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

document.addEventListener("DOMContentLoaded", () => {
  setupHeroImageFallback();
  mountPromoSectionIfEnabled();
  if (FEATURE_FLAGS.showFeaturedProducts) loadFeaturedProducts();
});

