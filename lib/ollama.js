const { Ollama } = require("ollama");
require("dotenv").config();

const decisionOllama = new Ollama({ host: process.env.OLLAMA_HOST_DECISION });
const choiceOllama = new Ollama({ host: process.env.OLLAMA_HOST_CHOICE });

const DECISION_MODEL = process.env.DECISION_MODEL;
const CHOICE_MODEL = process.env.CHOICE_MODEL;

/**
 * Very basic VRAM estimation and orchestration.
 * In a real scenario, we'd query nvidia-smi or similar,
 * but since we are multi-platform and often remote,
 * we'll focus on model availability and basic routing.
 */

async function ensureModel(ollamaInstance, modelName) {
  try {
    const models = await ollamaInstance.list();
    if (!models.models.find(m => m.name === modelName)) {
      console.log(`Pulling model ${modelName}...`);
      await ollamaInstance.pull({ model: modelName });
    }
  } catch (err) {
    console.error(`Error ensuring model ${modelName}:`, err.message);
  }
}

async function getDecision(prompt, system = "You are Stable's decision engine.") {
  return await decisionOllama.chat({
    model: DECISION_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ]
  });
}

async function getChoice(messages) {
  // Routing logic: API system prompt -> Choice model (as User message)
  // This is handled by the orchestrator, but we provide the basic call here.
  return await choiceOllama.chat({
    model: CHOICE_MODEL,
    messages: messages,
    stream: false
  });
}

module.exports = {
  decisionOllama,
  choiceOllama,
  DECISION_MODEL,
  CHOICE_MODEL,
  ensureModel,
  getDecision,
  getChoice
};
