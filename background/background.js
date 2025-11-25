// Import API service
importScripts("../services/api-service.js");

let mheTabId = null;
let processingQuestion = false;

// ==================== DEBUG LOGGING ====================
function debugLog(section, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${section}] ${message}`);
  if (data) {
    console.log(`[${timestamp}] [${section}] Data:`, JSON.stringify(data, null, 2));
  }
}

function debugError(section, message, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [${section}] ERROR: ${message}`);
  console.error(`[${timestamp}] [${section}] Error details:`, error);
}

// ==================== MESSAGE HANDLING ====================

/**
 * Sends a message to a tab with retry logic
 */
function sendMessageWithRetry(tabId, message, maxAttempts = 3, delay = 1000) {
  debugLog("sendMessageWithRetry", `Sending message to tab ${tabId}`, message);

  return new Promise((resolve, reject) => {
    let attempts = 0;

    function attemptSend() {
      attempts++;
      debugLog("sendMessageWithRetry", `Attempt ${attempts}/${maxAttempts}`);

      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          debugError("sendMessageWithRetry", `Attempt ${attempts} failed`, chrome.runtime.lastError);

          if (attempts < maxAttempts) {
            setTimeout(attemptSend, delay);
          } else {
            reject(chrome.runtime.lastError);
          }
        } else {
          debugLog("sendMessageWithRetry", "Message sent successfully", response);
          resolve(response);
        }
      });
    }

    attemptSend();
  });
}

// ==================== QUESTION PROCESSING ====================

/**
 * Processes a question from McGraw Hill
 * Uses EXACT same logic as original gemini.js but with direct API calls
 */
async function processQuestion(message) {
  debugLog("processQuestion", "=== STARTING QUESTION PROCESSING ===");
  debugLog("processQuestion", "Received question", message.question);

  if (processingQuestion) {
    debugLog("processQuestion", "Already processing a question, skipping");
    return;
  }

  processingQuestion = true;

  try {
    mheTabId = message.sourceTabId;
    debugLog("processQuestion", `McGraw Hill tab ID: ${mheTabId}`);

    // Get API key from storage
    debugLog("processQuestion", "Retrieving API key from storage");
    const data = await chrome.storage.sync.get("geminiApiKey");
    const apiKey = data.geminiApiKey;

    if (!apiKey) {
      debugError("processQuestion", "No API key configured", null);
      await sendMessageWithRetry(mheTabId, {
        type: "alertMessage",
        message:
          "Please configure your Gemini API key in the extension settings before using automation.",
      });
      processingQuestion = false;
      return;
    }

    debugLog("processQuestion", "API key retrieved successfully");
    debugLog("processQuestion", "Calling Gemini API...");

    try {
      // Call Gemini API directly - EXACT same prompt format as original
      debugLog("processQuestion", "=== CALLING GEMINI API ===");
      const apiResponse = await askGemini(apiKey, message.question);

      debugLog("processQuestion", "=== API RESPONSE RECEIVED ===", apiResponse);

      // Process response EXACTLY like original gemini.js
      let responseText;

      if (typeof apiResponse === "string") {
        responseText = apiResponse;
      } else if (apiResponse.answer) {
        // Already parsed JSON with answer field
        responseText = JSON.stringify(apiResponse);
      } else {
        // Try to stringify if it's an object
        responseText = JSON.stringify(apiResponse);
      }

      debugLog("processQuestion", "Response text prepared", { responseText });

      // Clean up response text - EXACT same as original
      responseText = responseText
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\n\s*/g, " ")
        .trim();

      debugLog("processQuestion", "Response text cleaned", { responseText });

      // Try to parse JSON from response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
        debugLog("processQuestion", "Response parsed successfully", parsedResponse);
      } catch (parseError) {
        debugLog("processQuestion", "Initial parse failed, trying to extract JSON");

        // Try to extract JSON from text - EXACT same as original
        const jsonPattern = /\{[\s\S]*?"answer"[\s\S]*?"explanation"[\s\S]*?\}/;
        const jsonMatch = responseText.match(jsonPattern);

        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
          debugLog("processQuestion", "JSON extracted and parsed", parsedResponse);
        } else {
          // Try simpler pattern
          const simpleMatch = responseText.match(/\{[\s\S]*\}/);
          if (simpleMatch) {
            parsedResponse = JSON.parse(simpleMatch[0]);
            debugLog("processQuestion", "JSON extracted with simple pattern", parsedResponse);
          } else {
            throw new Error("Could not find valid JSON in response");
          }
        }
      }

      // Verify we have an answer
      if (!parsedResponse || !parsedResponse.answer) {
        debugError("processQuestion", "No answer field in parsed response", parsedResponse);
        throw new Error("Response missing 'answer' field");
      }

      debugLog("processQuestion", "=== SENDING RESPONSE TO McGRAW HILL ===", parsedResponse);

      // Send response back to content script - EXACT message type as original
      await sendMessageWithRetry(mheTabId, {
        type: "processChatGPTResponse",
        response: JSON.stringify(parsedResponse),
      });

      debugLog("processQuestion", "=== QUESTION PROCESSING COMPLETE ===");

    } catch (apiError) {
      debugError("processQuestion", "API call failed", apiError);

      let errorMessage = "Failed to get response from Gemini AI.";

      if (apiError.message.includes("API key") || apiError.message.includes("403")) {
        errorMessage = "Invalid API key. Please check your API key in settings.";
      } else if (apiError.message.includes("quota") || apiError.message.includes("429")) {
        errorMessage = "API rate limit exceeded. Please wait a moment and try again.";
      } else if (apiError.message.includes("network") || apiError.message.includes("fetch")) {
        errorMessage = "Network error. Please check your internet connection.";
      } else if (apiError.message.includes("parse") || apiError.message.includes("JSON")) {
        errorMessage = "Failed to parse API response. The AI may have returned an invalid format.";
      } else if (apiError.message.includes("Stopped") || apiError.message.includes("blocked")) {
        errorMessage = "Content was blocked by safety filters. Try rephrasing the question.";
      }

      debugLog("processQuestion", "Sending error alert to user", { errorMessage });

      await sendMessageWithRetry(mheTabId, {
        type: "alertMessage",
        message: errorMessage + "\n\nError details: " + apiError.message,
      });
    }
  } catch (error) {
    debugError("processQuestion", "Unexpected error in question processing", error);

    if (mheTabId) {
      await sendMessageWithRetry(mheTabId, {
        type: "alertMessage",
        message: "An unexpected error occurred. Please try again.\n\nError: " + error.message,
      });
    }
  } finally {
    processingQuestion = false;
    debugLog("processQuestion", "Processing flag reset");
  }
}

// ==================== API KEY TESTING ====================

/**
 * Tests an API key
 */
async function testApiKey(apiKey) {
  debugLog("testApiKey", "Testing API key");

  try {
    const result = await validateApiKey(apiKey);
    debugLog("testApiKey", "Validation result", result);
    return result;
  } catch (error) {
    debugError("testApiKey", "Validation error", error);
    throw error;
  }
}

// ==================== MESSAGE LISTENERS ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog("onMessage", "Received message", { type: message.type, sender: sender.tab?.id });

  if (message.type === "sendQuestionToChatGPT") {
    debugLog("onMessage", "Question received from McGraw Hill");
    message.sourceTabId = sender.tab.id;
    processQuestion(message);
    sendResponse({ received: true });
    return true;
  }

  if (message.type === "openSettings") {
    debugLog("onMessage", "Opening settings");
    chrome.windows.create({
      url: chrome.runtime.getURL("popup/settings.html"),
      type: "popup",
      width: 450,
      height: 600,
    });
    return false;
  }

  if (message.type === "testApiKey") {
    debugLog("onMessage", "Testing API key");
    testApiKey(message.apiKey)
      .then((result) => {
        debugLog("onMessage", "Test result", result);
        sendResponse(result);
      })
      .catch((error) => {
        debugError("onMessage", "Test failed", error);
        sendResponse({ valid: false, error: error.message });
      });
    return true;
  }

  return false;
});

debugLog("background", "=== BACKGROUND SCRIPT LOADED ===");
