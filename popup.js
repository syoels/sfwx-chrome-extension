// GitDisguise — Popup script
(function () {
  const toggleBtn = document.getElementById("toggleBtn");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  let currentActive = false;

  function updateUI(active) {
    currentActive = active;
    if (active) {
      statusDot.classList.add("active");
      statusText.textContent = "Disguise is ON";
      toggleBtn.textContent = "Disable Disguise";
      toggleBtn.className = "toggle-btn deactivate";
    } else {
      statusDot.classList.remove("active");
      statusText.textContent = "Disguise is OFF";
      toggleBtn.textContent = "Enable Disguise";
      toggleBtn.className = "toggle-btn activate";
    }
  }

  // Check current state
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;

    const url = tab.url || "";
    if (!url.includes("twitter.com") && !url.includes("x.com")) {
      statusText.textContent = "Not on Twitter/X";
      toggleBtn.disabled = true;
      toggleBtn.style.opacity = "0.5";
      toggleBtn.style.cursor = "not-allowed";
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: "getStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        statusText.textContent = "Reload the page first";
        toggleBtn.disabled = true;
        toggleBtn.style.opacity = "0.5";
        return;
      }
      updateUI(response && response.active);
    });
  });

  // Settings link
  document.getElementById("settingsLink").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Toggle button
  toggleBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;

      chrome.tabs.sendMessage(tab.id, { action: "toggle" }, (response) => {
        if (chrome.runtime.lastError) return;
        const active = response && response.active;
        updateUI(active);
        // Persist state
        chrome.storage.local.set({ gitDisguiseActive: active });
      });
    });
  });
})();
