const { getDecision, getChoice, DECISION_MODEL, CHOICE_MODEL } = require("./ollama");
const { db, getMessages, addMessage, getSummary } = require("./db");
const { searchDuckDuckGo, fetchWikipedia } = require("./scraper");

async function prepareOrchestration(apiMessages) {
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
  const decisionPrompt = `User Query: "${userQuery}"
Determine if we need to search the web for information or if this is a general chat.
Respond with JSON: {"search": boolean, "query": "search query if needed", "reason": "why"}`;

  let searchResults = "";
  try {
    const decisionRes = await getDecision(decisionPrompt, "You are Stable's brain. Decide if external knowledge is needed. Respond ONLY in JSON.");
    const decision = JSON.parse(decisionRes.message.content.match(/\{.*\}/s)[0]);

    if (decision.search) {
      console.log(`Searching for: ${decision.query}`);
      const wiki = await fetchWikipedia(decision.query);
      const ddg = await searchDuckDuckGo(decision.query);
      if (wiki) searchResults += `\nWikipedia: ${wiki}`;
      if (ddg) searchResults += `\nDuckDuckGo: ${ddg}`;
    }
  } catch (err) {
    console.error("Decision model error or JSON parse error:", err.message);
  }

  // 3. Inject Context and Memory
  const summary = await getSummary("default"); // Using a default conversation ID for now
  if (summary || searchResults || stableIdentity) {
    messagesForChoice.unshift({
      role: 'user',
      content: `[Background Knowledge]:
Identity: ${stableIdentity}
Memory Summary: ${summary}
${searchResults ? "Recent Web Info: " + searchResults : ""}
Please keep this in mind for the following conversation.`
    });
  }

  return { messagesForChoice, userQuery };
}

async function orchestrate(apiMessages) {
  const { messagesForChoice, userQuery } = await prepareOrchestration(apiMessages);

  // 4. Get Final Response from Choice Model
  const finalResponse = await getChoice(messagesForChoice);

  // 5. Update Memory (Asynchronous/Non-blocking preferably)
  // For now, just add the user/assistant exchange
  await addMessage("default", { role: 'user', content: userQuery });
  await addMessage("default", { role: 'assistant', content: finalResponse.message.content });

  return finalResponse;
}

module.exports = { orchestrate, prepareOrchestration };
