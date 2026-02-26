const { QuickDB } = require("quick.db");
const { SqliteDriver } = require("quick.db");
const path = require("path");

const driver = new SqliteDriver(path.join(process.cwd(), "stable.sqlite"));
const db = new QuickDB({ driver });

// Schema structure (handled as key-value prefixes in QuickDB)
// conversations: Array of messages
// summaries: Summary of conversations
// knowledge: Scraped information
// mistakes: Corrected errors

module.exports = {
  db,

  async getMessages(conversationId) {
    return await db.get(`conv_${conversationId}`) || [];
  },

  async addMessage(conversationId, message) {
    const messages = await module.exports.getMessages(conversationId);
    messages.push({ ...message, timestamp: Date.now() });
    // Keep last 20 messages for active context
    if (messages.length > 20) {
      // Logic for summarization can be triggered here or in background
    }
    await db.set(`conv_${conversationId}`, messages);
  },

  async getSummary(conversationId) {
    return await db.get(`summary_${conversationId}`) || "";
  },

  async updateSummary(conversationId, summary) {
    await db.set(`summary_${conversationId}`, summary);
  },

  async addKnowledge(topic, info) {
    await db.push("knowledge_base", { topic, info, timestamp: Date.now() });
  },

  async logMistake(error, correction) {
    await db.push("mistakes", { error, correction, timestamp: Date.now() });
  }
};
