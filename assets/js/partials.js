// Fetch-injects the shared header/footer partials and wires up nav behaviour.
// Every page must set <body data-page="home|product|about|contact|news">.

// Bump together with the ?v= on the <link>/<script> tags whenever the partials change,
// so returning visitors don't get a cached header/footer next to new CSS.
const PARTIALS_VERSION = "20261114";

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
    // An open mobile menu always needs the solid bar above it, even at the top of the page.
    const menuOpen = header.dataset.menuOpen === "true";
    header.classList.toggle("header--transparent", window.scrollY < SCROLL_THRESHOLD && !menuOpen);
  };
  updateHeaderState();
  window.addEventListener("scroll", updateHeaderState, { passive: true });
  header.addEventListener("mobile-menu-change", updateHeaderState);
}

function highlightActiveNavLink() {
  const currentPage = document.body.dataset.page;
  document.querySelectorAll("[data-nav-link]").forEach((link) => {
    const isActive = link.dataset.navLink === currentPage;
    if (isActive) link.setAttribute("aria-current", "page");

    // Mobile rows already have a divider line, so the active one is marked with
    // colour plus a dot instead of the desktop underline.
    if (link.hasAttribute("data-nav-mobile")) {
      if (!isActive) return;
      link.classList.remove("text-white/80");
      link.classList.add("text-white");
      link.insertAdjacentHTML("beforeend", '<span class="w-2 h-2 rounded-full bg-accent" aria-hidden="true"></span>');
      return;
    }

    link.classList.toggle("text-accent", isActive);
    link.classList.toggle("border-b-2", isActive);
    link.classList.toggle("border-accent", isActive);
    if (!isActive) link.classList.add("text-white/80");
  });
}

function applyWaLinks() {
  document.querySelectorAll("[data-wa-link]").forEach((link) => {
    link.href = `https://wa.me/${WA_NUMBER}`;
  });
}

function setupMobileMenu() {
  const header = document.querySelector("header");
  const toggleBtn = document.getElementById("mobile-menu-toggle");
  const menu = document.getElementById("mobile-menu");
  if (!header || !toggleBtn || !menu) return;

  const setOpen = (isOpen) => {
    menu.classList.toggle("hidden", !isOpen);
    toggleBtn.setAttribute("aria-expanded", String(isOpen));
    toggleBtn.setAttribute("aria-label", isOpen ? "Tutup menu" : "Buka menu");
    toggleBtn.querySelector('[data-menu-icon="open"]').classList.toggle("hidden", isOpen);
    toggleBtn.querySelector('[data-menu-icon="close"]').classList.toggle("hidden", !isOpen);
    header.dataset.menuOpen = String(isOpen);
    header.dispatchEvent(new Event("mobile-menu-change"));
  };
  const isOpen = () => !menu.classList.contains("hidden");

  toggleBtn.addEventListener("click", () => setOpen(!isOpen()));

  // Tapping outside the header, pressing Escape, or rotating to a desktop width closes it.
  document.addEventListener("click", (event) => {
    if (isOpen() && !event.target.closest("header")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      setOpen(false);
      toggleBtn.focus();
    }
  });
  window.matchMedia("(min-width: 768px)").addEventListener("change", (event) => {
    if (event.matches && isOpen()) setOpen(false);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([
    injectPartial("#site-header", `/partials/header.html?v=${PARTIALS_VERSION}`),
    injectPartial("#site-footer", `/partials/footer.html?v=${PARTIALS_VERSION}`),
  ]);
  highlightActiveNavLink();
  applyWaLinks();
  setupTransparentHeader();
  setupMobileMenu();
});
