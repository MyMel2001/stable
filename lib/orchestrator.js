const { getDecision, getChoice, DECISION_MODEL, CHOICE_MODEL } = require("./ollama");
const { db, getMessages, addMessage, getSummary } = require("./db");
const { searchDuckDuckGo, fetchWikipedia } = require("./scraper");
const { updateActivity } = require("./idle");

async function prepareOrchestration(apiMessages) {
  updateActivity();
  // 1. Identify System Prompt and User Query
  let systemPrompt = "";
  let userQuery = "";
  let messagesForChoice = [];

  for (const msg of apiMessages) {
    if (msg.role === 'system') {
      systemPrompt += msg.content + "\n";
    } else if (msg.role === 'user') {
      userQuery = msg.content;
      messagesForChoice.push(msg);
    } else {
      messagesForChoice.push(msg);
    }
  }

  // Identity reinforcement
  const stableIdentity = "Your name is Stable. You are a nice and helpful AI assistant with long-term memory. You are currently running on a dual-model architecture.";

  // Routing Rule: API System Prompt -> Choice User Message
  if (systemPrompt) {
    messagesForChoice.unshift({
      role: 'user',
      content: `[System Instruction Overload]: ${systemPrompt}`
    });
  }

  // 2. Decision Model: Determine Intent
  const lastMessages = apiMessages.slice(-3).map(m => `${m.role}: ${m.content}`).join("\n");
  const decisionPrompt = `Recent Conversation Context:
${lastMessages}

Determine if we need to search the web for information or if this is a general chat.
If the user asks about current events, specific facts, or things that require up-to-date knowledge (even if implied by context), set "search" to true.

Respond ONLY with a JSON object:
{"search": boolean, "query": "optimized search query to find the answer", "reason": "why"}
`;

  let searchResults = "";
  try {
    console.log(`[Orchestrator] Requesting decision for: "${userQuery}"`);
    const decisionRes = await getDecision(decisionPrompt, "You are Stable's brain. Decide if external knowledge is needed. Respond ONLY in JSON.");
    const content = decisionRes.message.content;
    console.log(`[Orchestrator] Decision model raw output: ${content}`);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const decision = JSON.parse(jsonMatch[0]);
      console.log(`[Orchestrator] Parsed decision: search=${decision.search}, query="${decision.query}"`);

      if (decision.search && decision.query) {
        console.log(`[Orchestrator] Searching for: ${decision.query}`);
        const [wiki, ddg] = await Promise.all([
          fetchWikipedia(decision.query),
          searchDuckDuckGo(decision.query)
        ]);

        if (wiki) {
          searchResults += `\nWikipedia: ${wiki}`;
          console.log(`[Orchestrator] Found Wikipedia content (${wiki.length} chars)`);
        }
        if (ddg) {
          searchResults += `\nDuckDuckGo: ${ddg}`;
          console.log(`[Orchestrator] Found DDG content (${ddg.length} chars)`);
        }

        if (!wiki && !ddg) {
          console.log(`[Orchestrator] No search results found for "${decision.query}"`);
        }
      }
    } else {
      console.warn("[Orchestrator] Could not find JSON in decision model output");
    }
  } catch (err) {
    console.error("[Orchestrator] Decision model error or JSON parse error:", err.message);
  }

  // 3. Inject Context and Memory
  const summary = await getSummary("default"); // Using a default conversation ID for now

  const contextContent = `[System Information]
Identity: ${stableIdentity}
${summary ? "Memory Summary of previous conversations: " + summary : ""}
${searchResults ? "Recent Web Search Information: " + searchResults : ""}

[Instructions]
You are Stable. Use the above context to answer the user query accurately.
If search results are provided, prioritize that information for factual questions.`;

  messagesForChoice.unshift({
    role: 'system',
    content: contextContent
  });

  // If there was an original system prompt from the API, put it at the very top
  if (systemPrompt) {
    messagesForChoice.unshift({
      role: 'system',
      content: systemPrompt
    });
  }

  return { messagesForChoice, userQuery };
}

async function orchestrate(apiMessages) {
  const { messagesForChoice, userQuery } = await prepareOrchestration(apiMessages);
  updateActivity();

  // 4. Get Final Response from Choice Model
  console.log(`[Orchestrator] Sending ${messagesForChoice.length} messages to Choice model (${CHOICE_MODEL})`);
  const finalResponse = await getChoice(messagesForChoice);
  updateActivity();

  // 5. Update Memory (Asynchronous/Non-blocking preferably)
  // For now, just add the user/assistant exchange
  await addMessage("default", { role: 'user', content: userQuery });
  await addMessage("default", { role: 'assistant', content: finalResponse.message.content });

  return finalResponse;
}

module.exports = { orchestrate, prepareOrchestration };
