// Reusable scroll-reveal engine: finds every [data-animate] element and adds
// .is-visible (see the [data-animate] rules in src/input.css) once it enters the
// viewport, then stops observing so each element only plays its animation once.
//
// Static markup is picked up automatically on DOMContentLoaded. Pages that inject
// markup after a fetch (product.js, home.js, news.js, branches.js) must call
// `window.ScrollObserver.observeAll(container)` right after setting .innerHTML so
// the newly-added [data-animate] elements get observed too.
(function () {
  const SELECTOR = "[data-animate]";
  const ROOT_MARGIN = "0px 0px -10% 0px";
  const THRESHOLD = 0.15;

  const supportsObserver = "IntersectionObserver" in window;

  const observer = supportsObserver
    ? new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          });
        },
        { root: null, rootMargin: ROOT_MARGIN, threshold: THRESHOLD }
      )
    : null;

  function observeAll(root) {
    const scope = root || document;
    const elements = scope.querySelectorAll
      ? scope.querySelectorAll(SELECTOR)
      : document.querySelectorAll(SELECTOR);

    elements.forEach((el) => {
      if (el.classList.contains("is-visible")) return;
      // No IntersectionObserver support (very old browser): just reveal immediately.
      if (!observer) {
        el.classList.add("is-visible");
        return;
      }
      observer.observe(el);
    });
  }

  document.addEventListener("DOMContentLoaded", () => observeAll());

  window.ScrollObserver = { observeAll };
})();
