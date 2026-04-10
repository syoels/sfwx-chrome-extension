// ============================================================
// GitDisguise — Content Script (Overlay Architecture)
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
  // Global state
  // ================================================================
  let overlay = null;
  let commitListEl = null;
  let lastRenderedDateGroup = null;
  let isActive = false;
  let currentMode = "feed"; // "feed" or "detail"
  let pollTimer = null;

  // ================================================================
  // Message listener
  // ================================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "toggle") {
      isActive ? deactivate() : activate();
      sendResponse({ active: isActive });
    } else if (message.action === "getStatus") {
      sendResponse({ active: isActive });
    }
    return true;
  });

  function activate() {
    isActive = true;
    document.body.classList.add("gitdisguise-active");
    chrome.storage.local.set({ gitDisguiseActive: true });
    loadSettings().then(() => {
      disguiseUrl();
    });
  }

  function deactivate() {
    isActive = false;
    document.body.classList.remove("gitdisguise-active");
    chrome.storage.local.set({ gitDisguiseActive: false });

    // Restore original URL
    restoreUrl();

    // Remove overlays
    if (overlay) { overlay.remove(); overlay = null; }
    commitListEl = null;
    lastRenderedDateGroup = null;
    currentMode = "feed";

    // Stop polling
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => activate());
  } else {
    activate();
  }
})();
