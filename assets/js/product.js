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
    ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">`
    : `<div class="w-full h-full flex items-center justify-center"><iconify-icon icon="lucide:image" width="32" class="text-ink-muted"></iconify-icon></div>`;
  const description = product.description
    ? `<p class="font-body text-sm text-ink-muted mt-1">${escapeHtml(product.description)}</p>`
    : "";

  return `
    <article class="group bg-surface rounded-2xl border border-ink/10 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-1 transition-all">
      <div class="aspect-square bg-canvas overflow-hidden">${image}</div>
      <div class="p-4">
        <h3 class="font-display font-bold uppercase tracking-tight text-lg text-ink">${escapeHtml(product.name)}</h3>
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
  loadProducts();
});
