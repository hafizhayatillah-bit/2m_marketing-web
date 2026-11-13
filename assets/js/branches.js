// About page store locator: fetch the branch list from the public API, render it as a
// directory (vertical list on desktop, swipeable cards on phones) and keep it in sync
// with numbered Leaflet pins on the map — picking either one selects the other.

const BRANCHES_ENDPOINT = "/api/v1/public/branches";
const ALL_CITIES = "Semua";
const BRANCH_FOCUS_ZOOM = 15;
const DESKTOP_QUERY = window.matchMedia("(min-width: 1024px)");
const REDUCED_MOTION_QUERY = window.matchMedia("(prefers-reduced-motion: reduce)");

const CHAT_ICON = `<i class="fi fi-brands-whatsapp" aria-hidden="true"></i>`;
const PIN_ICON = `<i class="fi fi-sr-marker" aria-hidden="true"></i>`;
const CLOCK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ADDRESS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5"/></svg>`;

let branchMap = null;
let allBranches = [];
let activeCity = ALL_CITIES;
let activeBranchId = null;
let listScrollLeft = 0; // last horizontal position seen, so programmatic resets aren't read as a swipe
const markerByBranchId = new Map();
const numberByBranchId = new Map();

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function hasValidCoords(branch) {
  return Number.isFinite(branch.latitude) && Number.isFinite(branch.longitude)
    && branch.latitude !== 0 && branch.longitude !== 0;
}

// "2M Sembako - Kecapi" -> "Kecapi": the brand prefix is noise inside a list of our own branches.
function shortBranchName(name) {
  const short = name.replace(/^\s*2M\s+Sembako\s*[-–—:]\s*/i, "").trim();
  return short || name;
}

function visibleBranches() {
  return activeCity === ALL_CITIES ? allBranches : allBranches.filter((b) => b.city === activeCity);
}

function listCities(branches) {
  const cities = [];
  branches.forEach((b) => {
    if (!cities.includes(b.city)) cities.push(b.city);
  });
  return cities;
}

function joinWithDan(words) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} dan ${words[words.length - 1]}`;
}

function showBranchState(state) {
  document.getElementById("branch-loading").classList.toggle("hidden", state !== "loading");
  document.getElementById("branch-empty").classList.toggle("hidden", state !== "empty");
  document.getElementById("branch-error").classList.toggle("hidden", state !== "error");
  document.getElementById("branch-list").classList.toggle("hidden", state !== "list");
}

function renderSummary() {
  const cities = listCities(allBranches);
  const hint = DESKTOP_QUERY.matches
    ? "Pilih cabang untuk melihat lokasinya di peta."
    : "Geser kartu atau ketuk pin untuk melihat tiap cabang.";
  document.getElementById("branch-summary").textContent =
    `${allBranches.length} cabang di ${joinWithDan(cities)}. ${hint}`;
}

function renderCityFilter() {
  const filter = document.getElementById("branch-filter");
  const cities = listCities(allBranches);
  if (cities.length < 2) return; // nothing to filter with a single city

  const chips = [ALL_CITIES, ...cities].map((city) => {
    const count = city === ALL_CITIES ? allBranches.length : allBranches.filter((b) => b.city === city).length;
    return `<button type="button" class="branch-chip" data-city="${escapeHtml(city)}" aria-pressed="${city === activeCity}">
        ${escapeHtml(city)} <span class="branch-chip__count">${count}</span>
      </button>`;
  });
  filter.innerHTML = chips.join("");
  filter.classList.remove("hidden");

  filter.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-city]");
    if (!chip || chip.dataset.city === activeCity) return;
    activeCity = chip.dataset.city;
    filter.querySelectorAll("[data-city]").forEach((el) => {
      el.setAttribute("aria-pressed", String(el.dataset.city === activeCity));
    });
    renderBranchList();
    syncMarkersToFilter();
    clearSelection();
  });
}

function branchItemMarkup(branch) {
  const number = numberByBranchId.get(branch.id);
  const numberBadge = number
    ? `<span class="branch-item__num">${number}</span>`
    : `<span class="branch-item__num">${PIN_ICON}</span>`;
  const mapsLink = branch.google_maps_url
    ? `<a href="${escapeHtml(branch.google_maps_url)}" target="_blank" rel="noopener" class="branch-action branch-action--maps">${PIN_ICON} Buka di Google Maps</a>`
    : "";
  // Only branches that have a pin can be selected on the map.
  const interactiveAttrs = number
    ? ` tabindex="0" role="button" aria-pressed="false" aria-label="Tampilkan cabang ${escapeHtml(shortBranchName(branch.name))} di peta"`
    : "";

  return `
    <article class="branch-item" data-branch-id="${branch.id}"${interactiveAttrs}>
      <div class="flex items-center gap-3">
        ${numberBadge}
        <div class="min-w-0">
          <h3 class="branch-item__name">${escapeHtml(shortBranchName(branch.name))}</h3>
          <p class="branch-item__city">${escapeHtml(branch.city)}</p>
        </div>
      </div>
      <p class="branch-item__text flex items-start gap-2 mt-3">${ADDRESS_ICON}<span>${escapeHtml(branch.address)}</span></p>
      <p class="branch-item__text flex items-start gap-2 mt-1.5">${CLOCK_ICON}<span>${escapeHtml(branch.operating_hours)}</span></p>
      <div class="branch-item__actions">
        <a href="${waLink(branch.whatsapp_number)}" target="_blank" rel="noopener" class="branch-action branch-action--wa">${CHAT_ICON} Chat WhatsApp</a>
        ${mapsLink}
      </div>
    </article>
  `;
}

function renderBranchList() {
  const list = document.getElementById("branch-list");
  list.innerHTML = visibleBranches().map(branchItemMarkup).join("");
  list.scrollTo({ left: 0, top: 0 });
  listScrollLeft = 0;
}

function pinIcon(number) {
  return L.divIcon({
    className: "",
    html: `<span class="branch-pin">${number}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    tooltipAnchor: [0, -20],
  });
}

function fitMapToVisible(animate) {
  if (!branchMap) return;
  const latLngs = visibleBranches().filter(hasValidCoords).map((b) => [b.latitude, b.longitude]);
  if (latLngs.length === 0) return;
  branchMap.fitBounds(L.latLngBounds(latLngs), {
    padding: [48, 48],
    maxZoom: 14,
    animate: animate && !REDUCED_MOTION_QUERY.matches,
  });
}

function initBranchMap() {
  const branchesWithCoords = allBranches.filter((branch) => {
    if (hasValidCoords(branch)) return true;
    console.warn(`Skipping map marker: invalid coordinates for branch id=${branch.id} name=${branch.name}`);
    return false;
  });
  if (branchesWithCoords.length === 0) return;

  // Wheel-zoom is off so scrolling the page past the map never gets hijacked;
  // pinch, double-tap and the +/- control still zoom.
  branchMap = L.map("branch-map", { scrollWheelZoom: false, zoomControl: false });
  L.control.zoom({ position: "bottomright" }).addTo(branchMap);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(branchMap);

  branchesWithCoords.forEach((branch) => {
    const marker = L.marker([branch.latitude, branch.longitude], {
      icon: pinIcon(numberByBranchId.get(branch.id)),
      title: branch.name,
      keyboard: false, // the list items are the keyboard path to each branch
    }).addTo(branchMap);
    marker.bindTooltip(escapeHtml(shortBranchName(branch.name)), { direction: "top", className: "branch-tip" });
    marker.on("click", () => selectBranch(branch.id, { scrollList: true }));
    markerByBranchId.set(branch.id, marker);
  });

  fitMapToVisible(false);

  // Rotating a phone (or resizing the window) changes the map box; Leaflet needs to be
  // told, otherwise part of the map stays blank. Re-centre on the current selection.
  let resizeTimer = null;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      branchMap.invalidateSize();
      const marker = markerByBranchId.get(activeBranchId);
      if (marker) branchMap.setView(marker.getLatLng(), BRANCH_FOCUS_ZOOM, { animate: false });
      else fitMapToVisible(false);
    }, 150);
  }).observe(document.getElementById("branch-map"));
}

function syncMarkersToFilter() {
  if (!branchMap) return;
  const visibleIds = new Set(visibleBranches().map((b) => b.id));
  markerByBranchId.forEach((marker, id) => {
    if (visibleIds.has(id)) marker.addTo(branchMap);
    else marker.remove();
  });
}

function setActiveStyles(branchId) {
  document.querySelectorAll("#branch-list [data-branch-id]").forEach((item) => {
    const isActive = Number(item.dataset.branchId) === branchId;
    item.classList.toggle("is-active", isActive);
    if (item.hasAttribute("aria-pressed")) item.setAttribute("aria-pressed", String(isActive));
  });
  markerByBranchId.forEach((marker, id) => {
    const isActive = id === branchId;
    marker.getElement()?.querySelector(".branch-pin")?.classList.toggle("is-active", isActive);
    marker.setZIndexOffset(isActive ? 1000 : 0);
    if (isActive) marker.openTooltip();
    else marker.closeTooltip();
  });
  document.getElementById("branch-reset").classList.toggle("hidden", branchId === null);
}

function selectBranch(branchId, { scrollList = false } = {}) {
  const marker = markerByBranchId.get(branchId);
  if (!branchMap || !marker) return;

  activeBranchId = branchId;
  setActiveStyles(branchId);

  if (REDUCED_MOTION_QUERY.matches) branchMap.setView(marker.getLatLng(), BRANCH_FOCUS_ZOOM, { animate: false });
  else branchMap.flyTo(marker.getLatLng(), BRANCH_FOCUS_ZOOM, { duration: 0.9 });

  if (scrollList) {
    const item = document.querySelector(`#branch-list [data-branch-id="${branchId}"]`);
    scrollListTo(item);
  }
}

// Scrolls only the list container (never the page) so the chosen branch is in view.
function scrollListTo(item) {
  if (!item) return;
  const list = document.getElementById("branch-list");
  const behavior = REDUCED_MOTION_QUERY.matches ? "auto" : "smooth";
  const listRect = list.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  if (DESKTOP_QUERY.matches) {
    const offset = itemRect.top - listRect.top - (listRect.height - itemRect.height) / 2;
    list.scrollBy({ top: offset, behavior });
  } else {
    const offset = itemRect.left - listRect.left - (listRect.width - itemRect.width) / 2;
    list.scrollBy({ left: offset, behavior });
  }
}

function clearSelection() {
  activeBranchId = null;
  setActiveStyles(null);
  fitMapToVisible(true);
}

function attachListHandlers() {
  const list = document.getElementById("branch-list");

  list.addEventListener("click", (event) => {
    if (event.target.closest("a")) return; // let WA/Maps links behave normally
    const item = event.target.closest("[data-branch-id]");
    if (!item) return;
    selectBranch(Number(item.dataset.branchId), { scrollList: true });
  });

  list.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("a")) return;
    const item = event.target.closest("[data-branch-id]");
    if (!item) return;
    event.preventDefault();
    selectBranch(Number(item.dataset.branchId), { scrollList: true });
  });

  // Phones: swiping the cards moves the map to whichever card settles in the middle.
  // Only reacts to a real horizontal swipe, so the page scrolling by never moves the map.
  let settleTimer = null;
  list.addEventListener("scroll", () => {
    if (DESKTOP_QUERY.matches || list.scrollLeft === listScrollLeft) return;
    listScrollLeft = list.scrollLeft;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const center = list.getBoundingClientRect().left + list.clientWidth / 2;
      let nearest = null;
      let nearestDistance = Infinity;
      list.querySelectorAll("[data-branch-id]").forEach((item) => {
        const rect = item.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - center);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = item;
        }
      });
      const nearestId = nearest ? Number(nearest.dataset.branchId) : null;
      if (nearestId !== null && nearestId !== activeBranchId) selectBranch(nearestId);
    }, 140);
  }, { passive: true });

  document.getElementById("branch-reset").addEventListener("click", clearSelection);
  DESKTOP_QUERY.addEventListener("change", renderSummary);
}

async function loadBranches() {
  showBranchState("loading");
  try {
    const response = await fetch(BRANCHES_ENDPOINT);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const branches = await response.json();

    if (!Array.isArray(branches) || branches.length === 0) {
      showBranchState("empty");
      return;
    }

    allBranches = branches;
    // Sequential numbers only for branches with valid coordinates, so the number
    // on a list item always matches a pin that is actually on the map.
    let next = 0;
    allBranches.forEach((branch) => {
      if (hasValidCoords(branch)) numberByBranchId.set(branch.id, (next += 1));
    });

    renderSummary();
    renderCityFilter();
    renderBranchList();
    showBranchState("list");

    initBranchMap();
    attachListHandlers();
  } catch (error) {
    showBranchState("error");
  }
}

document.addEventListener("DOMContentLoaded", loadBranches);
