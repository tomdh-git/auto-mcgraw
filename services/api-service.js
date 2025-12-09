/**
 * Gemini API Service
 * Handles all interactions with the Gemini API
 */

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-pro-preview", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
let currentModelIndex = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 1000;
let MIN_REQUEST_INTERVAL = 0; // Reactive pacing: rely on 429s
let lastRequestTimestamp = 0;

/**
 * Validates a Gemini API key by making a test request
 * @param {string} apiKey - The API key to validate
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
async function validateApiKey(apiKey) {
    if (!apiKey || apiKey.trim() === "") {
        return { valid: false, error: "API key is required" };
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODELS[0]}?key=${apiKey}`
        );

        if (response.ok) {
            return { valid: true };
        } else if (response.status === 400) {
            const data = await response.json();
            return { valid: false, error: data.error?.message || "Invalid API key" };
        } else if (response.status === 403) {
            return { valid: false, error: "API key is invalid or doesn't have permission" };
        } else {
            return { valid: false, error: `Validation failed with status ${response.status}` };
        }
    } catch (error) {
        return { valid: false, error: `Network error: ${error.message}` };
    }
}

/**
 * Formats a question for the Gemini API
 * EXACT format from original gemini.js - DO NOT MODIFY
 * @param {Object} questionData - The question data from McGraw Hill
 * @returns {string} Formatted prompt text
 */
function formatQuestionPrompt(questionData) {
    const { type, question, options, previousCorrection } = questionData;
    let text = `Type: ${type}\nQuestion: ${question}`;

    if (
        previousCorrection &&
        previousCorrection.question &&
        previousCorrection.correctAnswer
    ) {
        text =
            `CORRECTION FROM PREVIOUS ANSWER: For the question "${previousCorrection.question
            }", your answer was incorrect. The correct answer was: ${JSON.stringify(
                previousCorrection.correctAnswer
            )}\n\nNow answer this new question:\n\n` + text;
    }

    if (type === "matching") {
        text +=
            "\nPrompts:\n" +
            options.prompts.map((prompt, i) => `${i + 1}. ${prompt}`).join("\n");
        text +=
            "\nChoices:\n" +
            options.choices.map((choice, i) => `${i + 1}. ${choice}`).join("\n");
        text +=
            "\n\nPlease match each prompt with the correct choice. Format your answer as an array where each element is 'Prompt -> Choice'.";
    } else if (type === "fill_in_the_blank") {
        text +=
            "\n\nThis is a fill in the blank question. If there are multiple blanks, provide answers as an array in order of appearance. For a single blank, you can provide a string.";
    } else if (type === "multiple_select") {
        // Multiple select - explicitly request array format
        text +=
            "\nOptions:\n" + options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
        text +=
            "\n\nIMPORTANT: This is a multiple-select question. Your answer must be an ARRAY containing ALL correct options. Each answer must EXACTLY match one of the above options. Do not include numbers. If there are periods, include them. Format: [\"option1\", \"option2\", ...]";
    } else if (options && options.length > 0) {
        // Single select (multiple choice or true/false)
        text +=
            "\nOptions:\n" + options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
        text +=
            "\n\nIMPORTANT: Your answer must EXACTLY match one of the above options. Do not include numbers in your answer. If there are periods, include them.";
    }

    text +=
        '\n\nPlease provide your answer in raw JSON format with keys "answer" and "explanation". Do not use Markdown formatting (no backticks). Explanations should be no more than one sentence. DO NOT acknowledge the correction in your response, only answer the new question.';

    return text;
}

/**
 * Sends a question to the Gemini API and gets a response
 * @param {string} apiKey - The Gemini API key
 * @param {Object} questionData - The question data
 * @param {number} retryCount - Current retry attempt
 * @param {function} onStatusUpdate - Callback for status updates
 * @param {boolean} isSameModelRetry - Whether we are retrying the same model (Stage 1)
 * @param {number} switchCount - How many times we have switched models
 * @returns {Promise<Object>} The parsed API response
 */
async function askGemini(apiKey, questionData, retryCount = 0, onStatusUpdate = null, isSameModelRetry = false, switchCount = 0) {
    if (!apiKey) {
        throw new Error("API key is required");
    }

    // Proactive Pacing
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTimestamp;

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        console.log(`[Gemini API] Pacing request. Waiting ${waitTime / 1000}s...`);

        if (onStatusUpdate) {
            const shouldContinue = await onStatusUpdate({
                type: "logToConsole",
                message: `Pacing request... (${(waitTime / 1000).toFixed(1)}s)`,
                level: "action"
            });

            if (shouldContinue === false) {
                throw new Error("Request cancelled by user during pacing");
            }
        }

        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    lastRequestTimestamp = Date.now();

    const prompt = formatQuestionPrompt(questionData);

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: prompt,
                    },
                ],
            },
        ],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    try {
        const currentModel = MODELS[currentModelIndex];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;

        console.log("=== GEMINI API REQUEST ===");
        console.log("URL:", url);

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        console.log("=== GEMINI API RESPONSE ===");
        console.log("Status:", response.status);

        if (!response.ok) {
            // Handle 429 Rate Limit specifically
            if (response.status === 429 && retryCount < MAX_RETRIES) {
                console.warn(`[Gemini API] Rate limit exceeded (429). Retry ${retryCount + 1}/${MAX_RETRIES}`);

                // STICKY RETRY LOGIC:
                // 1. If it's the FIRST rate limit for this model (!isSameModelRetry), wait the requested time and retry SAME model.
                // 2. If it's the SECOND rate limit (isSameModelRetry), THEN switch models.

                if (!isSameModelRetry) {
                    // --- STAGE 1: Wait & Retry Same Model ---
                    let waitTime = 2000; // Default 2s

                    // Check if error message has a specific wait time
                    if (data.error && data.error.message) {
                        const match = data.error.message.match(/retry after (\d+) seconds/i);
                        if (match) {
                            waitTime = (parseInt(match[1]) + 1) * 1000; // Add 1s buffer
                            console.log(`[Gemini API] Server requested wait: ${match[1]}s`);
                        }
                    }

                    if (onStatusUpdate) {
                        const shouldContinue = await onStatusUpdate({
                            type: "logToConsole",
                            message: `Rate limit on ${MODELS[currentModelIndex]}. Waiting ${Math.ceil(waitTime / 1000)}s...`,
                            level: "warning"
                        });
                        if (shouldContinue === false) {
                            throw new Error("Request cancelled by user during rate limit wait");
                        }
                    }

                    await new Promise((resolve) => setTimeout(resolve, waitTime));

                    // Recursive call with isSameModelRetry = true
                    // PASS switchCount!
                    return askGemini(apiKey, questionData, retryCount, onStatusUpdate, true, switchCount);

                } else {
                    // --- STAGE 2: Switch Models ---

                    console.warn(`[Gemini API] DEBUG: switchCount=${switchCount}, Limit=${MODELS.length * 2}`);

                    if (switchCount >= MODELS.length * 2) {
                        // We cycled through everything twice. Time to rotate key.
                        console.warn("[Gemini API] All models exhausted. Initiating Key Rotation...");

                        if (onStatusUpdate) {
                            await onStatusUpdate({
                                type: "logToConsole",
                                message: "All models exhausted. Opening AI Studio to rotate key...",
                                level: "action"
                            });
                        }

                        // Call rotateApiKey logic
                        const newKey = await rotateApiKey();

                        if (onStatusUpdate) {
                            await onStatusUpdate({
                                type: "logToConsole",
                                message: "Key rotation successful. Resuming...",
                                level: "success"
                            });
                        }

                        // Reset counters and try again with new key
                        return askGemini(newKey, questionData, 0, onStatusUpdate, false, 0);
                    }

                    console.warn(`[Gemini API] Rate limit persists on ${MODELS[currentModelIndex]}. Switching models...`);
                    currentModelIndex = (currentModelIndex + 1) % MODELS.length;
                    console.log(`[Gemini API] New model: ${MODELS[currentModelIndex]}`);

                    if (onStatusUpdate) {
                        const shouldContinue = await onStatusUpdate({
                            type: "logToConsole",
                            message: `Rate limit persists. Switching to ${MODELS[currentModelIndex]} (Attempt ${switchCount + 1}/${MODELS.length * 2})...`,
                            level: "warning"
                        });

                        if (shouldContinue === false) {
                            throw new Error("Request cancelled by user during rate limit switch");
                        }
                    }

                    // Tiny debounce
                    const switchDelay = 1000;
                    await new Promise((resolve) => setTimeout(resolve, switchDelay));

                    // Recursive call with isSameModelRetry = false (reset logic for new model)
                    return askGemini(apiKey, questionData, retryCount, onStatusUpdate, false, switchCount + 1);
                }
            }

            // Handle 503 Service Unavailable or 500 Internal Server Error
            if ((response.status === 503 || response.status === 500) && retryCount < MAX_RETRIES) {
                console.warn(`[Gemini API] Server error (${response.status}). Retry ${retryCount + 1}/${MAX_RETRIES}`);
                const waitTime = 1000 * Math.pow(2, retryCount);

                if (onStatusUpdate) {
                    const shouldContinue = await onStatusUpdate({
                        type: "logToConsole",
                        message: `Server error (${response.status}). Retrying...`,
                        level: "warning"
                    });
                    if (shouldContinue === false) {
                        throw new Error("Request cancelled by user during server error wait");
                    }
                }

                await new Promise((resolve) => setTimeout(resolve, waitTime));
                return askGemini(apiKey, questionData, retryCount + 1, onStatusUpdate, false, switchCount);
            }

            // Handle 400 "API Not Found" or "Invalid Key" (User Deleted Key)
            if (response.status === 400) {
                const errText = (data.error?.message || "").toLowerCase();
                // Checks for "API key not found" or "API key not valid"
                if (errText.includes("api key not found") || errText.includes("api key not valid") || errText.includes("check your api key")) {
                    console.warn("[Gemini API] Invalid/Deleted Key detected. Initiating Key Rotation...");

                    if (onStatusUpdate) {
                        await onStatusUpdate({
                            type: "logToConsole",
                            message: "Invalid API Key detected. Rotating key...",
                            level: "action"
                        });
                    }

                    // Call rotateApiKey logic
                    const newKey = await rotateApiKey();

                    if (onStatusUpdate) {
                        await onStatusUpdate({
                            type: "logToConsole",
                            message: "New key rotated. Retrying...",
                            level: "success"
                        });
                    }

                    // Retry immediately with new key, reset retry count for this new key
                    return askGemini(newKey, questionData, 0, onStatusUpdate, false, 0);
                }
            }

            // Handle other API errors (400, 403, 404, etc.)
            const errorMessage = data.error?.message || `API Error: ${response.status}`;
            console.error(`[Gemini API] Non-retriable error: ${errorMessage}`);

            if (onStatusUpdate) {
                await onStatusUpdate({
                    type: "logToConsole",
                    message: `API Error (${response.status}): ${errorMessage}`,
                    level: "error"
                });
            }

            throw new Error(
                data.error?.message || `API failed: ${response.status} - ${JSON.stringify(data)}`
            );
        }

        if (data.candidates && data.candidates[0]) {
            const candidate = data.candidates[0];

            if (candidate.finishReason && candidate.finishReason !== "STOP") {
                throw new Error(`Stopped: ${candidate.finishReason} - ${JSON.stringify(data)}`);
            }

            if (candidate.content && candidate.content.parts && candidate.content.parts[0]) {
                const responseText = candidate.content.parts[0].text;

                if (!responseText) {
                    throw new Error(`Empty response - ${JSON.stringify(data)}`);
                }

                console.log("Response Text:", responseText);

                // Clean response of potential markdown
                let cleanText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

                try {
                    const parsedResponse = JSON.parse(cleanText);
                    return parsedResponse;
                } catch (parseError) {
                    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        return JSON.parse(jsonMatch[0]);
                    }
                    throw new Error(`Parse failed: ${responseText}`);
                }
            } else {
                throw new Error(`No content - ${JSON.stringify(data)}`);
            }
        } else {
            throw new Error(`No candidates - ${JSON.stringify(data)}`);
        }
    } catch (error) {
        console.error("=== GEMINI API ERROR ===", error);

        // Network errors (fetch failed) OR MAX_TOKENS errors - retry
        if (retryCount < MAX_RETRIES && (error.message.includes("fetch") || error.message.includes("MAX_TOKENS"))) {
            const delay = RETRY_DELAY * Math.pow(2, retryCount);
            const isTokenError = error.message.includes("MAX_TOKENS");
            const msg = isTokenError ? "Response truncated (Max Tokens). Retrying..." : "Network error. Retrying...";

            if (onStatusUpdate) {
                const shouldContinue = await onStatusUpdate({
                    type: "logToConsole",
                    message: msg,
                    level: "warning"
                });
                if (shouldContinue === false) {
                    throw new Error("Request cancelled by user during retry");
                }
            }

            await new Promise((resolve) => setTimeout(resolve, delay));

            return askGemini(apiKey, questionData, retryCount + 1, onStatusUpdate, isSameModelRetry, switchCount);
        }

        throw error;
    }
}

/**
 * Gets the stored API key from Chrome storage
 * @returns {Promise<string|null>}
 */
async function getApiKey() {
    return new Promise((resolve) => {
        chrome.storage.sync.get("geminiApiKey", (data) => {
            resolve(data.geminiApiKey || null);
        });
    });
}

/**
 * Saves the API key to Chrome storage
 * @param {string} apiKey - The API key to save
 * @returns {Promise<void>}
 */
async function saveApiKey(apiKey) {
    return new Promise((resolve) => {
        chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
            resolve();
        });
    });
}

/**
 * Automates the rotation of the API key using Google AI Studio
 * @returns {Promise<string>} The new API key
 */
async function rotateApiKey() {
    return new Promise((resolve, reject) => {
        const aiStudioProjectsUrl = "https://aistudio.google.com/u/1/projects";
        const aiStudioKeysUrl = "https://aistudio.google.com/u/1/api-keys?project=gen-lang-client-0686872965";

        // 1. Open AI Studio - Projects Page
        chrome.tabs.create({ url: aiStudioProjectsUrl, active: true }, (tab) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }

            // --- STAGE 1: Project Cleanup ---
            let tabId = tab.id;
            const maxChecks = 60; // 120s timeout total (conservative)
            let checks = 0;

            const interval = setInterval(() => {
                checks++;

                // Poll for Project Cleanup
                // We assume content script loads on /projects too.
                chrome.tabs.sendMessage(tabId, { type: "performProjectCleanup" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log("Waiting for cleanup script...");
                    } else if (response) {
                        if (response.success) {
                            console.log("Project cleanup finished. Proceeding to Key Rotation...");
                            clearInterval(interval);

                            // --- STAGE 2: Navigate to Keys Page ---
                            chrome.tabs.update(tabId, { url: aiStudioKeysUrl }, () => {
                                // Wait for navigation and load
                                // Start polling for Key Rotation
                                startKeyRotationPolling(tabId, resolve, reject);
                            });
                        } else {
                            console.error("Project cleanup failed:", response.error);
                            clearInterval(interval);
                            reject(new Error(response.error));
                        }
                    }
                });

                if (checks >= maxChecks) {
                    clearInterval(interval);
                    reject(new Error("Timeout waiting for project cleanup"));
                }
            }, 2000);
        });
    });
}

function startKeyRotationPolling(tabId, resolve, reject) {
    let checks = 0;
    const maxChecks = 60; // 120s

    const interval = setInterval(() => {
        checks++;
        chrome.tabs.sendMessage(tabId, { type: "performKeyRotation" }, (response) => {
            if (chrome.runtime.lastError) {
                console.log("Waiting for rotation script...");
            } else if (response) {
                if (response.success && response.apiKey) {
                    console.log("Key rotation logic finished success.");
                    clearInterval(interval);

                    saveApiKey(response.apiKey).then(() => {
                        chrome.tabs.remove(tabId);
                        resolve(response.apiKey);
                    });
                } else if (response.error) {
                    console.error("Key rotation logic failed:", response.error);
                    clearInterval(interval);
                    reject(new Error(response.error));
                }
            }
        });

        if (checks >= maxChecks) {
            clearInterval(interval);
            reject(new Error("Timeout waiting for key rotation script"));
        }
    }, 2000);
}

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        validateApiKey,
        askGemini,
        getApiKey,
        saveApiKey,
        rotateApiKey
    };
}
