// Product page: fetch products once, group by category, and filter client-side via tabs.

const PRODUCTS_ENDPOINT = "/api/v1/public/products";
const ALL_CATEGORY = "Semua";

let allProducts = [];
let categoryOrder = [];
let activeCategory = ALL_CATEGORY;

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

function productCardMarkup(product) {
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

  return `
    <article data-product-id="${product.id}" class="group cursor-pointer bg-surface rounded-2xl border border-ink/10 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/30">
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
        ${products.map(productCardMarkup).join("")}
      </div>
    </div>
  `;
}

function categoryTabMarkup(category) {
  const isActive = category === activeCategory;
  const stateClasses = isActive
    ? "bg-primary text-white"
    : "bg-surface text-ink-muted border border-canvas hover:text-primary";
  return `<button type="button" class="category-tab shrink-0 rounded-full px-5 py-2 font-display font-bold uppercase tracking-wide text-sm transition-colors ${stateClasses}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`;
}

function renderFilterTabs() {
  const tabs = [ALL_CATEGORY, ...categoryOrder];
  document.getElementById("product-filter").innerHTML = tabs.map(categoryTabMarkup).join("");
}

function updateTabStyles() {
  document.querySelectorAll(".category-tab").forEach((btn) => {
    const isActive = btn.dataset.category === activeCategory;
    btn.classList.toggle("bg-primary", isActive);
    btn.classList.toggle("text-white", isActive);
    btn.classList.toggle("bg-surface", !isActive);
    btn.classList.toggle("text-ink-muted", !isActive);
    btn.classList.toggle("border", !isActive);
    btn.classList.toggle("border-canvas", !isActive);
    btn.classList.toggle("hover:text-primary", !isActive);
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
  document.getElementById("product-categories").innerHTML = sections.join("");
}

function setActiveCategory(category) {
  activeCategory = category;
  updateTabStyles();
  renderProductView();
}

function showProductState(state) {
  document.getElementById("product-loading").classList.toggle("hidden", state !== "loading");
  document.getElementById("product-empty").classList.toggle("hidden", state !== "empty");
  document.getElementById("product-error").classList.toggle("hidden", state !== "error");
  document.getElementById("product-filter").classList.toggle("hidden", state !== "categories");
  document.getElementById("product-categories").classList.toggle("hidden", state !== "categories");
}

function setupFilterTabClicks() {
  document.getElementById("product-filter").addEventListener("click", (event) => {
    const btn = event.target.closest(".category-tab");
    if (!btn) return;
    setActiveCategory(btn.dataset.category);
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

    renderFilterTabs();
    renderProductView();
    showProductState("categories");
  } catch (error) {
    showProductState("error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupFilterTabClicks();
  setupProductImageModal();
  loadProducts();
});
