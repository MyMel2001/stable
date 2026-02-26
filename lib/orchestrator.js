const { getDecision, getChoice, DECISION_MODEL, CHOICE_MODEL } = require("./ollama");
const { db, getMessages, addMessage, getSummary } = require("./db");
const { searchDuckDuckGo, fetchWikipedia } = require("./scraper");
const { updateActivity } = require("./idle");

async function prepareOrchestration(apiMessages) {
  if (!apiMessages || !Array.isArray(apiMessages)) {
    throw new Error("apiMessages must be an array");
  }

  updateActivity();
  // 1. Identify System Prompt and User Query
  let originalSystemPrompt = "";
  let userQuery = "";
  let messagesForChoice = [];

  for (const msg of apiMessages) {
    if (msg.role === 'system') {
      originalSystemPrompt += msg.content + "\n";
    } else if (msg.role === 'user') {
      userQuery = msg.content;
      messagesForChoice.push(msg);
    } else {
      messagesForChoice.push(msg);
    }
  }

  // Identity reinforcement
  const stableIdentity = "Your name is Stable. You are a nice and helpful AI assistant with long-term memory. You are currently running on a dual-model architecture.";

  // 2. Decision Model: Determine Intent
  let searchResults = "";
  try {
    const lastMessages = apiMessages.slice(-3).map(m => `${m.role}: ${m.content}`).join("\n");
    const decisionPrompt = `Recent Conversation Context:
${lastMessages}

Determine if we need to search the web for information or if this is a general chat.
If the user asks about current events, specific facts, or things that require up-to-date knowledge, set "search" to true.

Respond ONLY with a JSON object:
{"search": boolean, "query": "optimized search query", "reason": "why"}`;

    console.log(`[Orchestrator] Requesting decision for: "${userQuery || 'empty query'}"`);
    const decisionRes = await getDecision(decisionPrompt, "You are Stable's brain. Respond ONLY in JSON.");

    if (decisionRes && decisionRes.message && decisionRes.message.content) {
      const content = decisionRes.message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const decision = JSON.parse(jsonMatch[0]);
        if (decision.search && decision.query) {
          console.log(`[Orchestrator] Searching for: ${decision.query}`);
          const [wiki, ddg] = await Promise.all([
            fetchWikipedia(decision.query).catch(() => null),
            searchDuckDuckGo(decision.query).catch(() => null)
          ]);

          if (wiki) searchResults += `\nWikipedia: ${wiki}`;
          if (ddg) searchResults += `\nDuckDuckGo: ${ddg}`;
        }
      }
    }
  } catch (err) {
    console.error("[Orchestrator] Decision/Search non-fatal error:", err.message);
  }

  // 3. Inject Context and Memory
  const summary = await getSummary("default").catch(() => "");

  const combinedSystemPrompt = `[System Information]
Identity: ${stableIdentity}
${originalSystemPrompt ? "\nOriginal System Instructions:\n" + originalSystemPrompt : ""}
${summary ? "\nMemory Summary of previous conversations:\n" + summary : ""}
${searchResults ? "\nRecent Web Search Information:\n" + searchResults : ""}

[Instructions]
You are Stable. Use the above context to answer the user query accurately.
If search results are provided, prioritize that information for factual questions.`;

  messagesForChoice.unshift({
    role: 'system',
    content: combinedSystemPrompt
  });

  return { messagesForChoice, userQuery };
}

async function orchestrate(apiMessages) {
  const { messagesForChoice, userQuery } = await prepareOrchestration(apiMessages);

  // 4. Get Final Response from Choice Model
  console.log(`[Orchestrator] Sending ${messagesForChoice.length} messages to Choice model (${CHOICE_MODEL})`);
  const finalResponse = await getChoice(messagesForChoice);

  // 5. Update Memory (Asynchronous/Non-blocking preferably)
  // For now, just add the user/assistant exchange
  await addMessage("default", { role: 'user', content: userQuery });
  await addMessage("default", { role: 'assistant', content: finalResponse.message.content });

  return finalResponse;
}

module.exports = { orchestrate, prepareOrchestration };
