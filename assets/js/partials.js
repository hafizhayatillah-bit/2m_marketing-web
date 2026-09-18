// Fetch-injects the shared header/footer partials and wires up nav behaviour.
// Every page must set <body data-page="home|product|about|contact|news">.

const ACTIVE_CLASSES = ["text-primary", "border-b-2", "border-primary"];

async function injectPartial(targetSelector, url) {
  const target = document.querySelector(targetSelector);
  if (!target) return;
  const response = await fetch(url);
  // Unwrap the placeholder div: a fixed <header> stuck inside a wrapper div
  // still renders fine visually, but replacing the wrapper itself keeps
  // <header> a direct child of <body>, matching how the rest of the DOM expects it.
  target.outerHTML = await response.text();
}

function setupTransparentHeader() {
  const header = document.querySelector("header");
  const hero = document.getElementById("hero-slider");
  if (!header || !hero || document.body.dataset.page !== "home") return;

  const SCROLL_THRESHOLD = 40; // px scrolled before the header switches to its solid state
  const updateHeaderState = () => {
    header.classList.toggle("header--transparent", window.scrollY < SCROLL_THRESHOLD);
  };
  updateHeaderState();
  window.addEventListener("scroll", updateHeaderState, { passive: true });
}

function highlightActiveNavLink() {
  const currentPage = document.body.dataset.page;
  document.querySelectorAll("[data-nav-link]").forEach((link) => {
    const isActive = link.dataset.navLink === currentPage;
    link.classList.toggle("text-primary", isActive);
    link.classList.toggle("border-b-2", isActive);
    link.classList.toggle("border-primary", isActive);
    if (!isActive) link.classList.add("text-ink");
  });
}

function applyWaLinks() {
  document.querySelectorAll("[data-wa-link]").forEach((link) => {
    link.href = `https://wa.me/${WA_NUMBER}`;
  });
}

function setupMobileMenu() {
  const toggleBtn = document.getElementById("mobile-menu-toggle");
  const menu = document.getElementById("mobile-menu");
  if (!toggleBtn || !menu) return;

  toggleBtn.addEventListener("click", () => {
    const isOpen = menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !isOpen);
    toggleBtn.setAttribute("aria-expanded", String(isOpen));
    const icon = toggleBtn.querySelector("iconify-icon");
    icon.setAttribute("icon", isOpen ? "lucide:x" : "lucide:menu");
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([
    injectPartial("#site-header", "/partials/header.html"),
    injectPartial("#site-footer", "/partials/footer.html"),
  ]);
  highlightActiveNavLink();
  setupMobileMenu();
  applyWaLinks();
  setupTransparentHeader();
});
