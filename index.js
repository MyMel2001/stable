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
      const { messagesForChoice, userQuery } = await prepareOrchestration(messages);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamResponse = await getChoiceStream(messagesForChoice);

      let fullContent = "";
      const chatId = `chatcmpl-${Date.now()}`;
      let firstChunk = true;

      for await (const chunk of streamResponse) {
        if (firstChunk) {
          const roleData = {
            id: chatId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: MODEL_NAME,
            choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
          };
          res.write(`data: ${JSON.stringify(roleData)}\n\n`);
          firstChunk = false;
        }

        if (chunk.message.content) {
          fullContent += chunk.message.content;
          const data = {
            id: chatId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: MODEL_NAME,
            choices: [{ index: 0, delta: { content: chunk.message.content }, finish_reason: null }]
          };
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }

        if (chunk.done) {
          const finalData = {
            id: chatId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: MODEL_NAME,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
          };
          res.write(`data: ${JSON.stringify(finalData)}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();

      // Update memory in background, don't let it crash the stream if it fails
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
      // In a stream, we can't change status code, but we can send an error chunk or just end
      const errorData = {
        error: {
          message: err.message,
          type: "internal_error",
          code: "stream_error"
        }
      };
      res.write(`data: ${JSON.stringify(errorData)}\n\n`);
      res.write("data: [DONE]\n\n");
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
