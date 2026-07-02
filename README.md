# ميزان (Mizan) — Omani Judicial AI Assistant ⚖️🇴🇲

**Mizan** is a highly intelligent, serverless AI assistant specifically designed for the Omani Judicial System. Powered by Cloudflare Workers and Meta's LLaMa 3, it acts as a virtual peer for judges and legal professionals within the Ministry of Justice and Legal Affairs in the Sultanate of Oman.

## 🚀 Key Features

*   **Judicial Persona:** Communicates strictly in formal Arabic (unless explicitly commanded otherwise) with the wise, authoritative, yet helpful tone of an Omani Judge.
*   **Offline Legal Corpus:** Features a built-in, hardcoded database of critical Omani laws (Basic Law, Penal Code, Civil Code, Labor Law) to ensure lightning-fast retrieval and bypass strict government network/WAF restrictions.
*   **Anti-Hallucination Guardrails:** Employs a highly advanced, multi-stage fallback logic. If a specific legal article is missing, the AI intelligently taps into its pre-trained knowledge to infer the correct context (e.g., crossing from Labor Law to Social Protection Law) rather than inventing fake laws.
*   **Smart Action Paths (UI):** Automatically generates context-aware, clickable "Suggested Judicial Actions" (`[SUGGESTION]`) at the end of every response. These chips dynamically populate the chat interface to guide the Judge through logical next steps.
*   **Government-Grade UI/UX:**
    *   Sleek Dark and Light modes featuring the deep reds and golds of the Omani Royal Emblem.
    *   Prominent, detailed Khanjar and Swords SVG emblem.
    *   Real-time digital clock and date display in the header.
    *   Clean, Vanilla JS component-driven frontend architecture.
*   **Agentic Loop & Tool Calling:** Capable of breaking down complex prompts, querying its internal database, summarizing documents, and formatting legal verdicts natively.

## 🏗 Architecture & Stack

The entire application runs on **Cloudflare's Serverless Edge Ecosystem**:

1.  **Frontend (Public):** Vanilla HTML/CSS/JS served statically via Cloudflare Assets.
    *   `public/index.html`: Core structure, header, and welcome screen.
    *   `public/styles.css`: CSS Variables, Light/Dark mode (`[data-theme="light"]`), responsive layout.
    *   `public/app.js`: LocalStorage theme management, clock logic, markdown parsing, and dynamic suggestion chip rendering.
2.  **Backend (Cloudflare Workers):**
    *   `src/index.ts`: The main Hono router handling API requests (`/api/chat`).
    *   `src/handlers/chatHandler.ts`: Manages the iterative tool-calling loop, history tracking, and exponential backoff retry logic.
    *   `src/instructions.ts`: The single source of truth for the AI's identity, system prompts, and hard-coded behavioral boundaries.
    *   `src/tools/lawCorpus.ts`: The simulated offline database for Omani laws with the intelligent Anti-Hallucination Engine.
3.  **Storage:**
    *   **Cloudflare KV:** Manages persistent chat session history.
    *   **Cloudflare R2 (Optional):** Blob storage for future document uploads.

## 🧠 AI Model Fallback Chain

To guarantee uptime and rapid response times, Mizan utilizes an automated fallback chain:
1.  **Primary:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Extremely fast, excellent reasoning).
2.  **Fallback 1:** `@cf/meta/llama-3.1-70b-instruct`
3.  **Fallback 2:** `@cf/mistral/mistral-7b-instruct-v0.2` (Lightweight and robust).

## 🛠 Deployment & Local Development

### Prerequisites
*   Node.js and npm installed.
*   A Cloudflare account with Workers & AI enabled.
*   Wrangler CLI authenticated (`npx wrangler login`).

### Setup Instructions

1.  **Install Dependencies:**
    \`\`\`bash
    npm install
    \`\`\`

2.  **Run Locally:**
    Start the local development server (simulates Cloudflare's edge locally).
    \`\`\`bash
    npm run dev
    \`\`\`

3.  **Deploy to Production:**
    Deploy the Worker and static assets to your Cloudflare account.
    \`\`\`bash
    npm run deploy
    \`\`\`

## 📜 Legal & Design Boundaries

Mizan is rigidly instructed to **never** discuss topics outside of Law and Justice. It defaults entirely to Arabic to prevent cross-language translation hallucinations when parsing strict English constraints. It is designed not to replace a lawyer, but to serve as a fast-retrieval and drafting tool for active members of the judiciary.

---
*Built for the Sultanate of Oman. 🇴🇲*
