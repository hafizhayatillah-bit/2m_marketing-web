// Full-page loading screen: visible immediately on load, fades out once the
// page is ready, and fades back in on same-origin link clicks so navigating
// between pages (this is a classic multi-page site, not an SPA) doesn't cut
// hard from one page to the next.
const PAGE_LOADER_NAV_DELAY = 250;
const PAGE_LOADER_MAX_WAIT = 4000;
const PAGE_LOADER_MIN_DISPLAY = 1000;

// Timestamp the loader became visible so every page shows it for at least
// PAGE_LOADER_MIN_DISPLAY, regardless of how fast/slow that page loads.
const pageLoaderShownAt = Date.now();

function hidePageLoader() {
  const loader = document.getElementById("page-loader");
  if (!loader) return;
  const remaining = PAGE_LOADER_MIN_DISPLAY - (Date.now() - pageLoaderShownAt);
  setTimeout(() => loader.classList.add("page-loader--hidden"), Math.max(0, remaining));
}

function hidePageLoaderNow() {
  const loader = document.getElementById("page-loader");
  if (loader) loader.classList.add("page-loader--hidden");
}

function showPageLoader() {
  const loader = document.getElementById("page-loader");
  if (loader) loader.classList.remove("page-loader--hidden");
}

function isInPageAnchor(link, url) {
  return url.pathname === window.location.pathname && url.hash !== "";
}

function setupPageTransitions() {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

    let url;
    try {
      url = new URL(link.href, window.location.href);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin || isInPageAnchor(link, url)) return;

    event.preventDefault();
    showPageLoader();
    setTimeout(() => {
      window.location.href = link.href;
    }, PAGE_LOADER_NAV_DELAY);
  });

  // bfcache restores the page instantly without firing "load" again; skip
  // the minimum-display wait since the page was already fully rendered before.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) hidePageLoaderNow();
  });
}

window.addEventListener("load", hidePageLoader);
setTimeout(hidePageLoader, PAGE_LOADER_MAX_WAIT);
document.addEventListener("DOMContentLoaded", setupPageTransitions);
