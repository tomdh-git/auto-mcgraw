let messageListener = null;
let isAutomating = false;
let lastIncorrectQuestion = null;
let lastCorrectAnswer = null;
let visualConsole = null;
let isProcessing = false; // Lock to prevent multiple simultaneous requests


function createVisualConsole() {
  if (document.getElementById('auto-mcgraw-console')) return;

  const container = document.createElement('div');
  container.id = 'auto-mcgraw-console';
  container.style.position = 'fixed';
  container.style.top = '100px';
  container.style.right = '20px';
  container.style.width = '320px';
  container.style.height = '400px';
  container.style.backgroundColor = 'rgba(15, 23, 42, 0.95)'; // Slate 900
  container.style.backdropFilter = 'blur(10px)';
  container.style.borderRadius = '12px';
  container.style.border = '1px solid rgba(255, 255, 255, 0.1)';
  container.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5)';
  container.style.zIndex = '999999';
  container.style.fontFamily = "'Inter', system-ui, -apple-system, sans-serif";
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.overflow = 'hidden';
  container.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

  // Header
  const header = document.createElement('div');
  header.style.padding = '12px 16px';
  header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.background = 'rgba(255, 255, 255, 0.03)';

  const title = document.createElement('span');
  title.textContent = 'Auto-McGraw Assistant';
  title.style.color = '#fff';
  title.style.fontSize = '14px';
  title.style.fontWeight = '600';
  title.style.letterSpacing = '0.5px';

  const statusDot = document.createElement('div');
  statusDot.style.width = '8px';
  statusDot.style.height = '8px';
  statusDot.style.borderRadius = '50%';
  statusDot.style.backgroundColor = '#10b981'; // Emerald 500
  statusDot.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.5)';

  header.appendChild(title);
  header.appendChild(statusDot);

  // Content Area
  const content = document.createElement('div');
  content.id = 'auto-mcgraw-console-content';
  content.style.flex = '1';
  content.style.overflowY = 'auto';
  content.style.padding = '12px';
  content.style.fontSize = '12px';
  content.style.lineHeight = '1.5';
  content.style.color = '#cbd5e1'; // Slate 300
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = '8px';

  // Custom Scrollbar styling
  const style = document.createElement('style');
  style.textContent = `
    #auto-mcgraw-console-content::-webkit-scrollbar {
      width: 6px;
    }
    #auto-mcgraw-console-content::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
    }
    #auto-mcgraw-console-content::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }
    #auto-mcgraw-console-content::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .console-entry {
        animation: fadeIn 0.3s ease-out forwards;
        opacity: 0;
        transform: translateY(5px);
    }
    @keyframes fadeIn {
        to { opacity: 1; transform: translateY(0); }
    }
  `;

  container.appendChild(style);
  container.appendChild(header);
  container.appendChild(content);
  document.body.appendChild(container);
  visualConsole = content;
}

function logToConsole(message, type = 'info') {
  if (!visualConsole) createVisualConsole();

  const entry = document.createElement('div');
  entry.classList.add('console-entry');

  let color = '#cbd5e1'; // Default Slate 300
  let icon = '•';

  switch (type) {
    case 'success':
      color = '#34d399'; // Emerald 400
      icon = '✓';
      break;
    case 'error':
      color = '#f87171'; // Red 400
      icon = '✕';
      break;
    case 'warning':
      color = '#fbbf24'; // Amber 400
      icon = '⚠';
      break;
    case 'action':
      color = '#60a5fa'; // Blue 400
      icon = '→';
      break;
  }

  entry.style.color = color;
  entry.style.display = 'flex';
  entry.style.gap = '8px';
  entry.innerHTML = `
    <span style="flex-shrink: 0; opacity: 0.7;">${icon}</span>
    <span>${message}</span>
  `;

  visualConsole.appendChild(entry);
  visualConsole.scrollTop = visualConsole.scrollHeight;
}


function setupMessageListener() {
  if (messageListener) {
    chrome.runtime.onMessage.removeListener(messageListener);
  }

  messageListener = (message, sender, sendResponse) => {
    if (message.type === "processChatGPTResponse") {
      logToConsole("Received answer from Gemini", "success");
      isProcessing = false; // Release lock
      processChatGPTResponse(message.response);
      sendResponse({ received: true });
      return true;
    }

    if (message.type === "alertMessage") {
      logToConsole(`Alert: ${message.message}`, "warning");
      alert(message.message);
      sendResponse({ received: true });
      return true;
    }

  };

  chrome.runtime.onMessage.addListener(messageListener);
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
  if (!isAutomating || isProcessing) {
    if (isProcessing) {
      // Optional: log or ignore, but don't spam console
    }
    return;
  }

  if (handleTopicOverview()) {
    logToConsole("Handling topic overview...", "action");
    return;
  }

  if (handleForcedLearning()) {
    logToConsole("Forced learning detected. handling...", "warning");
    return;
  }

  const container = document.querySelector(".probe-container");

  if (container && !container.querySelector(".forced-learning")) {
    logToConsole("Question container found. Parsing...", "action");
    const qData = parseQuestion();

    if (qData) {
      logToConsole("Question parsed successfully.", "success");
      logToConsole("Querying Gemini...", "action");
      isProcessing = true; // Set lock before sending
      chrome.runtime.sendMessage({
        type: "sendQuestionToChatGPT",
        question: qData,
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending question to background script:", chrome.runtime.lastError);
          logToConsole("Connection to background script failed.", "error");
          isAutomating = false;
          isProcessing = false; // Release lock on error
          alert("Error communicating with background script. Automation stopped.");
        }
      });
    } else {
      console.error("Failed to parse question data.");
      logToConsole("Failed to parse question data.", "error");
      isAutomating = false; // Stop if we can't parse the question
    }
  } else {
    logToConsole("Waiting for question...", "info");
    // Optional: Log if we are completely lost, but usually this just means waiting for load
    // console.error("No question container found."); 
    // Not stopping automation here as it might be loading
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
  try {
    if (handleTopicOverview()) {
      return;
    }

    if (handleForcedLearning()) {
      return;
    }

    const response = JSON.parse(responseText);

    // Extract answers and handle newline-separated answers (for multiple select)
    let answers;
    if (Array.isArray(response.answer)) {
      answers = response.answer;
    } else if (typeof response.answer === 'string' && response.answer.includes('\n')) {
      // Split on newlines for multiple select questions
      answers = response.answer.split('\n').map(a => a.trim()).filter(a => a);
    } else {
      answers = [response.answer];
    }

    const container = document.querySelector(".probe-container");
    if (!container) {
      console.error("No probe container found when processing response!");
      logToConsole("Error: Probe container lost.", "error");
      isAutomating = false;
      return;
    }

    lastIncorrectQuestion = null;
    lastCorrectAnswer = null;

    if (container.querySelector(".awd-probe-type-matching")) {
      logToConsole("Matching question detected. Manual input required.", "warning");
      alert(
        "Matching Question Solution:\n\n" +
        answers.join("\n") +
        "\n\nPlease input these matches manually, then click high confidence and next."
      );
    } else if (container.querySelector(".awd-probe-type-fill_in_the_blank")) {
      const inputs = container.querySelectorAll("input.fitb-input");

      if (inputs.length === 0) {
        console.error("Fill in the blank question detected but no input fields found.");
        logToConsole("Error: No input fields found.", "error");
        isAutomating = false;
        return;
      }

      logToConsole(`Filling ${inputs.length} blanks...`, "action");

      inputs.forEach((input, index) => {
        if (answers[index]) {
          input.value = answers[index];
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    } else {
      const choices = container.querySelectorAll(
        'input[type="radio"], input[type="checkbox"]'
      );

      if (choices.length === 0) {
        console.error("Multiple choice/select question detected but no choices found.");
        logToConsole("Error: No choices found on screen.", "error");
        isAutomating = false;
        return;
      }

      let matchedAny = false;

      choices.forEach((choice, choiceIndex) => {
        const label = choice.closest("label");
        if (label) {
          const choiceText = label
            .querySelector(".choiceText")
            ?.textContent.trim();

          if (choiceText) {
            const shouldBeSelected = answers.some((ans) => {

              if (choiceText === ans) {
                return true;
              }

              const choiceWithoutPeriod = choiceText.replace(/\.$/, "");
              const answerWithoutPeriod = ans.replace(/\.$/, "");
              if (choiceWithoutPeriod === answerWithoutPeriod) {
                return true;
              }

              if (choiceText === ans + ".") {
                return true;
              }

              return false;
            });

            if (shouldBeSelected) {
              logToConsole(`Selecting: "${choiceText}"`, "action");
              choice.click();
              matchedAny = true;
            }
          }
        }
      });

      if (!matchedAny) {
        console.error("Could not match any of the provided answers to the choices on screen.");
        logToConsole("Error: Could not match AI answer to choices.", "error");
        isAutomating = false;
        alert("Could not match AI answer to screen choices. Stopping automation.");
        return;
      }
    }

    if (isAutomating) {
      // Small delay to ensure UI updates
      setTimeout(() => {
        logToConsole("Clicking High Confidence...", "action");
        waitForElement(
          '[data-automation-id="confidence-buttons--high_confidence"]:not([disabled])',
          10000
        )
          .then((button) => {
            button.click();

            setTimeout(() => {
              const incorrectMarker = container.querySelector(
                ".awd-probe-correctness.incorrect"
              );
              if (incorrectMarker) {
                logToConsole("Answer was incorrect. Recording correct answer.", "warning");
                const correctionData = extractCorrectAnswer();
                if (correctionData && correctionData.answer) {
                  lastIncorrectQuestion = correctionData.question;
                  lastCorrectAnswer = cleanAnswer(correctionData.answer);
                }
              } else {
                logToConsole("Answer was correct!", "success");
              }

              logToConsole("Moving to next question...", "action");

              waitForElement(".next-button", 10000)
                .then((nextButton) => {
                  nextButton.click();
                  setTimeout(() => {
                    checkForNextStep();
                  }, 1000);
                })
                .catch((error) => {
                  console.error("Next button not found:", error);
                  logToConsole("Error: Next button not found.", "error");
                  isAutomating = false;
                  isProcessing = false;
                });
            }, 1000);
          })
          .catch((error) => {
            console.error("Confidence button not found:", error);
            logToConsole("Error: Confidence button not found.", "error");
            isAutomating = false;
            isProcessing = false;
          });
      }, 500);
    }
  } catch (e) {
    console.error("Error processing response:", e);
    logToConsole(`Error processing response: ${e.message}`, "error");
    isAutomating = false;
    isProcessing = false;
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
      isProcessing = false;
      logToConsole("Retrying...", "warning");

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

      if (isAutomating) {
        logToConsole("Stopping automation...", "warning");
        isAutomating = false;
        btn.textContent = "Ask Gemini";
        retryBtn.style.display = "none";
      } else {
        // Check if API key is configured
        chrome.storage.sync.get("geminiApiKey", function (data) {

          if (!data.geminiApiKey) {
            alert(
              "No Gemini API key configured.\n\nPlease click the settings icon and enter your Gemini API key to use automation."
            );
            return;
          }

          const proceed = confirm(
            "Start automated answering with Gemini AI?\n\nClick OK to begin, or Cancel to stop."
          );

          if (proceed) {
            createVisualConsole();
            logToConsole("Automation started...", "success");
            isAutomating = true;
            btn.textContent = "Stop Automation";
            retryBtn.style.display = "flex";
            retryBtn.style.justifyContent = "center";
            retryBtn.style.alignItems = "center";

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


setupMessageListener();
addAssistantButton();

if (isAutomating) {
  setTimeout(() => {
    checkForNextStep();
  }, 1000);
}

