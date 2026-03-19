const { getDecision, getChoice, DECISION_MODEL, CHOICE_MODEL } = require("./ollama");
const { db, updateSummary, getMessages, addKnowledge } = require("./db");
const { searchDuckDuckGo, searchSparksammy, fetchWikipedia, scrapeUrl } = require("./scraper");

let lastActivity = Date.now();
let isRunning = false;
let activeRequests = 0;
let abortController = null;

// Random idle threshold between 30 minutes and 2 hours
function getRandomThreshold() {
  const min = 30 * 60 * 1000;
  const max = 120 * 60 * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let idleThreshold = getRandomThreshold();
console.log(`Initial idle threshold set to: ${Math.floor(idleThreshold / 60000)} minutes`);

function updateActivity() {
  const now = Date.now();
  const idleSeconds = Math.floor((now - lastActivity) / 1000);

  // Interrupting background tasks if running
  if (isRunning && abortController) {
    console.log("Interrupting background tasks due to new activity...");
    abortController.abort();
    isRunning = false;
  }

  // Only log activity if we were actually idle for a while (to avoid spamming)
  if (idleSeconds >= 10) {
    console.log(`Activity detected. Resetting idle timer. (Was: ${idleSeconds}s idle)`);
  }

  lastActivity = now;
}

function startRequest() {
  activeRequests++;
  updateActivity();
}

function endRequest() {
  activeRequests = Math.max(0, activeRequests - 1);
  updateActivity();
}

async function runIdleTasks() {
  const idleTime = Date.now() - lastActivity;

  // ONLY run if idle time reached AND not already running AND no active user requests
  if (idleTime > idleThreshold && !isRunning && activeRequests === 0) {
    console.log("System idle. Running background tasks...");
    isRunning = true;
    abortController = new AbortController();

    try {
      // Task 1: Summarize conversations
      const messages = await getMessages("default");
      if (messages.length > 50) {
        console.log("Summarizing long conversation...");
        const textToSummarize = messages.map(m => `${m.role}: ${m.content}`).join("\n");
        const summaryPrompt = `Summarize the following conversation history for long-term memory.
Focus on general knowledge, key facts, and context that helps with reasoning.

CRITICAL: ANONYMIZE ALL PERSONAL DATA.
- Replace specific names with "the user" or "a person".
- Remove or generalize specific locations, contact information, or unique identifiers.
- Generalize specific user behaviors into general patterns if useful, otherwise remove.
- Ensure that the resulting summary cannot be used to identify a specific individual or their private habits.

Conversation to summarize:
${textToSummarize}`;

        const res = await getDecision(summaryPrompt, "You are Stable's memory manager. Create concise, factual, and strictly anonymized summaries.", abortController.signal);

        await updateSummary("default", res.message.content);
        console.log("Idle summary task completed.");
      }

      // Task 2: Proactive Research
      console.log("Starting proactive research task...");
      const topicPrompt = `You are Stable, an AI that wants to improve itself. What is a topic you should learn about to be a more helpful and knowledgeable assistant?
Consider current events, scientific breakthroughs, or general knowledge that might be useful. Make each query of an unique wealth of topics (Vocaloid, gardening, tech/science breakthroughs, latest news, Goat Simulator tricks - any topic you can think of). Make sure the topics researched are useful for at least one scenario.

Respond ONLY with a JSON object:
{"topic": "the topic name", "query": "optimized search query"}`;

      const topicRes = await getDecision(topicPrompt, "You are Stable's self-improvement module. Respond ONLY in JSON.", abortController.signal);

      const jsonMatch = topicRes.message.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const { topic, query } = JSON.parse(jsonMatch[0]);
        console.log(`Researching topic: ${topic}`);

        // Search across multiple providers
        const [wiki, sparksammy] = await Promise.all([
          fetchWikipedia(query).catch(() => null),
          searchSparksammy(query).catch(() => [])
        ]);

        let researchContent = "";
        if (wiki) researchContent += `Wikipedia: ${wiki}\n\n`;

        // Scrape top 2 results from sparksammy
        const scrapePromises = sparksammy.slice(0, 2).map(result => scrapeUrl(result.link));
        const scraped = await Promise.all(scrapePromises);

        scraped.forEach((content, i) => {
          if (content) {
            researchContent += `Source [${sparksammy[i].title}]:\n${content}\n\n`;
          }
        });

        if (researchContent) {
          const synthesisPrompt = `Synthesize the following research findings about "${topic}" into a concise but comprehensive educational summary.
Focus on facts, dates, and core concepts.

Research data:
${researchContent.substring(0, 20000)}`;

          const synthesisRes = await getDecision(synthesisPrompt, "You are a research synthesizer. Create a detailed knowledge entry.", abortController.signal);

          await addKnowledge(topic, synthesisRes.message.content);
          console.log(`Proactive research on "${topic}" completed and stored.`);
        }
      }

      console.log("Idle tasks completed successfully.");
    } catch (err) {
      if (err.name === 'AbortError' || (err.message && err.message.includes('abort'))) {
        console.log("Idle tasks were aborted.");
      } else {
        console.error("Idle Task Error:", err.message);
      }
    } finally {
      isRunning = false;
      lastActivity = Date.now();
      idleThreshold = getRandomThreshold();
      console.log(`Next idle threshold set to: ${Math.floor(idleThreshold / 60000)} minutes`);
    }
  } else if (!isRunning && activeRequests === 0) {
    const remaining = Math.ceil((idleThreshold - idleTime) / 1000);
    if (remaining > 0) {
      if (remaining % 60 === 0 || remaining < 10) {
        console.log(`Time until background tasks: ${remaining}s`);
      }
    }
  } else if (activeRequests > 0) {
    // Reset timer while user is active
    lastActivity = Date.now();
  }
}

// Check every minute
setInterval(runIdleTasks, 60 * 1000);

module.exports = { updateActivity, startRequest, endRequest };
