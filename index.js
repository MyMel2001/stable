const express = require("express");
const { orchestrate } = require("./lib/orchestrator");
const { updateActivity } = require("./lib/idle");
const { ensureModel, decisionOllama, choiceOllama, DECISION_MODEL, CHOICE_MODEL } = require("./lib/ollama");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MODEL_NAME = process.env.MODEL_NAME || "stable-unified";

// OpenAI Compatible Models Endpoint
app.get("/v1/models", (req, res) => {
  res.json({
    object: "list",
    data: [
      {
        id: MODEL_NAME,
        object: "model",
        created: 1677610602,
        owned_by: "stable"
      }
    ]
  });
});

// OpenAI Compatible Endpoint
app.post("/v1/chat/completions", async (req, res) => {
  try {
    const { messages, stream } = req.body;

    if (stream) {
      return res.status(400).json({ error: "Streaming not yet supported in this implementation." });
    }

    updateActivity();
    const response = await orchestrate(messages);

    // Format to OpenAI standard
    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: MODEL_NAME,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: response.message.content
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: -1,
        completion_tokens: -1,
        total_tokens: -1
      }
    });

  } catch (err) {
    console.error("API Error:", err);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Stable API running on port ${PORT}`);
  console.log(`Decision Model: ${DECISION_MODEL}`);
  console.log(`Choice Model: ${CHOICE_MODEL}`);

  // Ensure models are available on startup
  await ensureModel(decisionOllama, DECISION_MODEL);
  await ensureModel(choiceOllama, CHOICE_MODEL);
});
