// Article page (/news/<id>): loads one news/event item from the public API and renders
// it as a full page, with a way back to the /news list and a few other articles below.

const NEWS_DETAIL_ENDPOINT = "/api/v1/public/news";
const MORE_NEWS_COUNT = 3;
const SITE_URL = "https://2msembako.id";

function newsIdFromPath() {
  const match = window.location.pathname.match(/^\/news\/(\d+)\/?$/);
  return match ? match[1] : null;
}

function showArticleState(state) {
  document.getElementById("article-skeleton").classList.toggle("hidden", state !== "loading");
  document.getElementById("article-body-skeleton").classList.toggle("hidden", state !== "loading");
  document.getElementById("article-header").classList.toggle("hidden", state !== "ready");
  document.getElementById("article-main").classList.toggle("hidden", state !== "ready");
  document.getElementById("article-missing").classList.toggle("hidden", state !== "missing");
  document.getElementById("article-error").classList.toggle("hidden", state !== "error");
}

function setMeta(item) {
  const url = `${SITE_URL}/news/${item.id}`;
  document.title = `${item.title} — 2M Sembako`;
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", url);
  if (item.excerpt) document.querySelector('meta[name="description"]')?.setAttribute("content", item.excerpt);
}

function renderArticle(item) {
  setMeta(item);

  const dateEl = document.getElementById("article-date");
  dateEl.textContent = formatEventDate(item.event_date);
  dateEl.setAttribute("datetime", item.event_date);

  const tagEl = document.getElementById("article-tag");
  tagEl.textContent = item.tag || "";
  tagEl.classList.toggle("hidden", !item.tag);

  document.getElementById("article-title").textContent = item.title;

  const imageWrap = document.getElementById("article-image-wrap");
  if (item.image_url) {
    const image = document.getElementById("article-image");
    image.src = item.image_url;
    image.alt = item.title;
    imageWrap.classList.remove("hidden");
  }

  // Sanitize CMS-authored HTML before injecting to guard against stored XSS.
  document.getElementById("article-content").innerHTML = DOMPurify.sanitize(item.content);

  const shareText = `${item.title} ${SITE_URL}/news/${item.id}`;
  document.getElementById("article-share").href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  showArticleState("ready");
}

async function loadMoreNews(currentId) {
  try {
    const response = await fetch(NEWS_DETAIL_ENDPOINT);
    if (!response.ok) return;
    const data = await response.json();
    const others = (Array.isArray(data) ? data : [])
      .filter((item) => String(item.id) !== String(currentId))
      .sort((a, b) => b.event_date.localeCompare(a.event_date))
      .slice(0, MORE_NEWS_COUNT);
    if (others.length === 0) return;

    const grid = document.getElementById("more-news-grid");
    grid.innerHTML = others.map((item, index) => newsCardMarkup(item, index)).join("");
    document.getElementById("more-news").classList.remove("hidden");
    window.ScrollObserver?.observeAll(grid);
  } catch (error) {
    // The "other articles" strip is optional; the article itself still works without it.
  }
}

async function loadArticle() {
  const newsId = newsIdFromPath();
  if (!newsId) {
    showArticleState("missing");
    return;
  }

  showArticleState("loading");
  try {
    const response = await fetch(`${NEWS_DETAIL_ENDPOINT}/${newsId}`);
    if (response.status === 404) {
      showArticleState("missing");
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderArticle(await response.json());
    loadMoreNews(newsId);
  } catch (error) {
    showArticleState("error");
  }
}

document.addEventListener("DOMContentLoaded", loadArticle);
