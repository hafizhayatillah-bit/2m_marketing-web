// About page: fetch branch list from the public API, render a flat grid, and
// sync each card with a numbered Leaflet marker on the map below it.

const BRANCHES_ENDPOINT = "/api/v1/public/branches";

const CTA_BASE = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-display font-bold uppercase tracking-wide transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md";
const CTA_WA_CLASS = `${CTA_BASE} bg-primary text-white hover:bg-secondary`;
const CTA_MAPS_CLASS = `${CTA_BASE} bg-canvas text-ink hover:bg-ink/10 border border-ink/10`;

const CHAT_ICON_SVG = `<i class="fi fi-brands-whatsapp" aria-hidden="true"></i>`;
const PIN_ICON_SVG = `<i class="fi fi-sr-marker" aria-hidden="true"></i>`;
const CLOCK_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Populated once the map is initialized, keyed by branch id for card <-> marker sync.
let branchMap = null;
const markerByBranchId = new Map();

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function hasValidCoords(branch) {
  return Number.isFinite(branch.latitude) && Number.isFinite(branch.longitude)
    && branch.latitude !== 0 && branch.longitude !== 0;
}

// Most common operating_hours value, used to avoid repeating it on every card.
function computeDefaultHours(branches) {
  const counts = new Map();
  branches.forEach((b) => counts.set(b.operating_hours, (counts.get(b.operating_hours) || 0) + 1));
  let defaultHours = null;
  let maxCount = 0;
  counts.forEach((count, hours) => {
    if (count > maxCount) {
      maxCount = count;
      defaultHours = hours;
    }
  });
  return defaultHours;
}

function renderDefaultHoursNote(defaultHours) {
  const el = document.getElementById("branch-hours-default");
  if (!el || !defaultHours) return;
  el.textContent = `Jam operasional seluruh cabang: ${defaultHours} (kecuali disebutkan lain per cabang).`;
  el.classList.remove("hidden");
}

// Sequential marker numbers, assigned only to branches with valid coordinates,
// so card badges stay in sync with the pins actually drawn on the map.
function assignMarkerNumbers(branches) {
  const numbers = new Map();
  let next = 0;
  branches.forEach((branch) => {
    if (hasValidCoords(branch)) {
      next += 1;
      numbers.set(branch.id, next);
    }
  });
  return numbers;
}

function branchCardMarkup(branch, markerNumber, defaultHours) {
  const hoursLine = branch.operating_hours !== defaultHours
    ? `<p class="font-body text-sm text-ink-muted mt-2">${escapeHtml(branch.operating_hours)}</p>`
    : "";

  const mapsLink = branch.google_maps_url
    ? `<a href="${escapeHtml(branch.google_maps_url)}" target="_blank" rel="noopener" class="${CTA_MAPS_CLASS}">${PIN_ICON_SVG} Lihat di Google Maps</a>`
    : "";

  // Only branches with a marker on the map are clickable/focusable for the card <-> pin sync.
  const interactiveAttrs = markerNumber
    ? ` data-branch-id="${branch.id}" tabindex="0" role="button" aria-label="Lihat lokasi cabang ini di peta"`
    : "";
  const interactiveClasses = markerNumber ? " cursor-pointer" : "";

  return `
    <article class="group relative flex flex-col h-full bg-surface rounded-2xl border border-ink/10 shadow-sm p-6 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-primary/30${interactiveClasses}"${interactiveAttrs}>
      <div class="flex items-center gap-2.5">
        <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary shrink-0 transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
          ${PIN_ICON_SVG}
        </span>
        <span class="inline-block bg-canvas text-ink-muted text-xs font-body px-2.5 py-1 rounded-full">${escapeHtml(branch.city)}</span>
      </div>
      <h3 class="font-display font-bold uppercase tracking-tight text-lg text-ink mt-3">${escapeHtml(branch.name)}</h3>
      <p class="font-body text-sm text-ink-muted mt-1.5 leading-relaxed">${escapeHtml(branch.address)}</p>
      ${hoursLine}
      <div class="flex-grow"></div>
      <div class="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-ink/10">
        <a href="${waLink(branch.whatsapp_number)}" target="_blank" rel="noopener" class="${CTA_WA_CLASS}">${CHAT_ICON_SVG} Chat via WhatsApp</a>
        ${mapsLink}
      </div>
    </article>
  `;
}

function showBranchState(state) {
  document.getElementById("branch-loading").classList.toggle("hidden", state !== "loading");
  document.getElementById("branch-empty").classList.toggle("hidden", state !== "empty");
  document.getElementById("branch-error").classList.toggle("hidden", state !== "error");
  document.getElementById("branch-grid").classList.toggle("hidden", state !== "grid");
}

function pinMarkerIcon() {
  return L.divIcon({
    className: "",
    html: `<i class="fi fi-sr-marker text-primary drop-shadow" style="font-size: 28px;" aria-hidden="true"></i>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
}

function branchPopupMarkup(branch) {
  return `
    <div class="min-w-[200px] max-w-[240px] font-body">
      <h4 class="font-display font-bold uppercase tracking-tight text-sm text-ink leading-snug">${escapeHtml(branch.name)}</h4>
      <div class="flex items-start gap-1.5 mt-1.5 text-xs text-ink-muted leading-snug">
        ${PIN_ICON_SVG}
        <span>${escapeHtml(branch.address)}</span>
      </div>
      <div class="flex items-center gap-1.5 mt-1.5 text-xs text-ink-muted">
        ${CLOCK_ICON_SVG}
        <span>${escapeHtml(branch.operating_hours)}</span>
      </div>
    </div>
  `;
}

function initBranchMap(branches) {
  const validBranches = branches.filter((branch) => {
    if (hasValidCoords(branch)) return true;
    console.warn(`Skipping map marker: invalid coordinates for branch id=${branch.id} name=${branch.name}`);
    return false;
  });

  if (validBranches.length === 0) return;

  branchMap = L.map("branch-map");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(branchMap);

  const latLngs = validBranches.map((branch) => [branch.latitude, branch.longitude]);

  validBranches.forEach((branch) => {
    const marker = L.marker([branch.latitude, branch.longitude], {
      icon: pinMarkerIcon(),
    }).addTo(branchMap);
    marker.bindPopup(branchPopupMarkup(branch));
    markerByBranchId.set(branch.id, marker);
  });

  // Auto-fit to whatever branches exist instead of a hardcoded center/zoom.
  branchMap.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24], maxZoom: 15 });
}

function focusBranchOnMap(branchId) {
  const marker = markerByBranchId.get(branchId);
  if (!branchMap || !marker) return;
  // animate:false — Leaflet's zoom-animation path can silently skip the zoom change
  // right after fitBounds(); disabling it keeps the pan+zoom deterministic.
  branchMap.setView(marker.getLatLng(), 15, { animate: false });
  marker.openPopup();
}

function attachCardClickHandlers() {
  const grid = document.getElementById("branch-grid");

  grid.addEventListener("click", (event) => {
    if (event.target.closest("a")) return; // let WA/Maps links behave normally
    const card = event.target.closest("[data-branch-id]");
    if (!card) return;
    focusBranchOnMap(Number(card.dataset.branchId));
  });

  grid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-branch-id]");
    if (!card) return;
    event.preventDefault();
    focusBranchOnMap(Number(card.dataset.branchId));
  });
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

    const defaultHours = computeDefaultHours(branches);
    renderDefaultHoursNote(defaultHours);

    const markerNumbers = assignMarkerNumbers(branches);
    document.getElementById("branch-grid").innerHTML = branches
      .map((branch) => branchCardMarkup(branch, markerNumbers.get(branch.id), defaultHours))
      .join("");
    showBranchState("grid");

    initBranchMap(branches);
    attachCardClickHandlers();
  } catch (error) {
    showBranchState("error");
  }
}

document.addEventListener("DOMContentLoaded", loadBranches);
