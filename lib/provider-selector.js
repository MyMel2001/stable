const { ensureModel, decisionOllama, choiceOllama, DECISION_MODEL, CHOICE_MODEL } = require("./ollama");
const OpenAIProvider = require("./openai-provider");

let cachedProvider = null;

function getProvider() {
  if (cachedProvider) {
    return cachedProvider;
  }

  const providerType = process.env.AI_PROVIDER || 'ollama';

  if (providerType === 'openai') {
    console.log("[Provider] Using OpenAI provider");
    cachedProvider = new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY,
      decisionModel: process.env.OPENAI_DECISION_MODEL || 'gpt-3.5-turbo',
      choiceModel: process.env.OPENAI_CHOICE_MODEL || 'gpt-4',
      timeout: parseInt(process.env.OPENAI_TIMEOUT_MS, 10) || 300000,
    });
  } else {
    console.log(`[Provider] Using Ollama provider (${DECISION_MODEL}, ${CHOICE_MODEL})`);
    cachedProvider = {
      getDecision: async (prompt, system, signal) => {
        await ensureModel(decisionOllama, DECISION_MODEL);
        return require("./ollama").getDecision(prompt, system, signal);
      },
      getChoice: async (messages, signal) => {
        await ensureModel(choiceOllama, CHOICE_MODEL);
        return require("./ollama").getChoice(messages, signal);
      },
      getChoiceStream: async (messages, signal) => {
        await ensureModel(choiceOllama, CHOICE_MODEL);
        return require("./ollama").getChoiceStream(messages, signal);
      },
      isAvailable: async () => {
        try {
          await ensureModel(decisionOllama, DECISION_MODEL);
          await ensureModel(choiceOllama, CHOICE_MODEL);
          return true;
        } catch (err) {
          return false;
        }
      }
    };
  }

  return cachedProvider;
}

module.exports = { getProvider };