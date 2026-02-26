const express = require("express");
const { orchestrate, prepareOrchestration } = require("./lib/orchestrator");
const { updateActivity, startRequest, endRequest } = require("./lib/idle");
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
  const chatId = `chatcmpl-${Date.now()}`;
  try {
    const { messages, stream } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid request: messages must be an array" });
    }

    startRequest();

    if (stream) {
      // 1. Send headers immediately to prevent timeouts
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // 2. Send initial role chunk to open the stream
      const initialData = {
        id: chatId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: MODEL_NAME,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
      };
      res.write(`data: ${JSON.stringify(initialData)}\n\n`);

      // 3. Perform heavy orchestration while connection is open
      const { messagesForChoice, userQuery } = await prepareOrchestration(messages);

      console.log(`[Stream] Starting choice generation with ${CHOICE_MODEL}...`);
      const streamResponse = await getChoiceStream(messagesForChoice);

      let fullContent = "";
      let firstChunk = true;

      for await (const chunk of streamResponse) {
        const data = {
          id: chatId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: MODEL_NAME,
          choices: [
            {
              index: 0,
              delta: { content: chunk.message.content || "" },
              finish_reason: chunk.done ? "stop" : null
            }
          ]
        };

        res.write(`data: ${JSON.stringify(data)}\n\n`);
        fullContent += (chunk.message.content || "");
      }

      res.write("data: [DONE]\n\n");
      res.end();

      // Update memory in background
      try {
        await addMessage("default", { role: 'user', content: userQuery });
        await addMessage("default", { role: 'assistant', content: fullContent });
      } catch (dbErr) {
        console.error("Delayed Memory Update Error:", dbErr);
      }
      return;
    }

    const response = await orchestrate(messages);

    // Format to OpenAI standard
    res.json({
      id: chatId,
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
      const errorData = {
        id: chatId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: MODEL_NAME,
        choices: [{
          index: 0,
          delta: { content: `\n\n[API Error]: ${err.message}` },
          finish_reason: "error"
        }]
      };
      res.write(`data: ${JSON.stringify(errorData)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } finally {
    endRequest();
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
