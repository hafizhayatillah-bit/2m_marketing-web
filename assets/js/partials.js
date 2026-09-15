// Fetch-injects the shared header/footer partials and wires up nav behaviour.
// Every page must set <body data-page="home|product|about|contact|news">.

const ACTIVE_CLASSES = ["text-primary", "border-b-2", "border-primary"];

async function injectPartial(targetSelector, url) {
  const target = document.querySelector(targetSelector);
  if (!target) return;
  const response = await fetch(url);
  target.innerHTML = await response.text();
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
});
