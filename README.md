# 🤖 Open PAIAgent - Open Personal AI Agent

[![GitHub Sponsors](https://img.shields.io/github/sponsors/nordevelopment?color=EA4AAA&style=flat-square)](https://github.com/sponsors/nordevelopment)
[![GitHub Stars](https://img.shields.io/github/stars/nordevelopment/OpenPersonalAIAgent?style=flat-square)](https://github.com/nordevelopment/OpenPersonalAIAgent/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/nordevelopment/OpenPersonalAIAgent?style=flat-square)](https://github.com/nordevelopment/OpenPersonalAIAgent/network/members)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/nordevelopment/OpenPersonalAIAgent?style=flat-square)](https://github.com/nordevelopment/OpenPersonalAIAgent/commits/main)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

<a href="https://nordevelopment.github.io/OpenPAIAgent">Open PAIAgent project page</a>

Open PAIAgent is a high-speed, zero-bloat open-source personal AI agent built for absolute privacy and local execution. Designed as an ultra-lightweight alternative to resource-heavy frameworks, it drops complex abstractions like LangChain in favor of pure TypeScript performance, sub-second cold starts, and complete data sovereignty.

---

## ⚡Features
*   **💬 Dual Interfaces**: A beautiful cyberpunk-themed Web UI + Remote chat access via a Telegram bot.
*   **🧠 Modular System Prompt**: The agent's personality and instructions are compiled dynamically from simple Markdown files (`Agent.md`, `Identity.md`, `User.md`, `Memory.md`).
*   **⚡ Dynamic Agent Skills**: Save LLM context tokens by loading specialized prompt instructions conditionally. Skills live as modular Markdown files in `agents/<agentId>/skills/*.md`. When a query matches header keywords (e.g., `Keywords: amazon, wildberries, temu, code`), instructions are dynamically injected into the system prompt. Comes with pre-built skills for:
    *   **🛒 E-commerce & Local Search**: Specialized URL structures, price sorting, and parsing rules for **Amazon**, **Wildberries**, **Ozon**, **Temu**, and **List.am**.
    *   **💻 Software Engineering**: Refactoring, debugging, and strict code style instructions.
    *   **🎨 Content Writing & Design**: Copywriting, UI/UX guidelines, and image generation prompt optimization.
*   **👁️ AI Vision**: Attach images in the chat — the AI automatically resizes and converts them to analyze the visuals.
*   **🔧 Powerful Tool Execution (Function Calling)**:
    *   **File System Manager**: The AI can create, read, update, and delete text files within a dedicated local `workspace/` folder.
    *   **Web Scraper**: Downloads pages, strips out bloated HTML, and cleans the text for real-time AI analysis. Supports both fast static scraping and dynamic rendering with automatic fallback for SPAs (like React, Vue, e-commerce sites).
    *   **PDF Generator**: The AI can write custom HTML/CSS templates and render them into professional A4 PDF documents saved directly to the workspace.
    *   **Office Document Generator**: The AI can generate structured Excel spreadsheets (`.xlsx`) with custom columns, row styling, and formulas, as well as Word documents (`.docx`) with headings, styled paragraphs, text alignment, and tables.
    *   **Image Generation**: Generates images using **Together AI** or **X.AI (Grok)** APIs directly in the chat, with smart fallback logic (if one provider is not configured, it automatically uses the other).
*   **💾 Semantic Memory (SQLite + Vectors)**: Saves chat sessions and history using SQLite, with support for semantic vector search via the lightweight `sqlite-vec` extension.
*   **📋 Task Management & Scheduler**: Schedule automated background tasks or trigger them manually. Features an automatic background task runner (scans every 60s), real-time status tracking in the UI, and instant Telegram execution alerts.

---


## 🧠 Key Architectural Decisions

Open PAIAgent is built with a clear focus on lightweight, efficient, and transparent AI engineering:

* **Why No LangChain / LlamaIndex?**
  * **Complete State Control**: The agent's cognitive loop (think-act-evaluate) is written in vanilla TypeScript, ensuring complete control over LLM tool-calling and historical state.
  * **Sub-Second Boot**: The backend starts in **< 1 second** and consumes a minuscule **~50-100 MB of RAM**.
  * **Auditability**: Clean, readable code without nested abstractions makes debugging prompts and tools trivial.
* **Smart Hybrid RAG & Memory**:
  * Uses a local **SQLite database** combined with the lightweight **`sqlite-vec`** extension for vector embeddings.
  * Combines semantic vector similarity search with keyword fallback (`LIKE` queries), providing high-recall context retrieval with zero external database dependencies (no pgvector, Qdrant, or Pinecone required).

---

## 💡 What is this project for?
This project is designed for anyone who wants a personal AI assistant that can manage local files, browse the web, generate images, and communicate seamlessly through a slick web interface or remotely on-the-go via a Telegram bot.

### 🔒 100% Self-Hosted & Private
OpenPAIAgent runs entirely on your local machine or private server. All chat history, settings, and workspace documents are stored in a local SQLite database. Your private data never leaves your computer, and you retain absolute control over which external APIs (like OpenRouter or Together AI) are called.

### 🔓 Fully Open Source
Built with clean TypeScript and vanilla web technologies under the MIT license. No massive, opaque frameworks (like LangChain) or hidden tracking. You have full transparency, can easily audit the source code, and can freely modify or extend the agent's tools and behaviors.

---

## 🛠️ Tech Stack

*   **Backend**: Node.js, Fastify (faster and lighter than Express), TypeScript.
*   **Frontend**: EJS, Vanilla CSS (cyberpunk theme), Vanilla JS.
*   **Database**: `better-sqlite3` & `sqlite-vec` extension.
*   **Media Processing**: `sharp` (optimizes images for AI inputs).
*   **HTTP, Scraping & PDF**: `axios` + `cheerio` + `puppeteer` (headless Chrome).
*   **Telegram integration**: `telegraf`.

---

## ⚙️ Setup & Installation

### Prerequisites
*   Node.js (v20.x or later)
*   npm (v9.x or later)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/nordevelopment/OpenPAIAgent
cd OpenPAIAgent
npm install
```
*(Alternatively, you can download and extract the ZIP archive directly from GitHub).*

### 2. Run the Application
```bash
# Start - Build & start the app, Run Server
npm start


# For Developers
# Run the development server (with hot reloading)
npm run dev

# Recreate/reset the SQLite database schema
npm run db:reset

# run only build command
npm run build 
```
The server will start at `http://127.0.0.1:3000`. Open it in your browser. 
First run or no config files found, you will be automatically redirected to the settings wizard page.

## 🔒 Security

PAIAgent includes built-in security features to protect your server, files, and API balances when deployed remotely. **These security settings can be easily configured either during the first-launch setup wizard, or later at any time via the Web Settings Panel (`/settings` page in the UI).**

*   **HTTP Basic Auth**: Lock the Web UI and API endpoints behind a password. Set `APP_PASSWORD` (and optionally `APP_USER`) in your `.env` (or via Settings UI) to enable it. Leaving `APP_PASSWORD` empty disables authentication (ideal for local localhost use).
*   **Telegram Bot Whitelist**: Restrict access to your Telegram bot. Set `ALLOWED_TELEGRAM_USER_IDS` in your `.env` (or via Settings UI) with a comma-separated list of Telegram User IDs to prevent unauthorized users from using your bot and API balances.
*   **Strict Path Validation**: All AI file operations (read, write, delete) are strictly validated using `path.relative` comparison to ensure the AI cannot escape or access files outside the designated `workspace/` folder.
*   **Safe Agent Directory Routing**: Directory operations on agent profiles (like editing files) sanitize all incoming IDs to prevent Path Traversal outside the `agents/` folder.
*   **Secure Cookies & Sessions**: Session IDs are generated using Node's cryptographically secure `crypto.randomUUID()` and session cookies are protected with `sameSite: 'lax'` and conditional `secure` flags.

---

## 🚀 Video Install & Features Demo
https://www.youtube.com/watch?v=rcRkP_UiDRo

## 📸 Screenshots
<img width="1303" height="895" alt="Image" src="https://github.com/user-attachments/assets/dd7af846-8534-4f9a-860b-59f654326fac" />

<img width="1297" height="898" alt="Image" src="https://github.com/user-attachments/assets/d9a2a92e-6338-4a39-bb11-a68821ff2e4b" />

<img width="1305" height="897" alt="Image" src="https://github.com/user-attachments/assets/f02a3c3b-0ea0-41de-b73d-99a36dabd475" />

<img width="1549" height="903" alt="Image" src="https://github.com/user-attachments/assets/5a6d1b22-39a2-4e05-a167-1c5eef931b65" />

<img width="1248" height="614" alt="Image" src="https://github.com/user-attachments/assets/d321fd1c-2841-4e4d-8569-9a62e938a1ea" />

---

## ⚖️ Comparison: Open PAIAgent vs. Heavyweight Alternatives

While other self-hosted AI interfaces require heavy setups (Docker, multi-container databases, etc.), **Open PAIAgent** is optimized for raw local performance and resource conservation:

* **RAM Footprint**: **~50-100 MB** (compared to 1.5 GB+ for Open WebUI or 1 GB+ for LibreChat).
* **Startup Time**: **Sub-second (< 1s)** (compared to 30-60s boot times for Docker-based alternatives).
* **Dependencies**: **Zero**. Runs natively with just Node.js and npm.
* **Database**: Embedded SQLite. Supports semantic vector search directly via the loaded `sqlite-vec` library extension.
* **Ideal For**: Private on-the-go AI assistance, local file manipulation, and fast scraping workflows.

---

### Author: Norayr Petrosyan

---

## 💖 Support the Project

If this project saved your RAM and made your local AI workflow smoother, consider supporting its development:

*   **GitHub Sponsors**: [Sponsor nordevelopment](https://github.com/sponsors/nordevelopment)

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).