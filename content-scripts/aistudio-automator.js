// Automator for Google AI Studio API Key Creation
console.log("Auto-McGraw: AI Studio Automator loaded");

let isRotating = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "performKeyRotation") {
        if (isRotating) {
            console.log("Auto-McGraw: Rotation already in progress. Ignoring request.");
            sendResponse({ success: false, busy: true });
            return true;
        }

        isRotating = true;
        console.log("Auto-McGraw: Starting key rotation...");

        performRotation()
            .then(newKey => {
                console.log("Auto-McGraw: Key rotation successful");
                sendResponse({ success: true, apiKey: newKey });
                isRotating = false;
            })
            .catch(error => {
                console.error("Auto-McGraw: Key rotation failed", error);
                sendResponse({ success: false, error: error.message });
                isRotating = false;
            });
        return true; // Keep channel open
    }

    if (message.type === "performProjectCleanup") {
        console.log("Auto-McGraw: Starting Project Cleanup...");
        cleanupProjects()
            .then(() => {
                console.log("Auto-McGraw: Project cleanup successful");
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error("Auto-McGraw: Project cleanup failed", error);
                sendResponse({ success: false, error: error.message });
            });
        return true;
    }
});

async function cleanupProjects() {
    console.log("Starting project cleanup loop...");
    let attempts = 0;

    // We max out at say 50 deletions to avoid infinite loops
    while (attempts < 50) {
        attempts++;
        // 1. "View more actions" button
        // User Selector: <button ... aria-label="View more actions" ... iconname="more_vert" ...>
        const moreMenuBtn = await waitForElementOptional('button[aria-label="View more actions"][iconname="more_vert"]', 2000);

        if (!moreMenuBtn) {
            console.log("No more project menus found.");
            break;
        }

        console.log(`Found project to delete (Attempt ${attempts})...`);
        moreMenuBtn.click();
        await delay(2000);

        // 2. "Remove project" menu item
        // User Selector: <button ... data-test-remove-project ...>
        const deleteOption = await waitForElement('button[data-test-remove-project]', 2000);
        deleteOption.click();
        await delay(2000);

        // 3. Confirm "Remove" button
        // User Selector: <button ... class="ms-button-primary"> Remove </button>
        // Use text content check to be sure, or just the primary button in dialog.
        const confirmDeleteBtn = await waitForElement('button.ms-button-primary', 2000, (el) => el.textContent.includes("Remove"));
        confirmDeleteBtn.click();

        console.log("Project deletion confirmed. Waiting 2s...");
        await delay(2000);
    }
}

async function performRotation() {
    try {
        // 1. Delete ALL existing keys
        await deleteAllKeys();

        console.log("Waiting 2s after deletion phase...");
        await delay(2000);

        // 2. Create new key
        const newKey = await createNewKey();

        return newKey;
    } catch (e) {
        console.error("Rotation steps failed:", e);
        throw e;
    }
}

async function deleteAllKeys() {
    console.log("Checking for existing keys to delete...");

    // Loop until no "more_vert" buttons are found
    // We max out at say 20 deletions to avoid infinite loops
    let attempts = 0;
    while (attempts < 20) {
        attempts++;
        // User Selector: <button ... aria-label="View more actions" iconname="more_vert" ...>
        // We only look for ONE at a time.
        const moreMenuBtn = await waitForElementOptional('button[iconname="more_vert"][aria-label="View more actions"]', 2000);

        if (!moreMenuBtn) {
            console.log("No more keys found.");
            break;
        }

        console.log(`Found key to delete (Attempt ${attempts})...`);
        moreMenuBtn.click();
        await delay(2000); // 2s after click

        // Wait for menu item: "Delete key"
        // User Selector: <span class="mat-mdc-menu-item-text">... Delete key ...</span>
        const deleteOption = await waitForElement('button.mat-mdc-menu-item span.mat-mdc-menu-item-text', 2000, (el) => el.textContent.includes("Delete key"));
        deleteOption.click();
        await delay(2000); // 2s after click

        // Wait for confirmation dialog "Delete" button
        // User Selector: <button ...> Delete <span ... keyboard_return ...>
        const confirmDeleteBtn = await waitForElement('button.ms-button-primary', 2000, (el) => el.textContent.includes("Delete"));
        confirmDeleteBtn.click();

        console.log("Deletion confirmed. Waiting 2s...");
        await delay(2000); // 2s after click
    }
}

async function createNewKey() {
    console.log("Creating new key...");

    // 1. Click "Create API key"
    const createBtn = await waitForElement('button[data-test-id="create-api-key-button"]');
    createBtn.click();
    await delay(2000);

    // 2. "Name your key" input -> type "123"
    const keyNameInput = await waitForElement('input[aria-label="Name your key"]');
    await typeInInput(keyNameInput, "123");
    await delay(2000);

    // 3. Click "Select a Cloud Project" dropdown
    const projectSelect = await waitForElement('#project-select-input .mat-mdc-select-trigger');
    projectSelect.click();
    await delay(2000);

    // 4. Click "Import project" option
    // User Selector: <a class="import-project-button">
    const importProjectBtn = await waitForElement('.import-project-button');
    importProjectBtn.click();
    await delay(2000);

    // 5. Click the checkbox to select a project
    // User Selector: <input type="checkbox" class="mdc-checkbox__native-control">
    const checkbox = await waitForElement('input.mdc-checkbox__native-control[type="checkbox"]');
    checkbox.click();
    await delay(2000);

    // 6. Click "Import" button
    // User Selector: <button data-test-id="import-projects-footer-button">
    const importBtn = await waitForElement('button[data-test-id="import-projects-footer-button"]');
    importBtn.click();
    await delay(2000);

    // 7. Select the imported project from dropdown
    // User Selector: <span class="mdc-list-item__primary-text"> containing "1234"
    const projectOption = await waitForElement('.mdc-list-item__primary-text', 5000, (el) => el.textContent.includes("1234"));
    projectOption.click();
    await delay(2000);

    // 8. Click "Create key" button
    const createKeyBtn = await waitForElement('button.ms-button-primary', 5000, (el) => el.textContent.trim() === "Create key");
    await waitForCondition(() => !createKeyBtn.hasAttribute("disabled") && createKeyBtn.getAttribute("aria-disabled") !== "true", 10000);
    createKeyBtn.click();
    await delay(2000);

    // 9. Copy the key
    console.log("Key creation requested. Waiting 2s for UI...");
    await delay(2000);

    const copyBtn = await waitForElement('button.xap-copy-to-clipboard', 10000);
    copyBtn.click();
    await delay(2000);

    // Locate the key text
    const keyElement = await waitForElementOptional('.api-key-value, .key-string, input[readonly], .mat-mdc-dialog-content code', 3000);
    if (keyElement) {
        return keyElement.value || keyElement.textContent.trim();
    }

    throw new Error("Could not locate API key text in UI. (Clicked copy button though)");
}


// --- Helpers ---

function waitForElement(selector, timeout = 10000, filterFn = null) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        function check() {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (!filterFn || filterFn(el)) {
                    resolve(el);
                    return;
                }
            }

            if (Date.now() - startTime >= timeout) {
                reject(new Error(`Timeout waiting for element: ${selector}`));
                return;
            }

            requestAnimationFrame(check);
        }

        check();
    });
}

function waitForElementOptional(selector, timeout = 2000) {
    return waitForElement(selector, timeout).catch(() => null);
}

function waitForCondition(predicate, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        function check() {
            if (predicate()) {
                resolve();
                return;
            }
            if (Date.now() - startTime >= timeout) {
                reject(new Error("Timeout waiting for condition"));
                return;
            }
            requestAnimationFrame(check);
        }
        check();
    });
}

async function typeInInput(element, text) {
    element.focus();
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await delay(200);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
