const OpenAI = require('openai');
const AIProvider = require('./ai-provider');
const { AbortController } = require('node-abort-controller');

class OpenAIProvider extends AIProvider {
  constructor(config = {}) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      timeout: config.timeout || 300000,
    });
  }

  async getDecision(prompt, system = "You are Stable's decision engine.", signal = null) {
    try {
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ];

      const response = await this.client.chat.completions.create({
        model: this.config.decisionModel || 'gpt-3.5-turbo',
        messages,
        max_tokens: 1000,
        temperature: 0.1,
        stream: false,
        timeout: this.config.timeout,
        signal: signal?.signal,
      });

      return response;
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'AbortError') throw err;
      throw new Error(`OpenAI Decision Error: ${err.message}`);
    }
  }

  async getChoice(messages, signal = null) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.choiceModel || 'gpt-4',
        messages,
        max_tokens: 4000,
        temperature: 0.7,
        stream: false,
        timeout: this.config.timeout,
        signal: signal?.signal,
      });

      return response;
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'AbortError') throw err;
      throw new Error(`OpenAI Choice Error: ${err.message}`);
    }
  }

  async getChoiceStream(messages, signal = null) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.choiceModel || 'gpt-4',
        messages,
        max_tokens: 4000,
        temperature: 0.7,
        stream: true,
        timeout: this.config.timeout,
        signal: signal?.signal,
      });

      return response;
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'AbortError') throw err;
      throw new Error(`OpenAI Stream Error: ${err.message}`);
    }
  }

  async isAvailable() {
    try {
      await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'system', content: 'test' }],
        max_tokens: 1,
        timeout: 5000,
      });
      return true;
    } catch (err) {
      return false;
    }
  }
}

module.exports = OpenAIProvider;