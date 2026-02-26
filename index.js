const express = require("express");
const { orchestrate, prepareOrchestration } = require("./lib/orchestrator");
const { updateActivity } = require("./lib/idle");
const { ensureModel, decisionOllama, choiceOllama, DECISION_MODEL, CHOICE_MODEL, getChoiceStream } = require("./lib/ollama");
const { addMessage } = require("./lib/db");
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

    updateActivity();

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const { messagesForChoice, userQuery } = await prepareOrchestration(messages);
      const streamResponse = await getChoiceStream(messagesForChoice);

      let fullContent = "";
      const chatId = `chatcmpl-${Date.now()}`;

      for await (const chunk of streamResponse) {
        fullContent += chunk.message.content;
        const data = {
          id: chatId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: MODEL_NAME,
          choices: [
            {
              index: 0,
              delta: {
                content: chunk.message.content
              },
              finish_reason: chunk.done ? "stop" : null
            }
          ]
        };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }

      res.write("data: [DONE]\n\n");
      res.end();

      // Update memory after streaming finishes
      await addMessage("default", { role: 'user', content: userQuery });
      await addMessage("default", { role: 'assistant', content: fullContent });
      return;
    }

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
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error", message: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream error", message: err.message })}\n\n`);
      res.end();
    }
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
