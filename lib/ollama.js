const { Ollama } = require("ollama");
const { Agent, setGlobalDispatcher } = require("undici");
require("dotenv").config();

const TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) || 300000;

// Increase undici (fetch) timeouts for large model/vision processing
setGlobalDispatcher(new Agent({
  headersTimeout: TIMEOUT,
  bodyTimeout: TIMEOUT,
  connectTimeout: 60000   // 1 minute
}));

const decisionOllama = new Ollama({ host: process.env.OLLAMA_HOST_DECISION || "http://127.0.0.1:11434" });
const choiceOllama = new Ollama({ host: process.env.OLLAMA_HOST_CHOICE || "http://127.0.0.1:11434" });

const DECISION_MODEL = process.env.DECISION_MODEL;
const CHOICE_MODEL = process.env.CHOICE_MODEL;

/**
 * Ensures models are available and logs connection status.
 */
async function ensureModel(ollamaInstance, modelName) {
  try {
    const models = await ollamaInstance.list();
    if (!models.models.find(m => m.name === modelName)) {
      console.log(`[Ollama] Pulling model ${modelName}...`);
      await ollamaInstance.pull({ model: modelName });
    }
    return true;
  } catch (err) {
    console.error(`[Ollama] Error reaching host ${ollamaInstance.config.host}:`, err.message);
    if (err.message.includes("fetch failed")) {
      console.error("[Ollama] TIP: Check if Ollama is running and the host in .env is correct (try 127.0.0.1 instead of localhost)");
    }
    return false;
  }
}

async function getDecision(prompt, system = "You are a decision engine.", signal = null) {
  try {
    if (signal?.aborted) throw new Error("AbortError");

    return await decisionOllama.chat({
      model: DECISION_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      signal: signal
    });
  } catch (err) {
    if (err.name === 'AbortError' || err.message === 'AbortError') throw err;
    console.error(`[Ollama] Decision Model Error (${DECISION_MODEL} @ ${decisionOllama.config.host}):`, err.message);
    throw err;
  }
}

async function getChoice(messages, signal = null) {
  try {
    if (signal?.aborted) throw new Error("AbortError");
    const m = await messages[1]
    const msg = {m} || messages
    return await choiceOllama.chat({
      model: CHOICE_MODEL,
      messages: msg,
      stream: false,
      signal: signal
    });
  } catch (err) {
    if (err.name === 'AbortError' || err.message === 'AbortError') throw err;
    console.error(`[Ollama] Choice Model Error (${CHOICE_MODEL} @ ${choiceOllama.config.host}):`, err.message);
    throw err;
  }
}

async function getChoiceStream(messages, signal = null) {
  try {
    if (signal?.aborted) throw new Error("AbortError");
    const m = await messages[1]
    const msg = {m} || messages
    return await choiceOllama.chat({
      model: CHOICE_MODEL,
      messages: msg,
      stream: true,
      signal: signal
    });
  } catch (err) {
    console.error(`[Ollama] Choice Stream Error (${CHOICE_MODEL} @ ${choiceOllama.config.host}):`, err.message);
    throw err;
  }
}

module.exports = {
  decisionOllama,
  choiceOllama,
  DECISION_MODEL,
  CHOICE_MODEL,
  ensureModel,
  getDecision,
  getChoice,
  getChoiceStream
};
