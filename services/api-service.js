/**
 * Gemini API Service
 * Handles all interactions with the Gemini API
 */

const MODEL_NAME = "gemini-2.5-flash-lite";
const MAX_RETRIES = 5;
const RETRY_DELAY = 1000;

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
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}?key=${apiKey}`
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
        '\n\nPlease provide your answer in JSON format with keys "answer" and "explanation". Explanations should be no more than one sentence. DO NOT acknowledge the correction in your response, only answer the new question.';

    return text;
}

/**
 * Sends a question to the Gemini API and gets a response
 * @param {string} apiKey - The Gemini API key
 * @param {Object} questionData - The question data
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<Object>} The parsed API response
 */
async function askGemini(apiKey, questionData, retryCount = 0) {
    if (!apiKey) {
        throw new Error("API key is required");
    }

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
            maxOutputTokens: 2048,
        },
    };

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

        console.log("=== GEMINI API REQUEST ===");
        console.log("URL:", url);
        console.log("Request Body:", JSON.stringify(requestBody, null, 2));

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
        console.log("Full Response:", JSON.stringify(data, null, 2));

        if (!response.ok) {
            // Handle 429 Rate Limit specifically
            if (response.status === 429 && retryCount < MAX_RETRIES) {
                console.warn(`[Gemini API] Rate limit exceeded (429). Retry ${retryCount + 1}/${MAX_RETRIES}`);

                // Default wait time: 2 seconds * 2^retryCount (2s, 4s, 8s, 16s, 32s)
                let waitTime = 2000 * Math.pow(2, retryCount);

                // Check if error message has a specific wait time
                if (data.error && data.error.message) {
                    const match = data.error.message.match(/retry after (\d+) seconds/i);
                    if (match) {
                        waitTime = (parseInt(match[1]) + 1) * 1000; // Add 1s buffer
                        console.log(`[Gemini API] Server requested wait: ${match[1]}s`);
                    }
                }

                console.log(`[Gemini API] Waiting ${waitTime / 1000}s before retry...`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
                return askGemini(apiKey, questionData, retryCount + 1);
            }

            // Handle 503 Service Unavailable or 500 Internal Server Error
            if ((response.status === 503 || response.status === 500) && retryCount < MAX_RETRIES) {
                console.warn(`[Gemini API] Server error (${response.status}). Retry ${retryCount + 1}/${MAX_RETRIES}`);
                const waitTime = 1000 * Math.pow(2, retryCount);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
                return askGemini(apiKey, questionData, retryCount + 1);
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

                try {
                    const parsedResponse = JSON.parse(responseText);
                    return parsedResponse;
                } catch (parseError) {
                    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
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

        // Network errors (fetch failed) - retry
        if (retryCount < MAX_RETRIES && error.message.includes("fetch")) {
            const delay = RETRY_DELAY * Math.pow(2, retryCount);
            await new Promise((resolve) => setTimeout(resolve, delay));
            return askGemini(apiKey, questionData, retryCount + 1);
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

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        validateApiKey,
        askGemini,
        getApiKey,
        saveApiKey,
    };
}
