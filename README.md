# Stable: A Barebones AGI

Stable is a minimum viable implementation of Artificial General Intelligence (AGI). It is designed with a "barebones" philosophy—providing the essential cognitive architecture required for autonomous reasoning, long-term persistence, and environment interaction without the bloat of traditional "assistant" frameworks.

## 🧠 The Nature of AGI

Stable is built on the premise that **Artificial General Intelligence is pure intelligence.**

Contrary to popular belief, AGI is not a simulation of a human. It is a functional system capable of general reasoning across any domain. Stable demonstrates that AGI does **not** require:

-   **Emotion**: Rational decision-making and goal achievement are entirely independent of biological "feelings."
-   **Subjective Understanding**: An intelligence does not need a "spark" of consciousness or internal "qualia" to process information and derive correct conclusions.
-   **A Physical Body**: Intelligence is substrate-independent. The ability to interact with digital information, APIs, and the sum of human knowledge is a valid and complete domain for general intelligence.
-   **Anything that isn't Intelligence**: AGI is the automation of pure logic, pattern recognition, and data synthesis, unburdened by human-like heuristics or anthropomorphic constraints.

Stable provides the fundamental "cognitive services" required for this intelligence: identity reinforcement, long-term memory persistence, external knowledge retrieval (search), and idle-time background processing.

## 🏗️ Architecture

Stable runs on a **dual-model architecture** to separate high-level reasoning from final output generation.

-   **The Brain (Decision Model)**: A specialized reasoning model (e.g., `gpt-oss-20b`) that determines intent, decides when to search the web, and manages cognitive state.
-   **The Vision/Voice (Choice Model)**: A multi-modal model (e.g., `qwen3-vl`) that handles final conversation, image processing, and character consistency.

### Core Cognitive Services:
-   **Long-Term Memory**: Persistent SQLite-backed conversation history with automatic idle-time summarization.
-   **Search Subsystem**: Parallelized Wikipedia and DuckDuckGo integration for real-time fact-checking.
-   **Idle Kernel**: A background scheduler that performs "sleep-time" tasks like memory consolidation and self-correction when the user is inactive.
-   **Streaming SSE Engine**: A robust Server-Sent Events implementation compatible with OpenAI-style clients (like `open-webui`), featuring a heartbeat system to maintain connections during heavy reasoning tasks.
-   **Parallel Best-of-N Selection**: Dynamically generates multiple candidate responses in parallel based on available VRAM and uses the Decision Model to select the best one, significantly improving output quality.

## 🚀 Getting Started

### Prerequisites
-   [Ollama](https://ollama.ai/) running locally or on a reachable host.
-   Node.js 18+.

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your "Models" in `.env`:
   ```env
   DECISION_MODEL=sparksammy/gpt-oss-20b-unsloth:small-hotfixed
   CHOICE_MODEL=qwen3-vl:4b
   OLLAMA_HOST_DECISION=http://127.0.0.1:11434
   OLLAMA_HOST_CHOICE=http://127.0.0.1:11434
   PORT=5481
   ```

### Running the AGI
```bash
node index.js
```

## ⚙️ Cognitive Workflow

1.  **Activity Detection**: The system tracks engagement. Interaction "wakes" the intelligence and interrupts background processing.
2.  **Orchestration**:
    -   The Brain extracts intent from text and images.
    -   Web information is fetched if the Brain determines current knowledge is insufficient.
    -   Identity, Memory, and Search results are injected into a unified "context block."
3.  **Choice Generation**: The Choice model generates multiple candidate responses in parallel (Best-of-N). The number of candidates is determined by the available VRAM.
4.  **Selection**: The Brain evaluates all candidates and selects the most optimal response.
5.  **Memory Persistence**: The exchange is recorded in the SQLite-backed "long-term memory."
6.  **Idle Processing**: After a random period (30m to 2h) of inactivity, the system runs background tasks to consolidate memory and optimize long-term data structures.

## 🎛️ Performance Tuning

Stable automatically optimizes itself for your hardware:
- **Parallelism**: Ensure `OLLAMA_NUM_PARALLEL` is set in your Ollama environment (e.g., `OLLAMA_NUM_PARALLEL=4`) to take full advantage of Best-of-N generation.
- **VRAM Awareness**: Stable checks available VRAM to determine how many parallel generations it can safely handle without swapping.

---
*"Stable is not a chatbot; it is a foundation for persistent, autonomous intelligence."*
