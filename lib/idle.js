const { getDecision, DECISION_MODEL } = require("./ollama");
const { db, updateSummary, getMessages } = require("./db");

let lastActivity = Date.now();

function updateActivity() {
  lastActivity = Date.now();
}

async function runIdleTasks() {
  const idleTime = Date.now() - lastActivity;
  // If idle for more than 5 minutes
  if (idleTime > 5 * 60 * 1000) {
    console.log("System idle. Running background tasks...");

    // Task 1: Summarize conversations
    const messages = await getMessages("default");
    if (messages.length > 50) {
      console.log("Summarizing long conversation...");
      const textToSummarize = messages.map(m => `${m.role}: ${m.content}`).join("\n");
      const summaryPrompt = `Summarize the following conversation history for long-term memory. Focus on key facts, user preferences, and important context.\n\n${textToSummarize}`;

      try {
        const res = await getDecision(summaryPrompt, "You are Stable's memory manager. Create concise, factual summaries.");
        await updateSummary("default", res.message.content);
        // Optionally prune messages here
      } catch (err) {
        console.error("Idle Summary Error:", err.message);
      }
    }

    // Task 2: Self-correction (Analyze mistakes)
    // Could be implemented here by scanning 'mistakes' table
  }
}

// Check every minute
setInterval(runIdleTasks, 60 * 1000);

module.exports = { updateActivity };
