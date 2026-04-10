const { AbortController } = require('node-abort-controller');

/**
 * Abstract base class for AI providers
 */
class AIProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Get decision from the AI model
   * @param {string} prompt - The prompt to send
   * @param {string} system - System instructions
   * @param {AbortController} signal - Abort signal for cancellation
   * @returns {Promise<Object>} - The response from the AI
   */
  async getDecision(prompt, system = "You are a decision engine.", signal = null) {
    throw new Error('getDecision must be implemented by subclass');
  }

  /**
   * Get choice from the AI model
   * @param {Array} messages - Array of messages
   * @param {AbortController} signal - Abort signal for cancellation
   * @returns {Promise<Object>} - The response from the AI
   */
  async getChoice(messages, signal = null) {
    throw new Error('getChoice must be implemented by subclass');
  }

  /**
   * Get streaming choice from the AI model
   * @param {Array} messages - Array of messages
   * @param {AbortController} signal - Abort signal for cancellation
   * @returns {Promise<Object>} - The response from the AI
   */
  async getChoiceStream(messages, signal = null) {
    throw new Error('getChoiceStream must be implemented by subclass');
  }

  /**
   * Check if the provider is available
   * @returns {Promise<boolean>} - True if provider is available
   */
  async isAvailable() {
    throw new Error('isAvailable must be implemented by subclass');
  }
}

module.exports = AIProvider;
