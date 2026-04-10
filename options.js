// SFWX — Options page script
(function () {
  const DEFAULTS = { orgName: "dev", repoName: "backend", branchName: "dev" };

  const orgInput = document.getElementById("orgName");
  const repoInput = document.getElementById("repoName");
  const branchInput = document.getElementById("branchName");
  const previewOrg = document.getElementById("previewOrg");
  const previewRepo = document.getElementById("previewRepo");
  const previewBranch = document.getElementById("previewBranch");
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetBtn");
  const savedMsg = document.getElementById("savedMsg");

  // Load saved settings
  chrome.storage.sync.get(["orgName", "repoName", "branchName"], (result) => {
    orgInput.value = result.orgName || DEFAULTS.orgName;
    repoInput.value = result.repoName || DEFAULTS.repoName;
    branchInput.value = result.branchName || DEFAULTS.branchName;
    updatePreview();
  });

  function updatePreview() {
    previewOrg.textContent = orgInput.value || DEFAULTS.orgName;
    previewRepo.textContent = repoInput.value || DEFAULTS.repoName;
    previewBranch.textContent = branchInput.value || DEFAULTS.branchName;
  }

  // Live preview as you type
  orgInput.addEventListener("input", updatePreview);
  repoInput.addEventListener("input", updatePreview);
  branchInput.addEventListener("input", updatePreview);

  // Save
  saveBtn.addEventListener("click", () => {
    chrome.storage.sync.set({
      orgName: orgInput.value || DEFAULTS.orgName,
      repoName: repoInput.value || DEFAULTS.repoName,
      branchName: branchInput.value || DEFAULTS.branchName
    }, () => {
      savedMsg.classList.add("show");
      setTimeout(() => savedMsg.classList.remove("show"), 2500);
    });
  });

  // Reset
  resetBtn.addEventListener("click", () => {
    orgInput.value = DEFAULTS.orgName;
    repoInput.value = DEFAULTS.repoName;
    branchInput.value = DEFAULTS.branchName;
    updatePreview();
    chrome.storage.sync.set(DEFAULTS, () => {
      savedMsg.textContent = "Reset to defaults!";
      savedMsg.classList.add("show");
      setTimeout(() => {
        savedMsg.classList.remove("show");
        savedMsg.textContent = "Settings saved! Changes apply immediately.";
      }, 2500);
    });
  });
})();
