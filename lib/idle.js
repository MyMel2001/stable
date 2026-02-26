const { getDecision, DECISION_MODEL } = require("./ollama");
const { db, updateSummary, getMessages } = require("./db");

let lastActivity = Date.now();
let isRunning = false;
let abortController = null;

function updateActivity() {
  const now = Date.now();
  console.log(`Activity detected. Resetting idle timer. (Was: ${Math.floor((now - lastActivity) / 1000)}s idle)`);
  lastActivity = now;
  if (isRunning && abortController) {
    console.log("Interrupting background tasks due to new activity...");
    abortController.abort();
    isRunning = false;
  }
}

async function runIdleTasks() {
  const idleTime = Date.now() - lastActivity;

  // If idle for more than 5 minutes and not already running
  if (idleTime > 5 * 60 * 1000 && !isRunning) {
    console.log("System idle. Running background tasks...");
    isRunning = true;
    abortController = new AbortController();

    try {
      // Task 1: Summarize conversations
      const messages = await getMessages("default");
      if (messages.length > 50) {
        console.log("Summarizing long conversation...");
        const textToSummarize = messages.map(m => `${m.role}: ${m.content}`).join("\n");
        const summaryPrompt = `Summarize the following conversation history for long-term memory. Focus on key facts, user preferences, and important context.\n\n${textToSummarize}`;

        const res = await getDecision(summaryPrompt, "You are Stable's memory manager. Create concise, factual summaries.", abortController.signal);

        await updateSummary("default", res.message.content);
        console.log("Idle tasks completed successfully.");
      } else {
        // console.log("Not enough messages to summarize. Idle tasks skipped.");
      }
    } catch (err) {
      if (err.name === 'AbortError' || (err.message && err.message.includes('abort'))) {
        console.log("Idle tasks were aborted.");
      } else {
        console.error("Idle Summary Error:", err.message);
      }
    } finally {
      isRunning = false;
      lastActivity = Date.now(); // Reset timer after tasks finish or abort
    }
  } else if (!isRunning) {
    const remaining = Math.ceil((5 * 60 * 1000 - idleTime) / 1000);
    if (remaining > 0) {
      if (remaining % 60 === 0 || remaining < 10) {
        console.log(`Time until background tasks: ${remaining}s`);
      }
    }
  }
}

// Check every minute
setInterval(runIdleTasks, 60 * 1000);

module.exports = { updateActivity };
