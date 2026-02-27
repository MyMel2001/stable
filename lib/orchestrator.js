const { getDecision, getChoice, DECISION_MODEL, CHOICE_MODEL } = require("./ollama");
const { db, getMessages, addMessage, getSummary } = require("./db");
const { searchDuckDuckGo, fetchWikipedia } = require("./scraper");
const { updateActivity } = require("./idle");
const { calculateN } = require("./vram");

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
    let textContent = "";
    let images = [];

    // OpenAI multi-modal content is an array of objects
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          textContent += part.text + " ";
        } else if (part.type === 'image_url' && part.image_url && part.image_url.url) {
          const url = part.image_url.url;
          if (url.startsWith('data:')) {
            // Extract base64 part from data URI
            const base64 = url.split(',')[1];
            if (base64) images.push(base64);
          }
        }
      }
      textContent = textContent.trim();
    } else {
      textContent = msg.content || "";
    }

    if (msg.role === 'system') {
      originalSystemPrompt += textContent + "\n";
    } else {
      if (msg.role === 'user') {
        userQuery = textContent;
      }
      // Re-format for Ollama: { role, content, images }
      const ollamaMsg = { role: msg.role, content: textContent };
      if (images.length > 0) {
        ollamaMsg.images = images;
      }
      messagesForChoice.push(ollamaMsg);
    }
  }

  // Identity reinforcement
  const stableIdentity = "Your name is Stable. You are a nice and helpful AI assistant with long-term memory. You are currently running on a dual-model architecture.";

  // 2. Decision Model: Determine Intent
  let searchResults = "";
  try {
    console.time("[Orchestrator] Decision Engine");
    // Only use the text part for decision
    const lastMessagesText = messagesForChoice.slice(-3).map(m => `${m.role}: ${m.content}`).join("\n");
    const decisionPrompt = `Recent Conversation Context:
${lastMessagesText}

Determine if we need to search the web for information or if this is a general chat.
If the user asks about current events, specific facts, or things that require up-to-date knowledge, set "search" to true.

Respond ONLY with a JSON object:
{"search": boolean, "query": "optimized search query", "reason": "why"}`;

    console.log(`[Orchestrator] Requesting decision for: "${userQuery || 'empty/image query'}"`);
    const decisionRes = await getDecision(decisionPrompt, "You are Stable's brain. Respond ONLY in JSON.");
    console.timeEnd("[Orchestrator] Decision Engine");

    if (decisionRes && decisionRes.message && decisionRes.message.content) {
      const content = decisionRes.message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const decision = JSON.parse(jsonMatch[0]);
        if (decision.search && decision.query) {
          console.log(`[Orchestrator] Searching for: ${decision.query}`);
          console.time("[Orchestrator] Search Engines");
          const [wiki, ddg] = await Promise.all([
            fetchWikipedia(decision.query).catch(() => null),
            searchDuckDuckGo(decision.query).catch(() => null)
          ]);
          console.timeEnd("[Orchestrator] Search Engines");

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

async function selectBestCandidate(userQuery, candidates) {
  if (candidates.length === 1) return candidates[0];

  // Deduplicate candidates
  const uniqueCandidates = [...new Set(candidates.map(c => c.message.content))];
  if (uniqueCandidates.length === 1) return candidates[0];

  console.log(`[Orchestrator] Deciding between ${uniqueCandidates.length} unique candidates...`);

  const candidatesText = uniqueCandidates.map((c, i) => `Candidate ${i}:\n${c}`).join("\n\n");
  const decisionPrompt = `User Query: ${userQuery}

Below are several candidate responses. Select the best one that is most helpful, accurate, and follows the user's intent.

${candidatesText}

Respond ONLY with the index of the best candidate (e.g., 0, 1, 2...).`;

  try {
    const decisionRes = await getDecision(decisionPrompt, "You are a judge of AI responses. Respond ONLY with a single integer.");
    const content = decisionRes.message.content.trim();
    const index = parseInt(content.match(/\d+/)?.[0], 10);

    if (!isNaN(index) && index >= 0 && index < uniqueCandidates.length) {
      console.log(`[Orchestrator] Selected candidate ${index}`);
      return candidates.find(c => c.message.content === uniqueCandidates[index]);
    }
  } catch (err) {
    console.error("[Orchestrator] Selection error, falling back to first candidate:", err.message);
  }

  return candidates[0];
}

async function orchestrate(apiMessages) {
  const { messagesForChoice, userQuery } = await prepareOrchestration(apiMessages);

  // 4. Get Final Response from Choice Model (Best of N)
  const N = await calculateN();
  console.log(`[Orchestrator] Generating ${N} candidates using ${CHOICE_MODEL}...`);

  const candidatePromises = [];
  for (let i = 0; i < N; i++) {
    candidatePromises.push(getChoice(messagesForChoice));
  }

  const candidates = await Promise.all(candidatePromises);
  const finalResponse = await selectBestCandidate(userQuery, candidates);

  // 5. Update Memory (Asynchronous/Non-blocking preferably)
  // For now, just add the user/assistant exchange
  await addMessage("default", { role: 'user', content: userQuery });
  await addMessage("default", { role: 'assistant', content: finalResponse.message.content });

  return finalResponse;
}

module.exports = { orchestrate, prepareOrchestration };
