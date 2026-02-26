const { QuickDB } = require("quick.db");
const { SqliteDriver } = require("quick.db");
const path = require("path");

const driver = new SqliteDriver(path.join(process.cwd(), "stable.sqlite"));
const db = new QuickDB({ driver });

async function getMessages(conversationId) {
  try {
    return await db.get(`conv_${conversationId}`) || [];
  } catch (err) {
    console.error(`[DB] Error getting messages for ${conversationId}:`, err.message);
    return [];
  }
}

async function addMessage(conversationId, message) {
  try {
    const messages = await getMessages(conversationId);
    messages.push({ ...message, timestamp: Date.now() });

    // Keep last 50 messages for active context (increased from 20)
    if (messages.length > 50) {
      // Logic for summarization is handled by idle tasks
    }

    await db.set(`conv_${conversationId}`, messages);
  } catch (err) {
    console.error(`[DB] Error adding message to ${conversationId}:`, err.message);
  }
}

async function getSummary(conversationId) {
  try {
    return await db.get(`summary_${conversationId}`) || "";
  } catch (err) {
    return "";
  }
}

async function updateSummary(conversationId, summary) {
  try {
    await db.set(`summary_${conversationId}`, summary);
  } catch (err) {
    console.error(`[DB] Error updating summary for ${conversationId}:`, err.message);
  }
}

async function addKnowledge(topic, info) {
  try {
    await db.push("knowledge_base", { topic, info, timestamp: Date.now() });
  } catch (err) {
    console.error("[DB] Error adding knowledge:", err.message);
  }
}

async function logMistake(error, correction) {
  try {
    await db.push("mistakes", { error, correction, timestamp: Date.now() });
  } catch (err) {
    console.error("[DB] Error logging mistake:", err.message);
  }
}

module.exports = {
  db,
  getMessages,
  addMessage,
  getSummary,
  updateSummary,
  addKnowledge,
  logMistake
};
