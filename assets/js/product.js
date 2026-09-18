// Product page: fetch products once, group by category, and filter client-side via tabs.

const PRODUCTS_ENDPOINT = "/api/v1/public/products";
const ALL_CATEGORY = "Semua";

// Best-effort visual pairing; unmatched categories fall back to a generic tag icon.
const CATEGORY_ICONS = {
  [ALL_CATEGORY]: "fa-solid fa-layer-group",
  "Sembako": "fa-solid fa-bowl-rice",
  "Minuman & Susu": "fa-solid fa-mug-hot",
  "Snack": "fa-solid fa-cookie-bite",
  "Bumbu Dapur": "fa-solid fa-pepper-hot",
  "Gas & Air Galon": "fa-solid fa-fire-flame-simple",
  "Perlengkapan Mandi & Perawatan Pribadi": "fa-solid fa-pump-soap",
  "Perlengkapan Rumah Tangga": "fa-solid fa-house",
  "Frozen Food": "fa-solid fa-snowflake",
  "Roti & Kue": "fa-solid fa-bread-slice",
  "Lainnya": "fa-solid fa-box",
};

let allProducts = [];
let categoryOrder = [];
let activeCategory = ALL_CATEGORY;

// Literal class names (so Tailwind's content scanner can find them) used to stagger
// card entrances; cycles for grids larger than the list.
const STAGGER_DELAYS = ["", "delay-100", "delay-200", "delay-300", "delay-400"];

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function extractCategoryOrder(products) {
  const seen = new Set();
  const order = [];
  for (const product of products) {
    if (!seen.has(product.category)) {
      seen.add(product.category);
      order.push(product.category);
    }
  }
  return order;
}

function groupByCategory(products) {
  const groups = new Map();
  for (const product of products) {
    if (!groups.has(product.category)) groups.set(product.category, []);
    groups.get(product.category).push(product);
  }
  return groups;
}

function productCardMarkup(product, index) {
  const image = product.image_url
    ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy" class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110">`
    : `<div class="w-full h-full flex items-center justify-center"><iconify-icon icon="lucide:image" width="32" class="text-ink-muted"></iconify-icon></div>`;
  const description = product.description
    ? `<p class="font-body text-sm text-ink-muted mt-1">${escapeHtml(product.description)}</p>`
    : "";
  const viewImageBadge = product.image_url
    ? `<span class="absolute bottom-3 left-3 inline-flex items-center gap-1 bg-surface/95 backdrop-blur text-primary text-xs font-bold px-3 py-1 rounded-full shadow-sm">
        <iconify-icon icon="lucide:zoom-in" width="14"></iconify-icon> Lihat Gambar
      </span>`
    : "";
  const delayClass = STAGGER_DELAYS[index % STAGGER_DELAYS.length];

  return `
    <article data-product-id="${product.id}" data-animate="fade-in-up" class="${delayClass} group cursor-pointer bg-surface rounded-2xl border border-ink/10 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/30">
      <div class="relative h-48 p-4 bg-surface overflow-hidden">
        ${image}
        ${viewImageBadge}
      </div>
      <div class="p-4">
        <h3 class="font-display font-bold uppercase tracking-tight text-lg text-ink transition-colors duration-300 group-hover:text-primary">${escapeHtml(product.name)}</h3>
        ${description}
      </div>
    </article>
  `;
}

function categorySectionMarkup(category, products) {
  return `
    <div>
      <h2 class="font-display font-bold uppercase tracking-tight text-2xl md:text-3xl text-ink mb-6">${escapeHtml(category)}</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        ${products.map((product, index) => productCardMarkup(product, index)).join("")}
      </div>
    </div>
  `;
}

function categoryOptionMarkup(category, isFirst) {
  const icon = CATEGORY_ICONS[category] || "fa-solid fa-tag";
  const borderClass = isFirst ? "" : "border-t border-ink/5";
  return `<button type="button" data-category="${escapeHtml(category)}" class="category-option w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-body text-ink hover:bg-primary/10 hover:text-primary transition-colors duration-200 ${borderClass}">
      <span class="flex items-center gap-2"><i class="${icon} text-xs" aria-hidden="true"></i> ${escapeHtml(category)}</span>
      <i class="fa-solid fa-check text-xs category-option-check opacity-0 transition-opacity duration-200" aria-hidden="true"></i>
    </button>`;
}

function renderFilterMenu() {
  const categories = [ALL_CATEGORY, ...categoryOrder];
  document.getElementById("product-filter-menu").innerHTML = categories
    .map((category, index) => categoryOptionMarkup(category, index === 0))
    .join("");
}

function updateActiveFilterBadge(category) {
  const icon = CATEGORY_ICONS[category] || "fa-solid fa-tag";
  document.getElementById("product-active-filter-icon").className = `${icon} text-[11px]`;
  document.getElementById("product-active-filter-label").textContent = category;
}

function updateFilterMenuActiveState(category) {
  document.querySelectorAll(".category-option").forEach((btn) => {
    const isActive = btn.dataset.category === category;
    btn.classList.toggle("text-primary", isActive);
    btn.classList.toggle("bg-primary/5", isActive);
    btn.classList.toggle("font-bold", isActive);
    btn.querySelector(".category-option-check").classList.toggle("opacity-100", isActive);
    btn.querySelector(".category-option-check").classList.toggle("opacity-0", !isActive);
  });
}

function renderProductView() {
  let sections;
  if (activeCategory === ALL_CATEGORY) {
    sections = Array.from(groupByCategory(allProducts).entries())
      .map(([category, items]) => categorySectionMarkup(category, items));
  } else {
    const filtered = allProducts.filter((product) => product.category === activeCategory);
    sections = [categorySectionMarkup(activeCategory, filtered)];
  }
  const container = document.getElementById("product-categories");
  container.innerHTML = sections.join("");
  window.ScrollObserver?.observeAll(container);
}

function setActiveCategory(category) {
  activeCategory = category;
  updateActiveFilterBadge(category);
  updateFilterMenuActiveState(category);
  renderProductView();
}

function showProductState(state) {
  document.getElementById("product-loading").classList.toggle("hidden", state !== "loading");
  document.getElementById("product-empty").classList.toggle("hidden", state !== "empty");
  document.getElementById("product-error").classList.toggle("hidden", state !== "error");
  document.getElementById("product-filter").classList.toggle("hidden", state !== "categories");
  document.getElementById("product-categories").classList.toggle("hidden", state !== "categories");
}

function openFilterMenu() {
  const menu = document.getElementById("product-filter-menu");
  document.getElementById("product-filter-chevron").classList.add("rotate-180");
  menu.classList.remove("hidden");
  requestAnimationFrame(() => menu.classList.remove("opacity-0", "scale-95"));
}

function closeFilterMenu() {
  const menu = document.getElementById("product-filter-menu");
  document.getElementById("product-filter-chevron").classList.remove("rotate-180");
  menu.classList.add("opacity-0", "scale-95");
  setTimeout(() => menu.classList.add("hidden"), 150);
}

function setupProductFilter() {
  const toggle = document.getElementById("product-filter-toggle");
  const menu = document.getElementById("product-filter-menu");

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    menu.classList.contains("hidden") ? openFilterMenu() : closeFilterMenu();
  });

  menu.addEventListener("click", (event) => {
    const btn = event.target.closest(".category-option");
    if (!btn) return;
    setActiveCategory(btn.dataset.category);
    closeFilterMenu();
  });

  document.addEventListener("click", (event) => {
    if (!menu.classList.contains("hidden") && !event.target.closest("#product-filter-dropdown")) closeFilterMenu();
  });
}

const PRODUCT_IMAGE_MODAL_TRANSITION_MS = 300; // keep in sync with the duration-300 classes on the modal/panel

function openProductImageModal(product) {
  const modal = document.getElementById("product-image-modal");
  const panel = document.getElementById("product-image-modal-panel");
  const image = document.getElementById("product-image-modal-image");

  image.src = product.image_url;
  image.alt = product.name;
  document.getElementById("product-image-modal-title").textContent = product.name;

  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");

  // wait a frame after un-hiding so the fade/scale-in transition actually plays
  requestAnimationFrame(() => {
    modal.classList.remove("opacity-0");
    panel.classList.remove("opacity-0", "scale-95", "translate-y-4");
  });
}

function closeProductImageModal() {
  const modal = document.getElementById("product-image-modal");
  const panel = document.getElementById("product-image-modal-panel");

  modal.classList.add("opacity-0");
  panel.classList.add("opacity-0", "scale-95", "translate-y-4");
  document.body.classList.remove("overflow-hidden");

  setTimeout(() => modal.classList.add("hidden"), PRODUCT_IMAGE_MODAL_TRANSITION_MS);
}

function setupProductImageModal() {
  const modal = document.getElementById("product-image-modal");
  document.getElementById("product-image-modal-close").addEventListener("click", closeProductImageModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeProductImageModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeProductImageModal();
  });

  document.getElementById("product-categories").addEventListener("click", (event) => {
    const card = event.target.closest("[data-product-id]");
    if (!card) return;
    const product = allProducts.find((p) => String(p.id) === card.dataset.productId);
    if (product && product.image_url) openProductImageModal(product);
  });
}

async function loadProducts() {
  showProductState("loading");
  try {
    const response = await fetch(PRODUCTS_ENDPOINT);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const products = await response.json();

    if (!Array.isArray(products) || products.length === 0) {
      showProductState("empty");
      return;
    }

    allProducts = products;
    categoryOrder = extractCategoryOrder(products);
    activeCategory = ALL_CATEGORY;

    renderFilterMenu();
    updateActiveFilterBadge(activeCategory);
    updateFilterMenuActiveState(activeCategory);
    renderProductView();
    showProductState("categories");
  } catch (error) {
    showProductState("error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupProductFilter();
  setupProductImageModal();
  loadProducts();
});
