// ============================================================
// SFWX — Content Script (Overlay Architecture)
//
// Instead of fighting Twitter's DOM, we:
//  1. Hide Twitter's entire UI (keep it alive for data + infinite scroll)
//  2. Build a clean GitHub-like overlay from scratch
//  3. Extract tweet data → render as commit rows
// ============================================================

(function () {
  "use strict";

  // ================================================================
  // Constants
  // ================================================================
  const SETTINGS_DEFAULTS = { orgName: "dev", repoName: "backend", branchName: "dev" };
  const POLL_INTERVAL_MS = 800;
  const IDENTICON_REVEAL_MS = 4000;
  const IDENTICON_FLIP_MS = 150;
  const VERIFIED_THRESHOLD = 0.6;
  const CI_THRESHOLD = 0.5;
  const MUTED_COLORS = ["#6a9fb5","#8b7d6b","#7b8d6f","#9b8bb4","#b08d6a","#6b8fa3","#8d7b7b","#7d8f6b"];

  // ================================================================
  // Settings
  // ================================================================
  let settings = { ...SETTINGS_DEFAULTS };

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["orgName", "repoName", "branchName"], (result) => {
        if (result.orgName) settings.orgName = result.orgName;
        if (result.repoName) settings.repoName = result.repoName;
        if (result.branchName) settings.branchName = result.branchName;
        resolve(settings);
      });
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !isActive) return;
    if (changes.orgName) settings.orgName = changes.orgName.newValue;
    if (changes.repoName) settings.repoName = changes.repoName.newValue;
    if (changes.branchName) settings.branchName = changes.branchName.newValue;
    refreshSettingsUI();
  });

  function refreshSettingsUI() {
    const ownerEl = overlay?.querySelector(".gh-header-owner");
    const repoEl = overlay?.querySelector(".gh-header-reponame");
    const branchEl = overlay?.querySelector(".gh-branch-name");
    if (ownerEl) ownerEl.textContent = settings.orgName;
    if (repoEl) repoEl.textContent = settings.repoName;
    if (branchEl) branchEl.textContent = settings.branchName;
    disguiseUrl();
    // Update nav tab links if they exist
    const base = `https://github.com/${encodeURIComponent(settings.orgName)}/${encodeURIComponent(settings.repoName)}`;
    overlay?.querySelectorAll(".gh-tab-link").forEach(tab => {
      tab.href = base + (tab.dataset.ghPath || "");
    });
  }

  // ================================================================
  // URL disguise — make address bar look like a repo path
  // ================================================================
  let originalUrl = null;

  function disguiseUrl() {
    if (!originalUrl) originalUrl = location.href;
    const fakePath = `/${encodeURIComponent(settings.orgName)}/${encodeURIComponent(settings.repoName)}/commits/${encodeURIComponent(settings.branchName)}`;
    history.replaceState(null, "", fakePath);
  }

  function restoreUrl() {
    if (originalUrl) {
      history.replaceState(null, "", originalUrl);
      originalUrl = null;
    }
  }

  // ================================================================
  // Utilities
  // ================================================================
  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function generateHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return Math.abs(h).toString(16).padStart(7, "0").substring(0, 7);
  }

  function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function relativeTime(datetime) {
    if (!datetime) return "recently";
    const date = new Date(datetime);
    const diffMs = Date.now() - date;
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
    if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
    if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
    if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) !== 1 ? "s" : ""} ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function dateLabel(datetime) {
    if (!datetime) return null;
    return new Date(datetime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function generateIdenticonSVG(seed) {
    const color = MUTED_COLORS[Math.abs(seed) % MUTED_COLORS.length];
    let cells = "";
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (seededRandom(seed * 100 + row * 10 + col) > 0.5) {
          cells += `<rect x="${col*4+2}" y="${row*4+2}" width="4" height="4" fill="${color}"/>`;
          if (col < 2) cells += `<rect x="${(4-col)*4+2}" y="${row*4+2}" width="4" height="4" fill="${color}"/>`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><rect width="24" height="24" fill="#2d333b" rx="2"/>${cells}</svg>`;
  }

  // ================================================================
  // SVG Icons (GitHub Octicons)
  // ================================================================
  const ICONS = {
    octocat: `<svg height="32" viewBox="0 0 16 16" width="32"><path fill="white" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`,
    hamburger: `<svg width="16" height="16" viewBox="0 0 16 16" fill="white"><path d="M1 2.75A.75.75 0 011.75 2h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 2.75zm0 5A.75.75 0 011.75 7h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 7.75zM1.75 12h12.5a.75.75 0 010 1.5H1.75a.75.75 0 010-1.5z"/></svg>`,
    branch: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 3.25a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.493 2.493 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zm-6 0a.75.75 0 101.5 0 .75.75 0 00-1.5 0zm8.25-.75a.75.75 0 100 1.5.75.75 0 000-1.5zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5z"/></svg>`,
    commit: `<svg width="16" height="16" viewBox="0 0 16 16" fill="#7d8590"><path d="M11.93 8.5a4.002 4.002 0 01-7.86 0H.75a.75.75 0 010-1.5h3.32a4.002 4.002 0 017.86 0h3.32a.75.75 0 010 1.5zM10.5 7.75a2.5 2.5 0 10-5 0 2.5 2.5 0 005 0z"/></svg>`,
    check: `<svg width="12" height="12" viewBox="0 0 16 16" fill="#3fb950"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>`,
    copy: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25z"/></svg>`,
    browse: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.25 7a.75.75 0 01.75.75v5.5A1.75 1.75 0 0112.25 15h-9.5A1.75 1.75 0 011 13.25v-9.5C1 2.784 1.784 2 2.75 2h5.5a.75.75 0 010 1.5h-5.5a.25.25 0 00-.25.25v9.5c0 .138.112.25.25.25h9.5a.25.25 0 00.25-.25v-5.5a.75.75 0 01.75-.75zm-1-6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V3.56L8.28 6.78a.75.75 0 01-1.06-1.06L10.44 2.5H8.75a.75.75 0 010-1.5z"/></svg>`,
    expand: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="transition:transform 0.2s"><path d="m4.177 7.823 3.396-3.396A.25.25 0 018 4.646v6.708a.25.25 0 01-.427.177L4.177 8.177a.25.25 0 010-.354z"/></svg>`,
    code: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="m11.28 3.22 4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.749.749 0 01-1.06-1.06L13.94 8l-3.72-3.72a.749.749 0 011.06-1.06zm-6.56 0a.751.751 0 011.042.018.751.751 0 01.018 1.042L2.06 8l3.72 3.72a.749.749 0 01-1.06 1.06L.47 8.53a.75.75 0 010-1.06z"/></svg>`,
    issues: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/><path d="M8 0a8 8 0 110 16A8 8 0 018 0zM1.5 8a6.5 6.5 0 1013 0 6.5 6.5 0 00-13 0z"/></svg>`,
    pr: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zm5.677-.177L9.573.677A.25.25 0 0110 .854V2.5h1A2.5 2.5 0 0113.5 5v5.628a2.251 2.251 0 11-1.5 0V5a1 1 0 00-1-1h-1v1.646a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm0 9.5a.75.75 0 100 1.5.75.75 0 000-1.5zm8.25.75a.75.75 0 101.5 0 .75.75 0 00-1.5 0z"/></svg>`,
    actions: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zM1.5 8a6.5 6.5 0 1013 0 6.5 6.5 0 00-13 0zm4.879-2.773 4.264 2.559a.25.25 0 010 .428l-4.264 2.559A.25.25 0 016 10.559V5.442a.25.25 0 01.379-.215z"/></svg>`,
    projects: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75C0 .784.784 0 1.75 0zM1.5 1.75v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H1.75a.25.25 0 00-.25.25zM11.75 3a.75.75 0 01.75.75v7.5a.75.75 0 01-1.5 0v-7.5a.75.75 0 01.75-.75zm-8.25.75a.75.75 0 011.5 0v5.5a.75.75 0 01-1.5 0zM8 3a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 3z"/></svg>`,
    wiki: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25zM4 4h8v1.5H4zm0 3h8v1.5H4zm0 3h4v1.5H4z"/></svg>`,
    security: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.467.133a1.748 1.748 0 011.066 0l5.25 1.68A1.75 1.75 0 0115 3.48V7c0 1.566-.32 3.182-1.303 4.682-.983 1.498-2.585 2.813-5.032 3.855a1.697 1.697 0 01-1.33 0c-2.447-1.042-4.049-2.357-5.032-3.855C1.32 10.182 1 8.566 1 7V3.48a1.75 1.75 0 011.217-1.667zm.61 1.429a.25.25 0 00-.153 0l-5.25 1.68a.25.25 0 00-.174.238V7c0 1.358.275 2.666 1.057 3.86.784 1.194 2.121 2.34 4.366 3.297a.196.196 0 00.154 0c2.245-.956 3.582-2.104 4.366-3.298C13.225 9.666 13.5 8.36 13.5 7V3.48a.251.251 0 00-.174-.237z"/></svg>`,
    insights: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1.75V13.5h13.75a.75.75 0 010 1.5H.75a.75.75 0 01-.75-.75V1.75a.75.75 0 011.5 0zm14.28 2.53-5.25 5.25a.75.75 0 01-1.06 0L7 7.06 4.28 9.78a.751.751 0 01-1.06-1.06l3.25-3.25a.75.75 0 011.06 0L10 7.94l4.72-4.72a.751.751 0 011.06 1.06z"/></svg>`,
    settings: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8.2 8.2 0 01.701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.1-.303c.652-.18 1.34.03 1.73.545a8.042 8.042 0 011.088 1.89c.238.572.1 1.25-.36 1.676l-.807.806c-.05.048-.098.147-.088.294a6.7 6.7 0 010 .772c-.01.147.038.246.088.294l.814.814c.458.425.596 1.103.357 1.676a8.045 8.045 0 01-1.088 1.89c-.39.516-1.078.725-1.73.545l-1.1-.303c-.066-.019-.176-.011-.299.071a5.845 5.845 0 01-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.206 8.206 0 01-1.402 0c-.743-.064-1.29-.614-1.458-1.26l-.29-1.106c-.017-.066-.078-.158-.211-.224a5.862 5.862 0 01-.668-.386c-.123-.082-.233-.09-.3-.071l-1.099.303c-.652.18-1.34-.029-1.73-.545a8.042 8.042 0 01-1.088-1.89c-.239-.572-.1-1.251.357-1.676l.814-.814c.05-.048.098-.147.088-.294a6.7 6.7 0 010-.772c.01-.147-.038-.246-.088-.294L.83 7.822c-.458-.425-.596-1.104-.357-1.676A8.042 8.042 0 011.56 4.256c.39-.516 1.078-.726 1.73-.545l1.1.303c.066.019.175.011.298-.071.214-.143.437-.272.668-.386.133-.066.194-.158.212-.224L5.84 1.29c.168-.645.715-1.196 1.458-1.26A8.207 8.207 0 018 0zM5.5 8a2.5 2.5 0 105 0 2.5 2.5 0 00-5 0z"/></svg>`,
    bell: `<svg width="16" height="16" viewBox="0 0 16 16" fill="white" opacity="0.7"><path d="M8 16a2 2 0 001.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 008 16zM3 5a5 5 0 0110 0v2.947c0 .05.015.098.042.139l1.703 2.555A1.519 1.519 0 0113.482 13H2.518a1.516 1.516 0 01-1.263-2.36l1.703-2.554A.255.255 0 003 7.947zm5-3.5A3.5 3.5 0 004.5 5v2.947c0 .346-.102.683-.294.97l-1.703 2.556a.017.017 0 00-.003.01l.001.006c0 .002.002.004.004.006l.006.004.007.001h10.964l.007-.001.006-.004.004-.006.001-.007a.017.017 0 00-.003-.01l-1.703-2.554a1.745 1.745 0 01-.294-.97V5A3.5 3.5 0 008 1.5z"/></svg>`,
    plus: `<svg width="16" height="16" viewBox="0 0 16 16" fill="white" opacity="0.7"><path d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 010 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z"/></svg>`,
    user: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M10.561 8.073a6.005 6.005 0 013.432 5.142.75.75 0 11-1.498.07 4.5 4.5 0 00-8.99 0 .75.75 0 01-1.498-.07 6.004 6.004 0 013.431-5.142 3.999 3.999 0 115.123 0zM10.5 5a2.5 2.5 0 10-5 0 2.5 2.5 0 005 0z"/></svg>`,
    calendar: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.75 0a.75.75 0 01.75.75V2h5V.75a.75.75 0 011.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0113.25 16H2.75A1.75 1.75 0 011 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 014.75 0zM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V7.5zm10.75-4H2.75a.25.25 0 00-.25.25V6h11V3.75a.25.25 0 00-.25-.25z"/></svg>`,
  };

  // ================================================================
  // Toast notification (singleton — each new toast cancels the prev)
  // ================================================================
  let activeToast = null;
  let activeToastTimeout = null;

  function showToast(message) {
    // Cancel any existing toast
    if (activeToast) {
      clearTimeout(activeToastTimeout);
      activeToast.remove();
      activeToast = null;
    }

    const container = overlay?.querySelector(".gh-toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "gh-toast";
    toast.textContent = message;
    container.appendChild(toast);
    activeToast = toast;

    // Trigger entry animation on next frame
    requestAnimationFrame(() => {
      toast.classList.add("gh-toast-visible");
    });

    // After 3s, animate out
    activeToastTimeout = setTimeout(() => {
      toast.classList.remove("gh-toast-visible");
      toast.classList.add("gh-toast-exit");
      // Remove from DOM after exit animation
      toast.addEventListener("transitionend", () => {
        toast.remove();
        if (activeToast === toast) activeToast = null;
      }, { once: true });
      // Fallback removal
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
        if (activeToast === toast) activeToast = null;
      }, 500);
    }, 3000);
  }

  // ================================================================
  // Data extraction from hidden Twitter DOM
  // ================================================================
  const seenTweetIds = new Set(); // track which tweets we've already extracted

  function extractTweetsFromDOM() {
    const tweets = [];
    const articles = document.querySelectorAll('article[data-testid="tweet"]');

    for (const article of articles) {
      // Build a stable ID from content (since tweet DOM ids aren't exposed)
      const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
      const text = tweetTextEl ? tweetTextEl.textContent.trim() : "";
      const timeEl = article.querySelector("time");
      const datetime = timeEl ? timeEl.getAttribute("datetime") : null;

      // Use text + time as a rough unique key
      const stableKey = text.substring(0, 80) + "|" + (datetime || "");
      if (seenTweetIds.has(stableKey)) continue;
      seenTweetIds.add(stableKey);

      // Extract author
      const userNameEl = article.querySelector('[data-testid="User-Name"]');
      let authorName = "developer";
      let authorHandle = "dev";
      if (userNameEl) {
        const nameLink = userNameEl.querySelector("a");
        if (nameLink) {
          const spans = nameLink.querySelectorAll("span");
          if (spans.length > 0) authorName = spans[0].textContent.trim();
          const href = nameLink.getAttribute("href");
          if (href) authorHandle = href.replace(/^\//, "");
        }
      }

      // Extract tweet permalink
      let tweetUrl = null;
      const timeLink = timeEl ? timeEl.closest("a") : null;
      if (timeLink) {
        const href = timeLink.getAttribute("href");
        if (href) tweetUrl = "https://x.com" + href;
      }

      // Extract avatar URL
      const avatarImg = article.querySelector('[data-testid="Tweet-User-Avatar"] img');
      const avatarUrl = avatarImg ? avatarImg.src : null;

      // Extract media URLs
      const mediaUrls = [];
      const hasVideo = !!article.querySelector('[data-testid="videoPlayer"]');

      // Images from tweetPhoto (skip if there's a video — the image is just a thumbnail)
      if (!hasVideo) {
        article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
          const src = img.src;
          if (src && !src.startsWith("data:") && !src.includes("emoji")) {
            mediaUrls.push({ type: "image", src });
          }
        });
      }

      // For videos, grab the poster/thumbnail image instead of the <video> element
      // (Twitter uses blob: URLs for video src which aren't accessible)
      if (hasVideo) {
        const videoEl = article.querySelector('[data-testid="videoPlayer"] video');
        const poster = videoEl?.getAttribute("poster");
        // Also look for a thumbnail img inside the video player
        const thumbImg = article.querySelector('[data-testid="videoPlayer"] img');
        const thumbSrc = poster || thumbImg?.src;
        if (thumbSrc && !thumbSrc.startsWith("data:")) {
          mediaUrls.push({ type: "image", src: thumbSrc });
        }
      }

      tweets.push({
        stableKey,
        text: text || "Update dependencies",
        authorName,
        authorHandle,
        avatarUrl,
        tweetUrl,
        datetime,
        mediaUrls,
      });
    }
    return tweets;
  }

  // ================================================================
  // Overlay DOM construction
  // ================================================================
  let overlay = null;
  let commitListEl = null;
  let lastRenderedDateGroup = null;

  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.id = "gh-overlay";

    overlay.innerHTML = `
      <div class="gh-header">
        <div class="gh-hamburger">${ICONS.hamburger}</div>
        <div class="gh-logo">${ICONS.octocat}</div>
        <div class="gh-header-repo" title="Click to edit">
          <span class="gh-header-display">
            <span class="gh-header-owner">${esc(settings.orgName)}</span> / <strong class="gh-header-reponame">${esc(settings.repoName)}</strong> <span class="gh-lock">🔒</span>
          </span>
          <span class="gh-header-edit" style="display:none;">
            <input class="gh-edit-org" type="text" />
            <span class="gh-edit-slash">/</span>
            <input class="gh-edit-repo" type="text" />
            <button class="gh-edit-save">Save</button>
            <button class="gh-edit-cancel">✕</button>
          </span>
        </div>
        <input class="gh-search" type="text" placeholder="Type / to search" readonly>
        <div class="gh-header-right">
          ${ICONS.bell} ${ICONS.plus}
          <div class="gh-avatar-circle"></div>
        </div>
      </div>

      <div class="gh-repo-nav">
        <a class="gh-tab gh-tab-link" data-gh-path="">${ICONS.code} Code</a>
        <a class="gh-tab gh-tab-link" data-gh-path="/issues">${ICONS.issues} Issues <span class="gh-count">474</span></a>
        <a class="gh-tab gh-tab-link" data-gh-path="/pulls">${ICONS.pr} Pull requests <span class="gh-count">160</span></a>
        <a class="gh-tab gh-tab-link" data-gh-path="/actions">${ICONS.actions} Actions</a>
        <a class="gh-tab gh-tab-link" data-gh-path="/projects">${ICONS.projects} Projects</a>
        <a class="gh-tab gh-tab-link" data-gh-path="/wiki">${ICONS.wiki} Wiki</a>
        <a class="gh-tab gh-tab-link" data-gh-path="/security">${ICONS.security} Security and quality</a>
        <a class="gh-tab gh-tab-link" data-gh-path="/pulse">${ICONS.insights} Insights</a>
        <a class="gh-tab gh-tab-link" data-gh-path="/settings">${ICONS.settings} Settings</a>
      </div>

      <div class="gh-content">
        <div class="gh-commits-header">
          <div class="gh-commits-title">Commits</div>
          <div class="gh-filter-row">
            <div class="gh-branch-selector" id="gh-branch-toggle">
              ${ICONS.branch}
              <span class="gh-branch-name">${esc(settings.branchName)}</span>
              <span class="gh-dropdown-arrow">▼</span>
              <div class="gh-branch-dropdown" id="gh-branch-dropdown">
                <div class="gh-branch-dropdown-header">Switch branches</div>
                <div class="gh-branch-option" data-branch="dev" data-tab="for-you">dev</div>
                <div class="gh-branch-option" data-branch="prod" data-tab="following">prod</div>
              </div>
            </div>
            <div class="gh-filter-buttons">
              <div class="gh-filter-btn">${ICONS.user} All users ▼</div>
              <div class="gh-filter-btn">${ICONS.calendar} All time ▼</div>
            </div>
          </div>
        </div>
        <div class="gh-commit-list" id="gh-commit-list"></div>
      </div>
    `;

    document.body.appendChild(overlay);
    commitListEl = overlay.querySelector("#gh-commit-list");

    // ---- Toast notification system (override: only one at a time) ----
    const toastContainer = document.createElement("div");
    toastContainer.className = "gh-toast-container";
    overlay.appendChild(toastContainer);

    // Scroll delegation: mirror our overlay scroll position to the real
    // document scroll so Twitter's virtual-scroll and infinite-loading fire.
    // Twitter is visibility:hidden but still in normal document flow.
    let scrollThrottled = false;
    overlay.addEventListener("scroll", () => {
      if (scrollThrottled) return;
      scrollThrottled = true;
      requestAnimationFrame(() => { scrollThrottled = false; });

      // Map overlay scroll position proportionally to document height
      const overlayPct = overlay.scrollTop / (overlay.scrollHeight - overlay.clientHeight || 1);
      const targetY = overlayPct * (document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, targetY);
    });

    // Also: when nearing overlay bottom, aggressively scroll Twitter to its bottom
    // to force new tweet loading
    overlay.addEventListener("scroll", () => {
      const distFromBottom = overlay.scrollHeight - overlay.scrollTop - overlay.clientHeight;
      if (distFromBottom < 800) {
        window.scrollTo(0, document.documentElement.scrollHeight);
      }
    });

    // ---- Repo nav tab links → real GitHub pages ----
    function updateTabLinks() {
      const base = `https://github.com/${encodeURIComponent(settings.orgName)}/${encodeURIComponent(settings.repoName)}`;
      overlay.querySelectorAll(".gh-tab-link").forEach(tab => {
        tab.href = base + (tab.dataset.ghPath || "");
        tab.target = "_blank";
        tab.rel = "noopener";
      });
    }
    updateTabLinks();

    // ---- Inline edit for org/repo name ----
    const displayEl = overlay.querySelector(".gh-header-display");
    const editEl = overlay.querySelector(".gh-header-edit");
    const editOrgInput = overlay.querySelector(".gh-edit-org");
    const editRepoInput = overlay.querySelector(".gh-edit-repo");

    displayEl.style.cursor = "pointer";
    displayEl.addEventListener("click", (e) => {
      e.stopPropagation();
      editOrgInput.value = settings.orgName;
      editRepoInput.value = settings.repoName;
      displayEl.style.display = "none";
      editEl.style.display = "inline-flex";
      editOrgInput.focus();
    });

    function saveEdit() {
      const newOrg = editOrgInput.value.trim() || SETTINGS_DEFAULTS.orgName;
      const newRepo = editRepoInput.value.trim() || SETTINGS_DEFAULTS.repoName;
      settings.orgName = newOrg;
      settings.repoName = newRepo;
      chrome.storage.sync.set({ orgName: newOrg, repoName: newRepo });
      overlay.querySelector(".gh-header-owner").textContent = newOrg;
      overlay.querySelector(".gh-header-reponame").textContent = newRepo;
      editEl.style.display = "none";
      displayEl.style.display = "";
      disguiseUrl();
      updateTabLinks();
    }

    function cancelEdit() {
      editEl.style.display = "none";
      displayEl.style.display = "";
    }

    overlay.querySelector(".gh-edit-save").addEventListener("click", (e) => { e.stopPropagation(); saveEdit(); });
    overlay.querySelector(".gh-edit-cancel").addEventListener("click", (e) => { e.stopPropagation(); cancelEdit(); });

    // Enter to save, Escape to cancel
    [editOrgInput, editRepoInput].forEach(input => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
        if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
      });
      input.addEventListener("click", (e) => e.stopPropagation());
    });

    // ---- Branch dropdown: dev = "For You", prod = "Following" ----
    const branchToggle = overlay.querySelector("#gh-branch-toggle");
    const branchDropdown = overlay.querySelector("#gh-branch-dropdown");
    const branchNameEl = overlay.querySelector(".gh-branch-name");

    branchToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      branchDropdown.classList.toggle("gh-dropdown-open");
    });

    // Close dropdown when clicking outside
    overlay.addEventListener("click", () => {
      branchDropdown.classList.remove("gh-dropdown-open");
    });

    branchDropdown.querySelectorAll(".gh-branch-option").forEach(opt => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const branch = opt.dataset.branch;
        const tab = opt.dataset.tab;

        // Update UI
        branchNameEl.textContent = branch;
        settings.branchName = branch;
        chrome.storage.sync.set({ branchName: branch });
        branchDropdown.classList.remove("gh-dropdown-open");
        disguiseUrl();

        // Click the corresponding Twitter tab in the hidden DOM
        switchTwitterTab(tab);

        // Clear existing commits and re-poll
        clearCommitList();
      });
    });

    // ---- Elastic pull-to-refresh ----
    let pullStartY = 0;
    let isPulling = false;
    let pullDistance = 0;
    const PULL_THRESHOLD = 120;

    const refreshIndicator = document.createElement("div");
    refreshIndicator.className = "gh-pull-refresh";
    refreshIndicator.innerHTML = `<span class="gh-pull-text">Pull to refresh</span>`;
    overlay.insertBefore(refreshIndicator, overlay.firstChild);

    overlay.addEventListener("touchstart", (e) => {
      if (overlay.scrollTop === 0) {
        pullStartY = e.touches[0].clientY;
        isPulling = true;
      }
    }, { passive: true });

    overlay.addEventListener("touchmove", (e) => {
      if (!isPulling) return;
      pullDistance = Math.max(0, e.touches[0].clientY - pullStartY);
      if (pullDistance > 0 && overlay.scrollTop === 0) {
        const dampened = Math.min(pullDistance * 0.5, 160);
        refreshIndicator.style.height = dampened + "px";
        refreshIndicator.style.opacity = Math.min(dampened / PULL_THRESHOLD, 1);
        refreshIndicator.querySelector(".gh-pull-text").textContent =
          dampened >= PULL_THRESHOLD * 0.5 ? "Release to refresh" : "Pull to refresh";
      }
    }, { passive: true });

    overlay.addEventListener("touchend", () => {
      if (!isPulling) return;
      isPulling = false;
      const dampened = Math.min(pullDistance * 0.5, 160);
      if (dampened >= PULL_THRESHOLD * 0.5) {
        triggerRefresh();
      }
      // Snap back with elastic ease
      refreshIndicator.style.transition = "height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease";
      refreshIndicator.style.height = "0px";
      refreshIndicator.style.opacity = "0";
      setTimeout(() => { refreshIndicator.style.transition = ""; }, 400);
      pullDistance = 0;
    }, { passive: true });

    // Mouse wheel pull-to-refresh: overscroll at top
    let wheelAccumulator = 0;
    let wheelResetTimer = null;

    overlay.addEventListener("wheel", (e) => {
      if (overlay.scrollTop > 0 || e.deltaY > 0) {
        wheelAccumulator = 0;
        refreshIndicator.style.height = "0px";
        refreshIndicator.style.opacity = "0";
        return;
      }

      // Scrolling up while at top
      wheelAccumulator += Math.abs(e.deltaY);
      const dampened = Math.min(wheelAccumulator * 0.3, 160);
      refreshIndicator.style.transition = "";
      refreshIndicator.style.height = dampened + "px";
      refreshIndicator.style.opacity = Math.min(dampened / PULL_THRESHOLD, 1);
      refreshIndicator.querySelector(".gh-pull-text").textContent =
        dampened >= PULL_THRESHOLD * 0.5 ? "Release to refresh" : "Pull to refresh";

      clearTimeout(wheelResetTimer);
      wheelResetTimer = setTimeout(() => {
        if (dampened >= PULL_THRESHOLD * 0.5) {
          triggerRefresh();
        }
        refreshIndicator.style.transition = "height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease";
        refreshIndicator.style.height = "0px";
        refreshIndicator.style.opacity = "0";
        setTimeout(() => { refreshIndicator.style.transition = ""; }, 400);
        wheelAccumulator = 0;
      }, 200);
    }, { passive: true });

    return overlay;
  }

  // ================================================================
  // Render a single commit row
  // ================================================================
  let rowCounter = 0;
  let currentDateCard = null; // the bordered card for the current date group

  function renderCommitRow(tweet) {
    const seed = rowCounter++;
    const hash = generateHash(tweet.text + seed);
    const hasVerified = seededRandom(seed * 7) > VERIFIED_THRESHOLD;
    const hasCI = seededRandom(seed * 13) > CI_THRESHOLD;
    const hasBubble = seededRandom(seed * 19) > 0.55; // ~45% chance of speech bubble
    const isAuthored = seededRandom(seed * 23) > 0.6; // ~40% say "authored" vs "committed"
    const ciTotal = Math.floor(seededRandom(seed * 17) * 3) + 2;
    const timeStr = relativeTime(tweet.datetime);
    const identiconSeed = tweet.authorName.charCodeAt(0) * 100 + (tweet.authorName.charCodeAt(1) || 0);

    // Date separator + grouped card
    const dl = dateLabel(tweet.datetime);
    if (dl && dl !== lastRenderedDateGroup) {
      lastRenderedDateGroup = dl;
      const sep = document.createElement("div");
      sep.className = "gh-date-separator";
      sep.innerHTML = `${ICONS.commit} Commits on ${esc(dl)}`;
      commitListEl.appendChild(sep);

      // Start a new bordered card for this date group
      currentDateCard = document.createElement("div");
      currentDateCard.className = "gh-date-card";
      commitListEl.appendChild(currentDateCard);
    }

    // If no card yet (e.g. no date), create one
    if (!currentDateCard) {
      currentDateCard = document.createElement("div");
      currentDateCard.className = "gh-date-card";
      commitListEl.appendChild(currentDateCard);
    }

    // Row container
    const row = document.createElement("div");
    row.className = "gh-commit-row";

    // Left side: identicon + text block
    const leftSide = document.createElement("div");
    leftSide.className = "gh-commit-left";

    // Identicon
    const identicon = document.createElement("div");
    identicon.className = "gh-identicon";
    identicon.innerHTML = generateIdenticonSVG(identiconSeed);
    identicon.title = "Click to reveal profile photo";

    // Identicon click → reveal real avatar
    let revealTimer = null;
    identicon.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (revealTimer || !tweet.avatarUrl) return;
      identicon.style.transition = "transform 0.3s ease";
      identicon.style.transform = "rotateY(90deg)";
      setTimeout(() => {
        identicon.innerHTML = `<img src="${tweet.avatarUrl}" style="width:20px;height:20px;border-radius:50%;display:block;" />`;
        identicon.style.transform = "rotateY(0deg)";
      }, IDENTICON_FLIP_MS);
      revealTimer = setTimeout(() => {
        identicon.style.transform = "rotateY(90deg)";
        setTimeout(() => {
          identicon.innerHTML = generateIdenticonSVG(identiconSeed);
          identicon.style.transform = "rotateY(0deg)";
          revealTimer = null;
        }, IDENTICON_FLIP_MS);
      }, IDENTICON_REVEAL_MS);
    });

    // Text block
    const textBlock = document.createElement("div");
    textBlock.className = "gh-commit-text-block";

    const msgLine = document.createElement("div");
    msgLine.className = "gh-commit-msg-row";

    const msgText = document.createElement("span");
    msgText.className = "gh-commit-message";
    msgText.textContent = tweet.text;
    msgLine.appendChild(msgText);

    // Speech bubble icon (~45% of rows)
    if (hasBubble) {
      const bubble = document.createElement("span");
      bubble.className = "gh-commit-bubble";
      bubble.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25h-6.5a.75.75 0 00-.53.22L4.5 14.44v-2.19a.75.75 0 00-.75-.75h-2a.25.25 0 01-.25-.25v-8.5z"/></svg>`;
      bubble.title = "View commit details";
      msgLine.appendChild(bubble);
    }

    // Click to expand/collapse if text is truncated
    msgText.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!msgText.classList.contains("gh-msg-expanded") && msgText.scrollWidth <= msgText.clientWidth) return;
      msgText.classList.toggle("gh-msg-expanded");
    });

    const authorLine = document.createElement("div");
    authorLine.className = "gh-commit-author-line";
    const verb = isAuthored ? "authored" : "committed";
    let ciHTML = hasCI ? ` <span class="gh-ci-status">${ICONS.check} ${ciTotal} / ${ciTotal}</span>` : "";
    authorLine.innerHTML = `<span class="gh-author-name">${esc(tweet.authorName)}</span> <span class="gh-committed-text">${verb} ${esc(timeStr)}</span>${ciHTML}`;

    textBlock.appendChild(msgLine);
    textBlock.appendChild(authorLine);

    // Media toggle (if tweet has media)
    if (tweet.mediaUrls.length > 0) {
      const mediaWrapper = document.createElement("div");
      mediaWrapper.className = "gh-media-wrapper";
      const toggle = document.createElement("div");
      toggle.className = "gh-media-toggle";
      toggle.innerHTML = ICONS.expand;
      const collapsible = document.createElement("div");
      collapsible.className = "gh-media-collapsible";

      tweet.mediaUrls.forEach(m => {
        const img = document.createElement("img");
        img.src = m.src;
        img.className = "gh-media-img";
        collapsible.appendChild(img);
      });

      let expanded = false;
      toggle.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        expanded = !expanded;
        if (expanded) {
          collapsible.style.maxHeight = collapsible.scrollHeight + "px";
          collapsible.classList.add("gh-expanded");
          toggle.querySelector("svg").style.transform = "rotate(-90deg)";
        } else {
          collapsible.style.maxHeight = collapsible.scrollHeight + "px";
          collapsible.offsetHeight; // reflow
          collapsible.style.maxHeight = "0";
          collapsible.classList.remove("gh-expanded");
          toggle.querySelector("svg").style.transform = "";
        }
      });

      mediaWrapper.appendChild(toggle);
      mediaWrapper.appendChild(collapsible);
      textBlock.appendChild(mediaWrapper);
    }

    leftSide.appendChild(identicon);
    leftSide.appendChild(textBlock);

    // Right side: verified + hash + buttons
    const rightSide = document.createElement("div");
    rightSide.className = "gh-commit-right";
    const verifiedHTML = hasVerified ? `<span class="gh-verified-badge">Verified</span>` : "";
    rightSide.innerHTML = `${verifiedHTML}<span class="gh-commit-hash">${hash}</span><span class="gh-copy-btn" title="Copy commit link">${ICONS.copy}</span><span class="gh-browse-btn" title="Browse the repository at this point in the history">${ICONS.code}</span>`;

    // Wire up copy button → copy tweet link + toast
    const copyBtn = rightSide.querySelector(".gh-copy-btn");
    if (copyBtn) {
      copyBtn.style.cursor = "pointer";
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const url = tweet.tweetUrl || "https://x.com";
        navigator.clipboard.writeText(url).then(() => {
          showToast('"commit" copied to clipboard');
        });
      });
    }

    // Wire up browse button → navigate to commit detail (PR conversation view)
    const browseBtn = rightSide.querySelector(".gh-browse-btn");
    if (browseBtn) {
      browseBtn.style.cursor = "pointer";
      browseBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!tweet.tweetUrl) return;
        // Store commit detail data for the detail page to pick up
        chrome.storage.local.set({
          commitDetail: {
            text: tweet.text,
            authorName: tweet.authorName,
            authorHandle: tweet.authorHandle,
            avatarUrl: tweet.avatarUrl,
            datetime: tweet.datetime,
            hash: hash,
            tweetUrl: tweet.tweetUrl,
            mediaUrls: tweet.mediaUrls,
          }
        }, () => {
          // Navigate to the tweet page (content script will re-activate in detail mode)
          location.href = tweet.tweetUrl;
        });
      });
    }

    row.appendChild(leftSide);
    row.appendChild(rightSide);
    currentDateCard.appendChild(row);
  }

  // ================================================================
  // Twitter tab switching (For You ↔ Following)
  // ================================================================
  function switchTwitterTab(tabName) {
    // Twitter's tab bar uses [role="tab"] elements
    const tabs = document.querySelectorAll('[role="tab"]');
    for (const tab of tabs) {
      const text = tab.textContent.trim().toLowerCase();
      if (tabName === "for-you" && (text === "for you" || text === "foryou")) {
        tab.click();
        return;
      }
      if (tabName === "following" && text === "following") {
        tab.click();
        return;
      }
    }
    // Fallback: try link-based navigation
    const links = document.querySelectorAll('a[role="tab"]');
    for (const link of links) {
      const text = link.textContent.trim().toLowerCase();
      if (tabName === "for-you" && text.includes("for you")) { link.click(); return; }
      if (tabName === "following" && text.includes("following")) { link.click(); return; }
    }
  }

  function clearCommitList() {
    if (commitListEl) commitListEl.innerHTML = "";
    seenTweetIds.clear();
    lastRenderedDateGroup = null;
    currentDateCard = null;
    rowCounter = 0;
    // Force immediate re-poll after short delay for DOM to update
    setTimeout(poll, 600);
  }

  function triggerRefresh() {
    // Scroll Twitter back to top to reset its virtualized list
    window.scrollTo(0, 0);
    clearCommitList();
  }

  // ================================================================
  // Main poll loop: extract new tweets, render them
  // ================================================================
  let pollTimer = null;

  function poll() {
    try {
      const newTweets = extractTweetsFromDOM();
      for (const tweet of newTweets) {
        renderCommitRow(tweet);
      }
    } catch (e) {
      // Silent — don't break the poll loop
    }
  }

  // ================================================================
  // URL detection: are we on a single tweet/status page?
  // ================================================================
  function isStatusPage() {
    // Matches x.com/username/status/1234... or twitter.com/username/status/1234...
    return /^\/[^/]+\/status\/\d+/.test(location.pathname);
  }

  // Extract the main (OP) tweet from a status page DOM
  // Returns a promise that resolves once the main tweet is available
  function extractMainTweetFromDOM() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 30; // 30 * 500ms = 15s max wait

      function tryExtract() {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        if (articles.length > 0) {
          const article = articles[0]; // first article is the main tweet
          const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
          const text = tweetTextEl ? tweetTextEl.textContent.trim() : "";
          const timeEl = article.querySelector("time");
          const datetime = timeEl ? timeEl.getAttribute("datetime") : null;

          const userNameEl = article.querySelector('[data-testid="User-Name"]');
          let authorName = "developer";
          let authorHandle = "dev";
          if (userNameEl) {
            const nameLink = userNameEl.querySelector("a");
            if (nameLink) {
              const spans = nameLink.querySelectorAll("span");
              if (spans.length > 0) authorName = spans[0].textContent.trim();
              const href = nameLink.getAttribute("href");
              if (href) authorHandle = href.replace(/^\//, "");
            }
          }

          const avatarImg = article.querySelector('[data-testid="Tweet-User-Avatar"] img');
          const avatarUrl = avatarImg ? avatarImg.src : null;

          resolve({
            text: text || "Update dependencies",
            authorName,
            authorHandle,
            avatarUrl,
            datetime,
            hash: generateHash(text + location.pathname),
            tweetUrl: location.href,
            mediaUrls: [],
          });
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(tryExtract, 500);
        } else {
          // Fallback: couldn't find the tweet, use URL info
          resolve({
            text: "View commit",
            authorName: "developer",
            authorHandle: "dev",
            avatarUrl: null,
            datetime: null,
            hash: generateHash(location.pathname),
            tweetUrl: location.href,
            mediaUrls: [],
          });
        }
      }

      tryExtract();
    });
  }

  // ================================================================
  // Commit Detail Page (PR Conversation Overlay)
  // ================================================================
  let detailOverlay = null;
  let detailPollTimer = null;
  const seenReplyIds = new Set();

  function extractRepliesFromDOM() {
    const replies = [];
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    // First article is usually the main tweet — skip it
    let isFirst = true;
    for (const article of articles) {
      if (isFirst) { isFirst = false; continue; }

      const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
      const text = tweetTextEl ? tweetTextEl.textContent.trim() : "";
      const timeEl = article.querySelector("time");
      const datetime = timeEl ? timeEl.getAttribute("datetime") : null;

      const stableKey = "r|" + text.substring(0, 80) + "|" + (datetime || "");
      if (seenReplyIds.has(stableKey)) continue;
      seenReplyIds.add(stableKey);

      const userNameEl = article.querySelector('[data-testid="User-Name"]');
      let authorName = "contributor";
      let authorHandle = "dev";
      if (userNameEl) {
        const nameLink = userNameEl.querySelector("a");
        if (nameLink) {
          const spans = nameLink.querySelectorAll("span");
          if (spans.length > 0) authorName = spans[0].textContent.trim();
          const href = nameLink.getAttribute("href");
          if (href) authorHandle = href.replace(/^\//, "");
        }
      }

      const avatarImg = article.querySelector('[data-testid="Tweet-User-Avatar"] img');
      const avatarUrl = avatarImg ? avatarImg.src : null;

      // Extract media (same logic as feed extraction)
      const replyMedia = [];
      const hasVid = !!article.querySelector('[data-testid="videoPlayer"]');
      if (!hasVid) {
        article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
          const src = img.src;
          if (src && !src.startsWith("data:") && !src.includes("emoji")) {
            replyMedia.push({ type: "image", src });
          }
        });
      }
      if (hasVid) {
        const videoEl = article.querySelector('[data-testid="videoPlayer"] video');
        const poster = videoEl?.getAttribute("poster");
        const thumbImg = article.querySelector('[data-testid="videoPlayer"] img');
        const thumbSrc = poster || thumbImg?.src;
        if (thumbSrc && !thumbSrc.startsWith("data:")) {
          replyMedia.push({ type: "image", src: thumbSrc });
        }
      }

      replies.push({ stableKey, text, authorName, authorHandle, avatarUrl, datetime, mediaUrls: replyMedia });
    }
    return replies;
  }

  // ================================================================
  // Buzzword branch name generator
  // ================================================================
  const BRANCH_PREFIXES = ["feat", "fix", "refactor", "chore", "hotfix", "perf", "ci", "build", "migrate", "spike"];
  const BRANCH_BUZZWORDS = [
    "kubernetes-ingress", "graphql-federation", "redis-cache-layer", "terraform-modules",
    "websocket-gateway", "oauth2-pkce-flow", "docker-compose-v2", "grpc-streaming",
    "elasticsearch-reindex", "kafka-consumer-groups", "prometheus-alerts", "nginx-rate-limiting",
    "mongodb-sharding", "rabbitmq-dead-letter", "lambda-cold-starts", "cloudflare-workers",
    "postgres-partitioning", "s3-lifecycle-rules", "datadog-apm-traces", "vault-secret-rotation",
    "istio-service-mesh", "argo-cd-rollouts", "pulumi-stack-refs", "dbt-incremental-models",
    "spark-delta-lake", "airflow-dag-dependencies", "snowflake-materialized-views",
    "react-server-components", "nextjs-middleware", "prisma-migrations", "trpc-procedures",
    "zod-validation-schemas", "tailwind-design-tokens", "storybook-interaction-tests",
    "playwright-e2e-suite", "webpack-module-federation", "turborepo-cache-artifacts",
    "sentry-performance-monitoring", "opentelemetry-spans", "jwt-refresh-rotation",
    "stripe-webhook-idempotency", "algolia-faceted-search", "supabase-row-level-security",
    "vercel-edge-functions", "rust-wasm-bindings", "go-generics-refactor",
  ];

  function generateBranchName(seed) {
    const prefix = BRANCH_PREFIXES[Math.abs(seed) % BRANCH_PREFIXES.length];
    const buzz = BRANCH_BUZZWORDS[Math.abs(seed * 7 + 3) % BRANCH_BUZZWORDS.length];
    return `${prefix}/${buzz}`;
  }

  // ================================================================
  // Emoji reaction helpers
  // ================================================================
  const REACTION_EMOJIS = ["👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀"];

  function generateReactions(seed) {
    // ~10% chance of having reactions (rare)
    if (seededRandom(seed * 31) > 0.1) return "";
    const count = Math.floor(seededRandom(seed * 41) * 3) + 1;
    let html = '<div class="gh-reactions">';
    const used = new Set();
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(seededRandom(seed * 53 + i * 17) * REACTION_EMOJIS.length);
      if (used.has(idx)) continue;
      used.add(idx);
      const num = Math.floor(seededRandom(seed * 67 + i * 23) * 8) + 1;
      html += `<span class="gh-reaction-pill">${REACTION_EMOJIS[idx]} ${num}</span>`;
    }
    html += '<span class="gh-reaction-add">😀 +</span></div>';
    return html;
  }

  // ================================================================
  // Collapsible media block builder (shared by feed + PR views)
  // ================================================================
  function buildMediaBlock(mediaUrls) {
    if (!mediaUrls || mediaUrls.length === 0) return null;
    const wrapper = document.createElement("div");
    wrapper.className = "gh-media-wrapper";
    const toggle = document.createElement("div");
    toggle.className = "gh-media-toggle";
    toggle.innerHTML = ICONS.expand;
    const collapsible = document.createElement("div");
    collapsible.className = "gh-media-collapsible";

    mediaUrls.forEach(m => {
      const img = document.createElement("img");
      img.src = m.src;
      img.className = "gh-media-img";
      collapsible.appendChild(img);
    });

    let expanded = false;
    toggle.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      expanded = !expanded;
      if (expanded) {
        collapsible.style.maxHeight = collapsible.scrollHeight + "px";
        collapsible.classList.add("gh-expanded");
        toggle.querySelector("svg").style.transform = "rotate(-90deg)";
      } else {
        collapsible.style.maxHeight = collapsible.scrollHeight + "px";
        collapsible.offsetHeight;
        collapsible.style.maxHeight = "0";
        collapsible.classList.remove("gh-expanded");
        toggle.querySelector("svg").style.transform = "";
      }
    });

    wrapper.appendChild(toggle);
    wrapper.appendChild(collapsible);
    return wrapper;
  }

  // ================================================================
  // Build detail overlay (full PR conversation page)
  // ================================================================
  function buildDetailOverlay(commitData) {
    detailOverlay = document.createElement("div");
    detailOverlay.id = "gh-overlay";

    const commitDate = commitData.datetime
      ? new Date(commitData.datetime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "recently";
    const prNumber = Math.floor(Math.abs(parseInt(commitData.hash, 16)) % 900) + 100;
    const branchSeed = commitData.hash.charCodeAt(0) * 100 + (commitData.hash.charCodeAt(1) || 0);
    const featureBranch = generateBranchName(branchSeed);
    const botName = settings.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-bot";

    // Random diff stats
    const additions = Math.floor(seededRandom(branchSeed * 11) * 2000) + 50;
    const deletions = Math.floor(seededRandom(branchSeed * 19) * 500) + 10;
    const filesChanged = Math.floor(seededRandom(branchSeed * 23) * 20) + 2;
    const checksCount = Math.floor(seededRandom(branchSeed * 29) * 5) + 1;

    // Diff bar segments (5 blocks, proportional green/red)
    const total = additions + deletions;
    const greenBlocks = Math.round((additions / total) * 5);
    const redBlocks = 5 - greenBlocks;
    const diffBar = `<span class="gh-diffbar">${'<span class="gh-diffbar-green">▪</span>'.repeat(greenBlocks)}${'<span class="gh-diffbar-red">▪</span>'.repeat(redBlocks)}</span>`;

    detailOverlay.innerHTML = `
      <div class="gh-header">
        <div class="gh-hamburger">${ICONS.hamburger}</div>
        <div class="gh-logo">${ICONS.octocat}</div>
        <div class="gh-header-repo">
          <span class="gh-header-display">
            <span class="gh-header-owner">${esc(settings.orgName)}</span> / <strong class="gh-header-reponame">${esc(settings.repoName)}</strong> <span class="gh-lock">🔒</span>
          </span>
        </div>
        <input class="gh-search" type="text" placeholder="Type / to search" readonly>
        <div class="gh-header-right">
          ${ICONS.bell} ${ICONS.plus}
          <div class="gh-avatar-circle"></div>
        </div>
      </div>

      <div class="gh-repo-nav">
        <div class="gh-tab">${ICONS.code} Code</div>
        <div class="gh-tab">${ICONS.pr} Pull requests <span class="gh-count">9</span></div>
        <div class="gh-tab">${ICONS.actions} Actions</div>
        <div class="gh-tab">${ICONS.security} Security and quality</div>
        <div class="gh-tab">${ICONS.insights} Insights</div>
        <div class="gh-tab">${ICONS.settings} Settings</div>
      </div>

      <div class="gh-detail-content">
        <div class="gh-pr-title-row">
          <h1 class="gh-pr-title">${esc(commitData.text)} <span class="gh-pr-number">#${prNumber}</span></h1>
          <div class="gh-pr-title-buttons">
            <span class="gh-btn-outline">Not ready</span>
            <span class="gh-btn-green">Code ▾</span>
          </div>
        </div>

        <div class="gh-pr-status-line">
          <span class="gh-pr-draft-badge">${ICONS.pr} Draft</span>
          <span class="gh-pr-merge-text">
            <strong>${esc(commitData.authorName)}</strong> wants to merge 1 commit into
            <code class="gh-branch-pill">${esc(settings.branchName)}</code>
            from
            <code class="gh-branch-pill">${esc(featureBranch)}</code>
          </span>
        </div>

        <div class="gh-detail-tabs">
          <div class="gh-detail-tab gh-detail-tab-active">${ICONS.pr} Conversation <span class="gh-count" id="gh-convo-count">1</span></div>
          <div class="gh-detail-tab">${ICONS.commit} Commits <span class="gh-count">1</span></div>
          <div class="gh-detail-tab">${ICONS.check} Checks <span class="gh-count">${checksCount}</span></div>
          <div class="gh-detail-tab">${ICONS.code} Files changed <span class="gh-count">${filesChanged}</span></div>
          <div class="gh-detail-diffstat">
            <span class="gh-diffstat-add">+${additions.toLocaleString()}</span>
            <span class="gh-diffstat-del">-${deletions.toLocaleString()}</span>
            ${diffBar}
          </div>
        </div>

        <div class="gh-pr-body-layout">
          <div class="gh-pr-main">
            <div class="gh-detail-timeline">
              <div class="gh-timeline-line"></div>

              <div class="gh-comment gh-comment-op">
                <div class="gh-comment-gutter">
                  <div class="gh-comment-avatar">
                    ${commitData.avatarUrl
                      ? `<img src="${commitData.avatarUrl}" class="gh-comment-avatar-img" />`
                      : `<div class="gh-comment-avatar-placeholder"></div>`}
                  </div>
                </div>
                <div class="gh-comment-body-wrap">
                  <div class="gh-comment-header">
                    <strong class="gh-comment-author">${esc(commitData.authorName)}</strong>
                    <span class="gh-comment-time">commented on ${esc(commitDate)}</span>
                    <span class="gh-comment-badge-owner">Author</span>
                    <span class="gh-comment-dots">···</span>
                  </div>
                  <div class="gh-comment-body">No description provided.</div>
                  <div class="gh-comment-media-slot" id="gh-op-media-slot"></div>
                  <div class="gh-comment-reactions">
                    <span class="gh-reaction-add-solo">😀</span>
                  </div>
                </div>
              </div>

              <div id="gh-detail-replies"></div>
            </div>
          </div>

          <div class="gh-pr-sidebar">
            <div class="gh-sidebar-section">
              <div class="gh-sidebar-heading">Reviewers <span class="gh-sidebar-gear">⚙</span></div>
              <div class="gh-sidebar-subtext">Suggestions</div>
              <div class="gh-sidebar-reviewer">
                <div class="gh-sidebar-avatar-sm"></div>
                <span>${esc(botName)}</span>
                <a class="gh-sidebar-request">Request</a>
              </div>
            </div>
            <div class="gh-sidebar-section">
              <div class="gh-sidebar-heading">Assignees <span class="gh-sidebar-gear">⚙</span></div>
              <div class="gh-sidebar-empty">No one—<a class="gh-sidebar-link">assign yourself</a></div>
            </div>
            <div class="gh-sidebar-section">
              <div class="gh-sidebar-heading">Labels <span class="gh-sidebar-gear">⚙</span></div>
              <div class="gh-sidebar-empty">None yet</div>
            </div>
            <div class="gh-sidebar-section">
              <div class="gh-sidebar-heading">Projects <span class="gh-sidebar-gear">⚙</span></div>
              <div class="gh-sidebar-empty">None yet</div>
            </div>
            <div class="gh-sidebar-section">
              <div class="gh-sidebar-heading">Milestone <span class="gh-sidebar-gear">⚙</span></div>
              <div class="gh-sidebar-empty">No milestone</div>
            </div>
            <div class="gh-sidebar-section">
              <div class="gh-sidebar-heading">Development <span class="gh-sidebar-gear">⚙</span></div>
              <div class="gh-sidebar-empty">Successfully merging this pull request may close these issues.</div>
              <div class="gh-sidebar-empty" style="margin-top:4px;">None yet</div>
            </div>
            <div class="gh-sidebar-section gh-sidebar-notifications">
              <div class="gh-sidebar-heading">Notifications <span class="gh-sidebar-customize">Customize</span></div>
              <button class="gh-subscribe-btn">${ICONS.bell} Subscribe</button>
              <div class="gh-sidebar-subtext">You're not receiving notifications from this thread.</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(detailOverlay);

    // OP media
    const opMediaBlock = buildMediaBlock(commitData.mediaUrls);
    if (opMediaBlock) {
      detailOverlay.querySelector("#gh-op-media-slot").appendChild(opMediaBlock);
    }

    // Back button — click org/repo in header
    const headerDisplay = detailOverlay.querySelector(".gh-header-display");
    if (headerDisplay) {
      headerDisplay.style.cursor = "pointer";
      headerDisplay.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.storage.local.remove("commitDetail", () => {
          location.href = "https://x.com/home";
        });
      });
    }

    // Start polling for replies
    const repliesContainer = detailOverlay.querySelector("#gh-detail-replies");
    let replyCounter = 0;

    function pollReplies() {
      try {
        const replies = extractRepliesFromDOM();
        for (const reply of replies) {
          renderReplyComment(reply, repliesContainer, ++replyCounter, botName);
        }
        // Update conversation count
        const countEl = detailOverlay.querySelector("#gh-convo-count");
        if (countEl) countEl.textContent = 1 + replyCounter;
      } catch (e) { /* silent */ }
    }

    pollReplies();
    detailPollTimer = setInterval(pollReplies, POLL_INTERVAL_MS);

    // Scroll delegation for loading more replies
    detailOverlay.addEventListener("scroll", () => {
      const distFromBottom = detailOverlay.scrollHeight - detailOverlay.scrollTop - detailOverlay.clientHeight;
      if (distFromBottom < 800) {
        window.scrollTo(0, document.documentElement.scrollHeight);
      }
    });
  }

  function renderReplyComment(reply, container, index, botName) {
    const replyDate = reply.datetime ? relativeTime(reply.datetime) : "recently";
    const reactions = generateReactions(index * 7 + 3);

    const comment = document.createElement("div");
    comment.className = "gh-comment";
    comment.innerHTML = `
      <div class="gh-comment-gutter">
        <div class="gh-comment-avatar">
          ${reply.avatarUrl
            ? `<img src="${reply.avatarUrl}" class="gh-comment-avatar-img" />`
            : `<div class="gh-comment-avatar-placeholder"></div>`}
        </div>
      </div>
      <div class="gh-comment-body-wrap">
        <div class="gh-comment-header">
          <strong class="gh-comment-author">${esc(reply.authorName)}</strong>
          <span class="gh-comment-time">commented ${esc(replyDate)}</span>
          <span class="gh-comment-dots">···</span>
        </div>
        <div class="gh-comment-body">${esc(reply.text)}</div>
        <div class="gh-comment-media-slot"></div>
        <div class="gh-comment-reactions">
          ${reactions || '<span class="gh-reaction-add-solo">😀</span>'}
        </div>
      </div>
    `;

    // Append media block if reply has media
    const mediaBlock = buildMediaBlock(reply.mediaUrls);
    if (mediaBlock) {
      comment.querySelector(".gh-comment-media-slot").appendChild(mediaBlock);
    }

    container.appendChild(comment);
  }

  // ================================================================
  // Activation / Deactivation
  // ================================================================
  let isActive = false;
  let currentMode = "feed"; // "feed" or "detail"

  // ================================================================
  // Floating toggle button (draggable, persists across views)
  // ================================================================
  let toggleFab = null;
  const TRANSITION_MS = 1300;
  const HALF_TRANSITION = TRANSITION_MS / 2;

  function createToggleFab() {
    if (toggleFab) return;
    toggleFab = document.createElement("div");
    toggleFab.id = "gd-toggle-fab";
    toggleFab.innerHTML = `<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M5.22 14.78a.75.75 0 001.06-1.06L4.56 12h8.69a.75.75 0 000-1.5H4.56l1.72-1.72a.75.75 0 00-1.06-1.06l-3 3a.75.75 0 000 1.06l3 3zm5.56-6.5a.75.75 0 11-1.06-1.06l1.72-1.72H2.75a.75.75 0 010-1.5h8.69L9.72 2.28a.75.75 0 011.06-1.06l3 3a.75.75 0 010 1.06l-3 3z"/></svg><button class="gd-fab-dismiss" title="Dismiss until next session">✕</button>`;
    toggleFab.title = "Switch view";
    document.body.appendChild(toggleFab);

    // Dismiss button — hide fab for rest of session
    toggleFab.querySelector(".gd-fab-dismiss").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFab.remove();
      toggleFab = null;
    });

    // Update visual mode class
    updateFabMode();

    // Drag support
    let isDragging = false;
    let wasDragged = false;
    let startX, startY, startLeft, startTop;

    toggleFab.addEventListener("pointerdown", (e) => {
      isDragging = true;
      wasDragged = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = toggleFab.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      toggleFab.setPointerCapture(e.pointerId);
      toggleFab.style.transition = "none";
      e.preventDefault();
    });

    toggleFab.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDragged = true;
      const newLeft = Math.max(0, Math.min(window.innerWidth - 44, startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - 44, startTop + dy));
      toggleFab.style.left = newLeft + "px";
      toggleFab.style.top = newTop + "px";
      toggleFab.style.right = "auto";
      toggleFab.style.bottom = "auto";
    });

    toggleFab.addEventListener("pointerup", (e) => {
      isDragging = false;
      toggleFab.releasePointerCapture(e.pointerId);
      toggleFab.style.transition = "";
      if (!wasDragged) {
        performViewTransition();
      }
    });
  }

  function updateFabMode() {
    if (!toggleFab) return;
    if (isActive) {
      toggleFab.classList.add("gd-fab-gh");
      toggleFab.classList.remove("gd-fab-tw");
    } else {
      toggleFab.classList.remove("gd-fab-gh");
      toggleFab.classList.add("gd-fab-tw");
    }
    // Re-append so fab is always the last body child (on top of overlay)
    document.body.appendChild(toggleFab);
  }

  function removeToggleFab() {
    if (toggleFab) { toggleFab.remove(); toggleFab = null; }
  }

  function performViewTransition() {
    if (toggleFab) toggleFab.style.pointerEvents = "none";

    // Create the fullscreen cover + blur container
    const curtain = document.createElement("div");
    curtain.id = "gd-transition-curtain";
    document.body.appendChild(curtain);

    // Target to blur: the current active content
    const blurTarget = isActive ? (overlay || detailOverlay) : document.getElementById("react-root");

    // Phase 1: blur up + fade in the solid cover
    if (blurTarget) blurTarget.style.transition = `filter ${HALF_TRANSITION}ms ease-in-out`;
    if (blurTarget) blurTarget.style.filter = "blur(40px)";
    curtain.style.transition = `opacity ${HALF_TRANSITION}ms ease-in-out`;
    requestAnimationFrame(() => {
      curtain.style.opacity = "1";
    });

    // At the midpoint: switch the view behind the curtain
    setTimeout(() => {
      // Clean up the blur on the outgoing view
      if (blurTarget) {
        blurTarget.style.transition = "";
        blurTarget.style.filter = "";
      }

      // Toggle the actual view
      if (isActive) {
        deactivate();
      } else {
        activate();
      }
      updateFabMode();

      // The new content — start it blurred
      const newTarget = isActive ? (overlay || detailOverlay) : document.getElementById("react-root");
      if (newTarget) {
        newTarget.style.filter = "blur(40px)";
        // Force reflow
        void newTarget.offsetHeight;
        newTarget.style.transition = `filter ${HALF_TRANSITION}ms ease-in-out`;
      }

      // Phase 2: unblur + fade out the cover
      requestAnimationFrame(() => {
        if (newTarget) newTarget.style.filter = "blur(0px)";
        curtain.style.transition = `opacity ${HALF_TRANSITION}ms ease-in-out`;
        curtain.style.opacity = "0";
      });

      // Clean up after full transition
      setTimeout(() => {
        curtain.remove();
        if (newTarget) {
          newTarget.style.transition = "";
          newTarget.style.filter = "";
        }
        if (toggleFab) toggleFab.style.pointerEvents = "";
      }, HALF_TRANSITION + 50);
    }, HALF_TRANSITION);
  }

  async function activate() {
    await loadSettings();
    isActive = true;
    document.body.classList.add("sfwx-active");
    chrome.storage.local.set({ sfwxActive: true });
    createToggleFab();

    // Check if we should show commit detail mode
    const stored = await new Promise(resolve => {
      chrome.storage.local.get("commitDetail", resolve);
    });

    if (stored.commitDetail) {
      // Came from a <> click — we have full commit data
      currentMode = "detail";
      const cd = stored.commitDetail;
      history.replaceState(null, "", `/${encodeURIComponent(settings.orgName)}/${encodeURIComponent(settings.repoName)}/commit/${cd.hash}`);
      buildDetailOverlay(cd);
      // Clean up so refreshing the page re-extracts from DOM
      chrome.storage.local.remove("commitDetail");
    } else if (isStatusPage()) {
      // Navigated directly to a tweet/status URL — extract from DOM
      currentMode = "detail";
      const mainTweet = await extractMainTweetFromDOM();
      history.replaceState(null, "", `/${encodeURIComponent(settings.orgName)}/${encodeURIComponent(settings.repoName)}/commit/${mainTweet.hash}`);
      buildDetailOverlay(mainTweet);
    } else {
      currentMode = "feed";
      disguiseUrl();
      buildOverlay();
      poll();
      pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    }

    // Must run AFTER overlay is built so fab is last in DOM order
    updateFabMode();
  }

  function deactivate() {
    isActive = false;
    document.body.classList.remove("sfwx-active");
    chrome.storage.local.set({ sfwxActive: false });

    // Restore original URL
    restoreUrl();

    // Remove overlays
    if (overlay) { overlay.remove(); overlay = null; }
    if (detailOverlay) { detailOverlay.remove(); detailOverlay = null; }
    commitListEl = null;
    lastRenderedDateGroup = null;
    currentDateCard = null;
    rowCounter = 0;
    seenTweetIds.clear();
    seenReplyIds.clear();
    currentMode = "feed";

    // Stop polling
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (detailPollTimer) { clearInterval(detailPollTimer); detailPollTimer = null; }

    // Keep fab alive but update its mode
    updateFabMode();
  }

  // ================================================================
  // Message listener + Auto-activate
  // ================================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "toggle") {
      if (isActive) {
        deactivate();
      } else {
        activate();
      }
      sendResponse({ active: isActive });
    } else if (message.action === "getStatus") {
      sendResponse({ active: isActive });
    }
    return true;
  });

  // Auto-activate on load, and always ensure FAB exists
  function boot() {
    createToggleFab();
    activate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot());
  } else {
    boot();
  }
})();
