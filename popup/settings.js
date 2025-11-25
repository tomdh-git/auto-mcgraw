// Import API service functions
let validateApiKey, getApiKey, saveApiKey;

// Load API service dynamically
(async function loadApiService() {
    const apiServiceUrl = chrome.runtime.getURL("services/api-service.js");
    const apiServiceModule = await import(apiServiceUrl);

    // For modules, we can destructure from default or named exports
    // Since we're using script type, we'll access from window object instead
})();

document.addEventListener("DOMContentLoaded", function () {
    const apiKeyInput = document.getElementById("api-key-input");
    const toggleVisibilityBtn = document.getElementById("toggle-visibility");
    const saveApiKeyBtn = document.getElementById("save-api-key");
    const testConnectionBtn = document.getElementById("test-connection");
    const helpButton = document.getElementById("help-button");
    const statusMessage = document.getElementById("status-message");
    const currentVersionElement = document.getElementById("current-version");
    const latestVersionElement = document.getElementById("latest-version");
    const versionStatusElement = document.getElementById("version-status");
    const checkUpdatesButton = document.getElementById("check-updates");
    const footerVersionElement = document.getElementById("footer-version");

    const currentVersion = chrome.runtime.getManifest().version;
    currentVersionElement.textContent = `v${currentVersion}`;
    footerVersionElement.textContent = `v${currentVersion}`;

    checkForUpdates();

    // Load saved API key
    chrome.storage.sync.get("geminiApiKey", function (data) {
        if (data.geminiApiKey) {
            apiKeyInput.value = data.geminiApiKey;
            updateStatus("API key configured. Click 'Test Connection' to verify.", "success");
        } else {
            updateStatus("No API key configured. Enter your Gemini API key to get started.", "");
        }
    });

    // Toggle API key visibility
    toggleVisibilityBtn.addEventListener("click", function () {
        if (apiKeyInput.type === "password") {
            apiKeyInput.type = "text";
            toggleVisibilityBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      `;
        } else {
            apiKeyInput.type = "password";
            toggleVisibilityBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;
        }
    });

    // Save API key
    saveApiKeyBtn.addEventListener("click", async function () {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            updateStatus("Please enter an API key", "error");
            apiKeyInput.classList.add("error");
            apiKeyInput.classList.remove("success");
            return;
        }

        saveApiKeyBtn.disabled = true;
        saveApiKeyBtn.textContent = "Saving...";

        try {
            await chrome.storage.sync.set({ geminiApiKey: apiKey });
            apiKeyInput.classList.remove("error");
            apiKeyInput.classList.add("success");
            updateStatus("API key saved successfully!", "success");
            saveApiKeyBtn.textContent = "Saved!";

            setTimeout(() => {
                saveApiKeyBtn.textContent = "Save API Key";
                saveApiKeyBtn.disabled = false;
            }, 2000);
        } catch (error) {
            updateStatus("Failed to save API key: " + error.message, "error");
            apiKeyInput.classList.add("error");
            apiKeyInput.classList.remove("success");
            saveApiKeyBtn.textContent = "Save API Key";
            saveApiKeyBtn.disabled = false;
        }
    });

    // Test API connection
    testConnectionBtn.addEventListener("click", async function () {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            updateStatus("Please enter an API key first", "error");
            apiKeyInput.classList.add("error");
            return;
        }

        testConnectionBtn.disabled = true;
        testConnectionBtn.textContent = "Testing...";
        updateStatus("Testing API connection...", "checking");

        try {
            // Send message to background script to test API
            const response = await chrome.runtime.sendMessage({
                type: "testApiKey",
                apiKey: apiKey
            });

            if (response.valid) {
                updateStatus("API connection successful! Ready to use.", "success");
                apiKeyInput.classList.remove("error");
                apiKeyInput.classList.add("success");
                testConnectionBtn.textContent = "Connected!";

                setTimeout(() => {
                    testConnectionBtn.textContent = "Test Connection";
                    testConnectionBtn.disabled = false;
                }, 2000);
            } else {
                updateStatus("API connection failed: " + (response.error || "Unknown error"), "error");
                apiKeyInput.classList.add("error");
                apiKeyInput.classList.remove("success");
                testConnectionBtn.textContent = "Test Connection";
                testConnectionBtn.disabled = false;
            }
        } catch (error) {
            updateStatus("Failed to test connection: " + error.message, "error");
            apiKeyInput.classList.add("error");
            apiKeyInput.classList.remove("success");
            testConnectionBtn.textContent = "Test Connection";
            testConnectionBtn.disabled = false;
        }
    });

    // Help button
    helpButton.addEventListener("click", function () {
        chrome.tabs.create({
            url: "https://aistudio.google.com/app/apikey"
        });
    });

    // Check for updates
    checkUpdatesButton.addEventListener("click", checkForUpdates);

    // Clear input validation states on input
    apiKeyInput.addEventListener("input", function () {
        apiKeyInput.classList.remove("error", "success");
    });

    function updateStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = type;
    }

    async function checkForUpdates() {
        try {
            versionStatusElement.textContent = "Checking for updates...";
            versionStatusElement.className = "checking";
            checkUpdatesButton.disabled = true;
            latestVersionElement.textContent = "Checking...";

            const response = await fetch(
                "https://api.github.com/repos/GooglyBlox/auto-mcgraw/releases/latest"
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const releaseData = await response.json();
            const latestVersion = releaseData.tag_name.replace("v", "");
            latestVersionElement.textContent = `v${latestVersion}`;

            const currentVersionParts = currentVersion.split(".").map(Number);
            const latestVersionParts = latestVersion.split(".").map(Number);

            let isUpdateAvailable = false;

            for (
                let i = 0;
                i < Math.max(currentVersionParts.length, latestVersionParts.length);
                i++
            ) {
                const current = currentVersionParts[i] || 0;
                const latest = latestVersionParts[i] || 0;

                if (latest > current) {
                    isUpdateAvailable = true;
                    break;
                } else if (current > latest) {
                    break;
                }
            }

            if (isUpdateAvailable) {
                versionStatusElement.textContent = `New version ${releaseData.tag_name} is available!`;
                versionStatusElement.className = "update-available";

                versionStatusElement.style.cursor = "pointer";
                versionStatusElement.onclick = () => {
                    chrome.tabs.create({ url: releaseData.html_url });
                };
            } else {
                versionStatusElement.textContent = "You're using the latest version!";
                versionStatusElement.className = "up-to-date";
                versionStatusElement.style.cursor = "default";
                versionStatusElement.onclick = null;
            }
        } catch (error) {
            console.error("Error checking for updates:", error);
            versionStatusElement.textContent =
                "Error checking for updates. Please try again later.";
            versionStatusElement.className = "error";
            latestVersionElement.textContent = "Error";
        } finally {
            checkUpdatesButton.disabled = false;
        }
    }
});
