let messageListener = null;
let isAutomating = false;
let lastIncorrectQuestion = null;
let lastCorrectAnswer = null;

function setupMessageListener() {
  console.log("[setupMessageListener] Setting up message listener");

  if (messageListener) {
    console.log("[setupMessageListener] Removing existing listener");
    chrome.runtime.onMessage.removeListener(messageListener);
  }

  messageListener = (message, sender, sendResponse) => {
    console.log("[Message Listener] Received message:", message.type);

    if (message.type === "processChatGPTResponse") {
      console.log("[Message Listener] Processing ChatGPT response");
      processChatGPTResponse(message.response);
      sendResponse({ received: true });
      return true;
    }

    if (message.type === "alertMessage") {
      console.log("[Message Listener] Showing alert:", message.message);
      alert(message.message);
      sendResponse({ received: true });
      return true;
    }
  };

  chrome.runtime.onMessage.addListener(messageListener);
  console.log("[setupMessageListener] Listener added successfully");
}

function handleTopicOverview() {
  const continueButton = document.querySelector(
    "awd-topic-overview-button-bar .next-button, .button-bar-wrapper .next-button"
  );

  if (
    continueButton &&
    continueButton.textContent.trim().toLowerCase().includes("continue")
  ) {
    continueButton.click();

    setTimeout(() => {
      if (isAutomating) {
        checkForNextStep();
      }
    }, 1000);

    return true;
  }
  return false;
}

function handleForcedLearning() {
  const forcedLearningAlert = document.querySelector(
    ".forced-learning .alert-error"
  );
  if (forcedLearningAlert) {
    const readButton = document.querySelector(
      '[data-automation-id="lr-tray_reading-button"]'
    );
    if (readButton) {
      readButton.click();

      waitForElement('[data-automation-id="reading-questions-button"]', 10000)
        .then((toQuestionsButton) => {
          toQuestionsButton.click();
          return waitForElement(".next-button", 10000);
        })
        .then((nextButton) => {
          nextButton.click();
          if (isAutomating) {
            setTimeout(() => {
              checkForNextStep();
            }, 1000);
          }
        })
        .catch((error) => {
          console.error("Error in forced learning flow:", error);
          isAutomating = false;
        });
      return true;
    }
  }
  return false;
}

function checkForNextStep() {
  console.log("[checkForNextStep] Called, isAutomating:", isAutomating);

  if (!isAutomating) {
    console.log("[checkForNextStep] Not automating, returning");
    return;
  }

  console.log("[checkForNextStep] Checking for topic overview");
  if (handleTopicOverview()) {
    console.log("[checkForNextStep] Handled topic overview");
    return;
  }

  console.log("[checkForNextStep] Checking for forced learning");
  if (handleForcedLearning()) {
    console.log("[checkForNextStep] Handled forced learning");
    return;
  }

  console.log("[checkForNextStep] Looking for question container");
  const container = document.querySelector(".probe-container");

  if (container && !container.querySelector(".forced-learning")) {
    console.log("[checkForNextStep] Container found, parsing question");
    const qData = parseQuestion();

    if (qData) {
      console.log("[checkForNextStep] Question parsed:", qData);
      console.log("[checkForNextStep] Sending message to background script");

      chrome.runtime.sendMessage({
        type: "sendQuestionToChatGPT",
        question: qData,
      }, (response) => {
        console.log("[checkForNextStep] Background script response:", response);
        if (chrome.runtime.lastError) {
          console.error("[checkForNextStep] Runtime error:", chrome.runtime.lastError);
        }
      });
    } else {
      console.log("[checkForNextStep] Question parsing returned null");
    }
  } else {
    console.log("[checkForNextStep] No container found or forced learning present");
  }
}

function extractCorrectAnswer() {
  const container = document.querySelector(".probe-container");
  if (!container) return null;

  const incorrectMarker = container.querySelector(
    ".awd-probe-correctness.incorrect"
  );
  if (!incorrectMarker) return null;

  let questionType = "";
  if (container.querySelector(".awd-probe-type-multiple_choice")) {
    questionType = "multiple_choice";
  } else if (container.querySelector(".awd-probe-type-true_false")) {
    questionType = "true_false";
  } else if (container.querySelector(".awd-probe-type-multiple_select")) {
    questionType = "multiple_select";
  } else if (container.querySelector(".awd-probe-type-fill_in_the_blank")) {
    questionType = "fill_in_the_blank";
  } else if (container.querySelector(".awd-probe-type-matching")) {
    questionType = "matching";
  }

  let questionText = "";
  const promptEl = container.querySelector(".prompt");

  if (questionType === "fill_in_the_blank" && promptEl) {
    const promptClone = promptEl.cloneNode(true);

    const spans = promptClone.querySelectorAll(
      "span.response-container, span.fitb-span, span.blank-label, span.correctness, span._visuallyHidden"
    );
    spans.forEach((span) => span.remove());

    const inputs = promptClone.querySelectorAll("input.fitb-input");
    inputs.forEach((input) => {
      const blankMarker = document.createTextNode("[BLANK]");
      input.parentNode.replaceChild(blankMarker, input);
    });

    questionText = promptClone.textContent.trim();
  } else {
    questionText = promptEl ? promptEl.textContent.trim() : "";
  }

  let correctAnswer = null;

  if (questionType === "multiple_choice" || questionType === "true_false") {
    try {
      const answerContainer = container.querySelector(
        ".answer-container .choiceText"
      );
      if (answerContainer) {
        correctAnswer = answerContainer.textContent.trim();
      } else {
        const correctAnswerContainer = container.querySelector(
          ".correct-answer-container"
        );
        if (correctAnswerContainer) {
          const answerText =
            correctAnswerContainer.querySelector(".choiceText");
          if (answerText) {
            correctAnswer = answerText.textContent.trim();
          } else {
            const answerDiv = correctAnswerContainer.querySelector(".choice");
            if (answerDiv) {
              correctAnswer = answerDiv.textContent.trim();
            }
          }
        }
      }
    } catch (e) {
      console.error("Error extracting multiple choice answer:", e);
    }
  } else if (questionType === "multiple_select") {
    try {
      const correctAnswersList = container.querySelectorAll(
        ".correct-answer-container .choice"
      );
      if (correctAnswersList && correctAnswersList.length > 0) {
        correctAnswer = Array.from(correctAnswersList).map((el) => {
          const choiceText = el.querySelector(".choiceText");
          return choiceText
            ? choiceText.textContent.trim()
            : el.textContent.trim();
        });
      }
    } catch (e) {
      console.error("Error extracting multiple select answers:", e);
    }
  } else if (questionType === "fill_in_the_blank") {
    try {
      const correctAnswersList = container.querySelectorAll(".correct-answers");

      if (correctAnswersList && correctAnswersList.length > 0) {
        if (correctAnswersList.length === 1) {
          const correctAnswerEl =
            correctAnswersList[0].querySelector(".correct-answer");
          if (correctAnswerEl) {
            correctAnswer = correctAnswerEl.textContent.trim();
          } else {
            const answerText = correctAnswersList[0].textContent.trim();
            if (answerText) {
              const match = answerText.match(/:\s*(.+)$/);
              correctAnswer = match ? match[1].trim() : answerText;
            }
          }
        } else {
          correctAnswer = Array.from(correctAnswersList).map((field) => {
            const correctAnswerEl = field.querySelector(".correct-answer");
            if (correctAnswerEl) {
              return correctAnswerEl.textContent.trim();
            } else {
              const answerText = field.textContent.trim();
              const match = answerText.match(/:\s*(.+)$/);
              return match ? match[1].trim() : answerText;
            }
          });
        }
      }
    } catch (e) {
      console.error("Error extracting fill in the blank answers:", e);
    }
  }

  if (questionType === "matching") {
    return null;
  }

  if (correctAnswer === null) {
    console.error("Failed to extract correct answer for", questionType);
    return null;
  }

  return {
    question: questionText,
    answer: correctAnswer,
    type: questionType,
  };
}

function cleanAnswer(answer) {
  if (!answer) return answer;

  if (Array.isArray(answer)) {
    return answer.map((item) => cleanAnswer(item));
  }

  if (typeof answer === "string") {
    let cleanedAnswer = answer.trim();

    cleanedAnswer = cleanedAnswer.replace(/^Field \d+:\s*/, "");

    if (cleanedAnswer.includes(" or ")) {
      cleanedAnswer = cleanedAnswer.split(" or ")[0].trim();
    }

    return cleanedAnswer;
  }

  return answer;
}

function processChatGPTResponse(responseText) {
  console.log("[processChatGPTResponse] === PROCESSING RESPONSE ===");
  console.log("[processChatGPTResponse] Raw response text:", responseText);

  try {
    if (handleTopicOverview()) {
      console.log("[processChatGPTResponse] Handled topic overview, returning");
      return;
    }

    if (handleForcedLearning()) {
      console.log("[processChatGPTResponse] Handled forced learning, returning");
      return;
    }

    console.log("[processChatGPTResponse] Parsing JSON response");
    const response = JSON.parse(responseText);
    console.log("[processChatGPTResponse] Parsed response:", response);

    // Extract answers and handle newline-separated answers (for multiple select)
    let answers;
    if (Array.isArray(response.answer)) {
      answers = response.answer;
    } else if (typeof response.answer === 'string' && response.answer.includes('\n')) {
      // Split on newlines for multiple select questions
      answers = response.answer.split('\n').map(a => a.trim()).filter(a => a);
      console.log("[processChatGPTResponse] Split newline-separated answer into array");
    } else {
      answers = [response.answer];
    }

    console.log("[processChatGPTResponse] Extracted answers:", answers);

    const container = document.querySelector(".probe-container");
    if (!container) {
      console.error("[processChatGPTResponse] No probe container found!");
      return;
    }

    console.log("[processChatGPTResponse] Found probe container");
    lastIncorrectQuestion = null;
    lastCorrectAnswer = null;

    if (container.querySelector(".awd-probe-type-matching")) {
      console.log("[processChatGPTResponse] Matching question detected");
      alert(
        "Matching Question Solution:\n\n" +
        answers.join("\n") +
        "\n\nPlease input these matches manually, then click high confidence and next."
      );
    } else if (container.querySelector(".awd-probe-type-fill_in_the_blank")) {
      console.log("[processChatGPTResponse] Fill in the blank question detected");
      const inputs = container.querySelectorAll("input.fitb-input");
      console.log("[processChatGPTResponse] Found", inputs.length, "input fields");

      inputs.forEach((input, index) => {
        if (answers[index]) {
          console.log(`[processChatGPTResponse] Filling input ${index} with:`, answers[index]);
          input.value = answers[index];
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    } else {
      console.log("[processChatGPTResponse] Multiple choice/select question detected");
      const choices = container.querySelectorAll(
        'input[type="radio"], input[type="checkbox"]'
      );

      console.log("[processChatGPTResponse] Found", choices.length, "choices");

      choices.forEach((choice, choiceIndex) => {
        const label = choice.closest("label");
        if (label) {
          const choiceText = label
            .querySelector(".choiceText")
            ?.textContent.trim();

          console.log(`[processChatGPTResponse] Choice ${choiceIndex}: "${choiceText}"`);

          if (choiceText) {
            const shouldBeSelected = answers.some((ans) => {
              console.log(`[processChatGPTResponse]   Comparing with answer: "${ans}"`);

              if (choiceText === ans) {
                console.log(`[processChatGPTResponse]   ✓ Exact match!`);
                return true;
              }

              const choiceWithoutPeriod = choiceText.replace(/\.$/, "");
              const answerWithoutPeriod = ans.replace(/\.$/, "");
              if (choiceWithoutPeriod === answerWithoutPeriod) {
                console.log(`[processChatGPTResponse]   ✓ Match without period!`);
                return true;
              }

              if (choiceText === ans + ".") {
                console.log(`[processChatGPTResponse]   ✓ Match with added period!`);
                return true;
              }

              return false;
            });

            if (shouldBeSelected) {
              console.log(`[processChatGPTResponse] ✓✓✓ CLICKING choice ${choiceIndex}: "${choiceText}"`);
              choice.click();
            } else {
              console.log(`[processChatGPTResponse]   Skipping choice ${choiceIndex}`);
            }
          }
        }
      });
    }

    console.log("[processChatGPTResponse] Answer selection complete");

    if (isAutomating) {
      console.log("[processChatGPTResponse] Automation is ON, waiting for confidence button");
      waitForElement(
        '[data-automation-id="confidence-buttons--high_confidence"]:not([disabled])',
        10000
      )
        .then((button) => {
          console.log("[processChatGPTResponse] Confidence button found, clicking");
          button.click();

          setTimeout(() => {
            const incorrectMarker = container.querySelector(
              ".awd-probe-correctness.incorrect"
            );
            if (incorrectMarker) {
              console.log("[processChatGPTResponse] Answer was incorrect, extracting correct answer");
              const correctionData = extractCorrectAnswer();
              if (correctionData && correctionData.answer) {
                lastIncorrectQuestion = correctionData.question;
                lastCorrectAnswer = cleanAnswer(correctionData.answer);
                console.log(
                  "[processChatGPTResponse] Correct answer was:",
                  lastCorrectAnswer
                );
              }
            } else {
              console.log("[processChatGPTResponse] Answer was correct!");
            }

            console.log("[processChatGPTResponse] Waiting for next button");
            waitForElement(".next-button", 10000)
              .then((nextButton) => {
                console.log("[processChatGPTResponse] Next button found, clicking");
                nextButton.click();
                setTimeout(() => {
                  console.log("[processChatGPTResponse] Moving to next question");
                  checkForNextStep();
                }, 1000);
              })
              .catch((error) => {
                console.error("[processChatGPTResponse] Next button error:", error);
                isAutomating = false;
              });
          }, 1000);
        })
        .catch((error) => {
          console.error("[processChatGPTResponse] Confidence button error:", error);
          isAutomating = false;
        });
    } else {
      console.log("[processChatGPTResponse] Automation is OFF, not proceeding");
    }
  } catch (e) {
    console.error("[processChatGPTResponse] Error processing response:", e);
    console.error("[processChatGPTResponse] Stack trace:", e.stack);
  }
}

function addAssistantButton() {
  waitForElement("awd-header .header__navigation").then((headerNav) => {
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.marginLeft = "10px";
    buttonContainer.style.gap = "8px";
    buttonContainer.style.alignItems = "center";

    // Retry button (circular, initially hidden)
    const retryBtn = document.createElement("button");
    retryBtn.classList.add("btn", "btn-secondary");
    retryBtn.style.width = "36px";
    retryBtn.style.height = "36px";
    retryBtn.style.borderRadius = "50%";
    retryBtn.style.padding = "0";
    retryBtn.style.display = "none";
    retryBtn.style.border = "2px solid white";
    retryBtn.style.color = "white";
    retryBtn.title = "Stop and Retry";
    retryBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"></polyline>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
      </svg>
    `;
    retryBtn.addEventListener("click", () => {
      // Stop current automation
      isAutomating = false;

      // Wait a brief moment then restart
      setTimeout(() => {
        chrome.storage.sync.get("geminiApiKey", function (data) {
          if (data.geminiApiKey) {
            isAutomating = true;
            btn.textContent = "Stop Automation";
            retryBtn.style.display = "flex";
            checkForNextStep();
          }
        });
      }, 1000);
    });

    // Main button container
    const mainButtonGroup = document.createElement("div");
    mainButtonGroup.style.display = "flex";

    const btn = document.createElement("button");
    btn.textContent = "Ask Gemini";
    btn.classList.add("btn", "btn-secondary");
    btn.style.borderTopRightRadius = "0";
    btn.style.borderBottomRightRadius = "0";
    btn.style.color = "white";
    btn.style.border = "1px solid white";
    btn.addEventListener("click", () => {
      console.log("[Ask Gemini Button] Clicked, isAutomating:", isAutomating);

      if (isAutomating) {
        console.log("[Ask Gemini Button] Stopping automation");
        isAutomating = false;
        btn.textContent = "Ask Gemini";
        retryBtn.style.display = "none";
      } else {
        console.log("[Ask Gemini Button] Checking API key");
        // Check if API key is configured
        chrome.storage.sync.get("geminiApiKey", function (data) {
          console.log("[Ask Gemini Button] API key check result:", data.geminiApiKey ? "Found" : "Not found");

          if (!data.geminiApiKey) {
            console.log("[Ask Gemini Button] No API key, showing alert");
            alert(
              "No Gemini API key configured.\n\nPlease click the settings icon and enter your Gemini API key to use automation."
            );
            return;
          }

          console.log("[Ask Gemini Button] Showing confirmation dialog");
          const proceed = confirm(
            "Start automated answering with Gemini AI?\n\nClick OK to begin, or Cancel to stop."
          );

          console.log("[Ask Gemini Button] User confirmation:", proceed);

          if (proceed) {
            console.log("[Ask Gemini Button] Starting automation");
            isAutomating = true;
            btn.textContent = "Stop Automation";
            retryBtn.style.display = "flex";
            retryBtn.style.justifyContent = "center";
            retryBtn.style.alignItems = "center";

            console.log("[Ask Gemini Button] Calling checkForNextStep");
            checkForNextStep();
          }
        });
      }
    });

    mainButtonGroup.appendChild(btn);
    // Settings button removed as requested

    buttonContainer.appendChild(retryBtn);
    buttonContainer.appendChild(mainButtonGroup);
    headerNav.appendChild(buttonContainer);
  });
}

function parseQuestion() {
  const container = document.querySelector(".probe-container");
  if (!container) {
    alert("No question found on the page.");
    return null;
  }

  let questionType = "";
  if (container.querySelector(".awd-probe-type-multiple_choice")) {
    questionType = "multiple_choice";
  } else if (container.querySelector(".awd-probe-type-true_false")) {
    questionType = "true_false";
  } else if (container.querySelector(".awd-probe-type-multiple_select")) {
    questionType = "multiple_select";
  } else if (container.querySelector(".awd-probe-type-fill_in_the_blank")) {
    questionType = "fill_in_the_blank";
  } else if (container.querySelector(".awd-probe-type-matching")) {
    questionType = "matching";
  }

  let questionText = "";
  const promptEl = container.querySelector(".prompt");

  if (questionType === "fill_in_the_blank" && promptEl) {
    const promptClone = promptEl.cloneNode(true);

    const uiSpans = promptClone.querySelectorAll(
      "span.fitb-span, span.blank-label, span.correctness, span._visuallyHidden"
    );
    uiSpans.forEach((span) => span.remove());

    const inputs = promptClone.querySelectorAll("input.fitb-input");
    inputs.forEach((input) => {
      const blankMarker = document.createTextNode("[BLANK]");
      if (input.parentNode) {
        input.parentNode.replaceChild(blankMarker, input);
      }
    });

    questionText = promptClone.textContent.trim();
  } else {
    questionText = promptEl ? promptEl.textContent.trim() : "";
  }

  let options = [];
  if (questionType === "matching") {
    const prompts = Array.from(
      container.querySelectorAll(".match-prompt .content")
    ).map((el) => el.textContent.trim());
    const choices = Array.from(
      container.querySelectorAll(".choices-container .content")
    ).map((el) => el.textContent.trim());
    options = { prompts, choices };
  } else if (questionType !== "fill_in_the_blank") {
    container.querySelectorAll(".choiceText").forEach((el) => {
      options.push(el.textContent.trim());
    });
  }

  return {
    type: questionType,
    question: questionText,
    options: options,
    previousCorrection: lastIncorrectQuestion
      ? {
        question: lastIncorrectQuestion,
        correctAnswer: lastCorrectAnswer,
      }
      : null,
  };
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error("Element not found: " + selector));
      }
    }, 100);
  });
}

console.log("=== AUTO-MCGRAW CONTENT SCRIPT LOADED ===");
console.log("[Init] Setting up message listener");
setupMessageListener();

console.log("[Init] Adding assistant button");
addAssistantButton();

console.log("[Init] Checking isAutomating:", isAutomating);
if (isAutomating) {
  console.log("[Init] Resuming automation");
  setTimeout(() => {
    checkForNextStep();
  }, 1000);
}
console.log("=== AUTO-MCGRAW READY ===");
