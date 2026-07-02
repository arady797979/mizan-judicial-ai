// ============================================================
// app.js — Frontend Application (Vanilla JS, ES Modules)
//
// Modules (single concern, decoupled):
//   - ApiClient    → all fetch calls
//   - AttachmentManager → file uploads & preview
//   - ChatRenderer → DOM rendering for messages
//   - ChatSession  → session state management
//   - App          → orchestration & event wiring
// ============================================================

/* ----------------------------------------------------------
   ApiClient — all HTTP communication with the Worker
   Arabic error messages + automatic retry on network failure
   ---------------------------------------------------------- */
const ApiClient = (() => {
  const BASE = ""; // Same origin — Worker serves frontend too

  // Arabic error mapping
  const AR_ERRORS = {
    400: "طلب غير صالح. يرجى مراجعة البيانات المرسلة.",
    413: "حجم الملف كبير جداً. يرجى تقليل حجم الملف.",
    415: "نوع الملف غير مدعوم. يرجى استخدام PDF أو نص أو صورة.",
    429: "تجاوزت الحد المسموح به من الطلبات. يرجى الانتظار دقيقة.",
    500: "خطأ داخلي في الخادم. يرجى المحاولة لاحقاً.",
    503: "الخادم غير متاح مؤقتاً. يرجى الانتظار والمحاولة مجدداً.",
    network: "تعذّر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً.",
  };

  function arabicError(status, fallback) {
    return AR_ERRORS[status] ?? fallback ?? `خطأ غير متوقع (${status})، يرجى المحاولة لاحقاً.`;
  }

  /** Simple fetch with timeout */
  async function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("انتهت مهلة الاتصال بالخادم. يرجى المحاولة مرة أخرى.");
      }
      throw new Error(AR_ERRORS.network);
    } finally {
      clearTimeout(timer);
    }
  }

  async function chat({ sessionId, message, attachments = [] }) {
    let lastErr;
    // 2 client-side retries for transient network blips
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetchWithTimeout(
          `${BASE}/api/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, message, attachments }),
          },
          60_000 // 60s — AI can be slow
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? arabicError(res.status));
        }

        return await res.json();
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          // Brief pause before retry
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    throw lastErr;
  }

  async function uploadFile(file) {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetchWithTimeout(
        `${BASE}/api/upload`,
        { method: "POST", body: form },
        45_000
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? arabicError(res.status));
      }
      return await res.json();
    } catch (err) {
      if (err.message.includes("timeout") || err.message.includes("مهلة")) {
        throw new Error("انتهت مهلة رفع الملف. يرجى المحاولة مع ملف أصغر حجماً.");
      }
      throw err;
    }
  }

  async function clearSession(sessionId) {
    try {
      await fetch(`${BASE}/api/session/${sessionId}`, { method: "DELETE" });
    } catch {
      // non-fatal — ignore silently
    }
  }

  return { chat, uploadFile, clearSession };
})();


/* ----------------------------------------------------------
   AttachmentManager — upload files & manage attachment list
   ---------------------------------------------------------- */
const AttachmentManager = (() => {
  /** @type {{ id: string; name: string; mimeType: string }[]} */
  let attachments = [];
  let onChangeCallback = null;

  function getAll() { return [...attachments]; }
  function clear() {
    attachments = [];
    notify();
  }

  function notify() {
    if (onChangeCallback) onChangeCallback(attachments);
  }

  async function add(file) {
    // Show uploading chip immediately
    const tempId = `uploading-${Date.now()}`;
    attachments.push({ id: tempId, name: file.name, mimeType: file.type, uploading: true });
    notify();

    try {
      const uploaded = await ApiClient.uploadFile(file);
      // Replace temp with real
      const idx = attachments.findIndex((a) => a.id === tempId);
      if (idx !== -1) attachments[idx] = { ...uploaded, uploading: false };
      notify();
      return uploaded;
    } catch (err) {
      // Remove failed upload
      attachments = attachments.filter((a) => a.id !== tempId);
      notify();
      throw err;
    }
  }

  function remove(id) {
    attachments = attachments.filter((a) => a.id !== id);
    notify();
  }

  function onChange(cb) { onChangeCallback = cb; }

  return { add, remove, clear, getAll, onChange };
})();


/* ----------------------------------------------------------
   ChatRenderer — DOM rendering for messages
   ---------------------------------------------------------- */
const ChatRenderer = (() => {
  const container = document.getElementById("messages");
  const welcomeState = document.getElementById("welcome-state");

  function hideWelcome() {
    if (welcomeState && !welcomeState.hidden) {
      welcomeState.style.opacity = "0";
      welcomeState.style.transition = "opacity 0.3s ease";
      setTimeout(() => { welcomeState.hidden = true; }, 300);
    }
  }

  function showWelcome() {
    if (welcomeState) {
      welcomeState.hidden = false;
      welcomeState.style.opacity = "1";
    }
  }

  /** Very lightweight markdown → HTML converter */
  function parseMarkdown(text) {
    return text
      // Headers
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h3>$1</h3>")
      // Bold & italic
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Inline code
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // HR
      .replace(/^---+$/gm, "<hr>")
      // Blockquote
      .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
      // Unordered list items
      .replace(/^[•\-*] (.+)$/gm, "<li>$1</li>")
      // Ordered list items
      .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
      // Line breaks
      .replace(/\n/g, "<br>");
  }

  function scrollToBottom() {
    container.scrollTop = container.scrollHeight;
  }

  function appendUserMessage(text) {
    hideWelcome();
    const div = document.createElement("div");
    div.className = "message message--user";
    div.setAttribute("role", "article");
    div.setAttribute("aria-label", "رسالتك");
    div.innerHTML = `
      <div class="message__avatar" aria-hidden="true">ق</div>
      <div class="message__body">
        <div class="message__bubble">${escapeHtml(text).replace(/\n/g, "<br>")}</div>
      </div>
    `;
    container.appendChild(div);
    scrollToBottom();
    return div;
  }

  function appendTypingIndicator() {
    const div = document.createElement("div");
    div.className = "message message--assistant";
    div.id = "typing-indicator-msg";
    div.setAttribute("aria-label", "ميزان يكتب");
    div.innerHTML = `
      <div class="message__avatar" aria-hidden="true">⚖️</div>
      <div class="message__body">
        <div class="message__bubble">
          <div class="typing-indicator" aria-hidden="true">
            <div class="typing-indicator__dot"></div>
            <div class="typing-indicator__dot"></div>
            <div class="typing-indicator__dot"></div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(div);
    scrollToBottom();
    return div;
  }

  function removeTypingIndicator() {
    const el = document.getElementById("typing-indicator-msg");
    if (el) el.remove();
  }

  // Add global function to allow clicking suggestions
  window.submitSuggestion = function(text) {
    const inputArea = document.getElementById("chat-input");
    if (inputArea) {
      inputArea.value = text;
      // Trigger the send logic from the global scope if possible, or we can just populate the input
      // Actually better to dispatch an event or click the send button
      const sendBtn = document.getElementById("send-btn");
      if (sendBtn && !sendBtn.disabled) sendBtn.click();
    }
  };

  function appendAssistantMessage(text, toolsUsed = []) {
    removeTypingIndicator();
    hideWelcome();
    
    // Extract suggestions from text
    const suggestions = [];
    const cleanText = text.replace(/\[SUGGESTION\]\s*(.+)/g, (match, p1) => {
      suggestions.push(p1.trim());
      return "";
    });

    const div = document.createElement("div");
    div.className = "message message--assistant";
    div.setAttribute("role", "article");
    div.setAttribute("aria-label", "رد ميزان");

    const toolsBadges = toolsUsed.length > 0
      ? `<div class="message__tools-used" aria-label="الأدوات المستخدمة">
          ${toolsUsed.map((t) => `<span class="tool-badge">🔧 ${toolLabel(t)}</span>`).join("")}
         </div>`
      : "";

    const suggestionsHTML = suggestions.length > 0
      ? `<div class="message__suggestions" style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.75rem;">
          <div style="font-size:0.75rem; color:var(--clr-gold); font-weight:600;">💡 إجراءات مقترحة:</div>
          <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
            ${suggestions.map(s => `<button class="suggestion-chip" onclick="window.submitSuggestion('${escapeHtml(s).replace(/'/g, "\\'")}')">${escapeHtml(s)}</button>`).join("")}
          </div>
         </div>`
      : "";

    div.innerHTML = `
      <div class="message__avatar" aria-hidden="true">⚖️</div>
      <div class="message__body">
        <div class="message__bubble">${parseMarkdown(cleanText.trim())}</div>
        ${suggestionsHTML}
        ${toolsBadges}
      </div>
    `;
    container.appendChild(div);
    scrollToBottom();
    return div;
  }

  function appendErrorMessage(text) {
    removeTypingIndicator();
    const div = document.createElement("div");
    div.className = "message message--assistant";
    div.setAttribute("role", "alert");
    div.innerHTML = `
      <div class="message__avatar" aria-hidden="true">⚠️</div>
      <div class="message__body">
        <div class="message__bubble" style="border-color: rgba(139,0,0,0.4); color: #FF8080;">
          ${escapeHtml(text)}
        </div>
      </div>
    `;
    container.appendChild(div);
    scrollToBottom();
  }

  function clearMessages() {
    container.innerHTML = "";
    if (welcomeState) {
      welcomeState.hidden = false;
      container.appendChild(welcomeState);
      welcomeState.style.opacity = "1";
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toolLabel(name) {
    const labels = {
      fetch_legal_reference: "بحث في الويب (محجوب محلياً)",
      analyze_document: "تحليل مستند",
      get_legal_template: "قالب قانوني",
      query_omani_law_database: "قاعدة القوانين العُمانية",
    };
    return labels[name] ?? name;
  }

  return {
    appendUserMessage,
    appendAssistantMessage,
    appendTypingIndicator,
    removeTypingIndicator,
    appendErrorMessage,
    clearMessages,
    showWelcome,
  };
})();


/* ----------------------------------------------------------
   ChatSession — session state
   ---------------------------------------------------------- */
const ChatSession = (() => {
  let sessionId = null;
  let messageCount = 0;

  function getSessionId() { return sessionId; }
  function setSessionId(id) { sessionId = id; }
  function incrementCount() { messageCount++; }
  function getCount() { return messageCount; }
  function reset() { sessionId = null; messageCount = 0; }

  return { getSessionId, setSessionId, incrementCount, getCount, reset };
})();


/* ----------------------------------------------------------
   AttachmentBarUI — renders the attachment preview strip
   ---------------------------------------------------------- */
const AttachmentBarUI = (() => {
  const bar = document.getElementById("attachment-bar");
  const list = document.getElementById("attachment-list");

  function render(attachments) {
    list.innerHTML = "";

    if (attachments.length === 0) {
      bar.hidden = true;
      return;
    }

    bar.hidden = false;
    attachments.forEach((att) => {
      const chip = document.createElement("div");
      chip.className = "attachment-chip";
      chip.setAttribute("role", "listitem");
      chip.innerHTML = `
        <span aria-hidden="true">${mimeIcon(att.mimeType)}</span>
        <span>${escapeHtml(att.name)}</span>
        ${att.uploading
          ? `<span style="color:var(--clr-gold);font-size:0.7rem">جاري الرفع...</span>`
          : `<button class="attachment-chip__remove" data-id="${att.id}" title="إزالة" aria-label="إزالة ${att.name}">✕</button>`
        }
      `;
      list.appendChild(chip);
    });

    // Remove buttons
    list.querySelectorAll(".attachment-chip__remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        AttachmentManager.remove(btn.dataset.id);
      });
    });
  }

  function mimeIcon(mime) {
    if (mime === "application/pdf") return "📄";
    if (mime === "text/plain") return "📝";
    if (mime.startsWith("image/")) return "🖼️";
    return "📎";
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  return { render };
})();


/* ----------------------------------------------------------
   App — orchestration & event wiring
   ---------------------------------------------------------- */
const App = (() => {
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("btn-send");
  const fileInput = document.getElementById("file-input");
  const attachBtn = document.getElementById("btn-attach");
  const newChatBtn = document.getElementById("btn-new-chat");
  const clearChatBtn = document.getElementById("btn-clear-chat");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const chatTitle = document.getElementById("chat-title");
  const statusDot = document.getElementById("status-dot");

  let isLoading = false;

  // ----------------------------------------------------------
  // Init
  // ----------------------------------------------------------
  function init() {
    // Auto-resize textarea
    messageInput.addEventListener("input", () => {
      updateSendBtn();
      autoResizeTextarea();
    });

    // Send on Enter (Shift+Enter for new line)
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) sendMessage();
      }
    });

    // Send button
    sendBtn.addEventListener("click", sendMessage);

    // Attach button → trigger file input
    attachBtn.addEventListener("click", () => fileInput.click());

    // File selected
    fileInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = ""; // Reset so same file can be re-attached
      for (const file of files) {
        try {
          await AttachmentManager.add(file);
        } catch (err) {
          ChatRenderer.appendErrorMessage(`⚠️ خطأ في رفع الملف "${file.name}": ${err.message}`);
        }
      }
    });

    // Drag & drop on chat area
    const chatArea = document.querySelector(".chat-area");
    chatArea.addEventListener("dragover", (e) => { e.preventDefault(); chatArea.style.outline = "2px dashed var(--clr-gold)"; });
    chatArea.addEventListener("dragleave", () => { chatArea.style.outline = ""; });
    chatArea.addEventListener("drop", async (e) => {
      e.preventDefault();
      chatArea.style.outline = "";
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        try { await AttachmentManager.add(file); }
        catch (err) { ChatRenderer.appendErrorMessage(`خطأ: ${err.message}`); }
      }
    });

    // New chat
    newChatBtn.addEventListener("click", startNewChat);
    clearChatBtn.addEventListener("click", startNewChat);

    // Sidebar toggle
    sidebarToggle.addEventListener("click", toggleSidebar);

    // Quick tool buttons in sidebar
    document.querySelectorAll(".sidebar__tool-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prompt = btn.dataset.prompt;
        if (prompt) {
          messageInput.value = prompt;
          messageInput.dispatchEvent(new Event("input"));
          messageInput.focus();
          // Auto-close sidebar on mobile
          if (window.innerWidth < 768) toggleSidebar();
        }
      });
    });

    // Attachment bar updates
    AttachmentManager.onChange((attachments) => {
      AttachmentBarUI.render(attachments);
      updateSendBtn();
    });

    initThemeAndClock();

    // Initial state
    updateSendBtn();
  }

  // ----------------------------------------------------------
  // Send message — with status updates and clean error handling
  // ----------------------------------------------------------
  async function sendMessage() {
    if (isLoading) return;
    const text = messageInput.value.trim();
    if (!text) return;

    const attachments = AttachmentManager.getAll().filter((a) => !a.uploading);

    // Clear input immediately
    messageInput.value = "";
    autoResizeTextarea();
    setLoading(true);

    // Render user bubble
    ChatRenderer.appendUserMessage(text);
    ChatRenderer.appendTypingIndicator();

    // Update title on first message
    if (ChatSession.getCount() === 0) {
      chatTitle.textContent = text.slice(0, 40) + (text.length > 40 ? "..." : "");
    }

    const sentAttachments = attachments.map(({ id, name, mimeType }) => ({ id, name, mimeType }));
    AttachmentManager.clear();

    try {
      const response = await ApiClient.chat({
        sessionId: ChatSession.getSessionId(),
        message: text,
        attachments: sentAttachments,
      });

      ChatSession.setSessionId(response.sessionId);
      ChatSession.incrementCount();

      ChatRenderer.appendAssistantMessage(response.reply, response.toolsUsed ?? []);
    } catch (err) {
      // All errors are already in Arabic from ApiClient
      const isNetwork =
        !navigator.onLine ||
        err.message.includes("الاتصال") ||
        err.message.includes("الشبكة") ||
        err.message.includes("مهلة");

      const msg = isNetwork
        ? `⚠️ ${err.message}\n\nيمكنك إعادة إرسال رسالتك بعد الاتصال بالإنترنت.`
        : `⚠️ ${err.message}`;

      ChatRenderer.appendErrorMessage(msg);

      // Restore the message text so user can retry without retyping
      messageInput.value = text;
      autoResizeTextarea();
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------------------------------------
  // New / clear chat
  // ----------------------------------------------------------
  async function startNewChat() {
    if (ChatSession.getSessionId()) {
      ApiClient.clearSession(ChatSession.getSessionId()).catch(() => {});
    }
    ChatSession.reset();
    AttachmentManager.clear();
    ChatRenderer.clearMessages();
    chatTitle.textContent = "محادثة جديدة";
    messageInput.value = "";
    autoResizeTextarea();
    updateSendBtn();
  }

  // ----------------------------------------------------------
  // Sidebar toggle
  // ----------------------------------------------------------
  function toggleSidebar() {
    sidebar.classList.toggle("collapsed");
    const expanded = !sidebar.classList.contains("collapsed");
    sidebarToggle.setAttribute("aria-expanded", expanded.toString());
  }

  // ----------------------------------------------------------
  // Theme & Clock logic
  // ----------------------------------------------------------
  const themeToggleBtn = document.getElementById("theme-toggle");
  const clockTimeEl = document.getElementById("clock-time");
  const clockDateEl = document.getElementById("clock-date");
  const htmlEl = document.documentElement;

  function initThemeAndClock() {
    // Theme setup
    const savedTheme = localStorage.getItem("mizan_theme") || "dark";
    htmlEl.setAttribute("data-theme", savedTheme);
    updateThemeIcon(savedTheme);

    themeToggleBtn.addEventListener("click", () => {
      const current = htmlEl.getAttribute("data-theme");
      const nextTheme = current === "light" ? "dark" : "light";
      htmlEl.setAttribute("data-theme", nextTheme);
      localStorage.setItem("mizan_theme", nextTheme);
      updateThemeIcon(nextTheme);
    });

    // Clock setup
    updateClock();
    setInterval(updateClock, 1000);
  }

  function updateThemeIcon(theme) {
    if (theme === "light") {
      themeToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    } else {
      themeToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    }
  }

  function updateClock() {
    const now = new Date();
    // Time like 02:45 PM
    clockTimeEl.textContent = now.toLocaleTimeString('ar-OM', { hour: '2-digit', minute: '2-digit' });
    // Date like 01 / 07 / 2026
    clockDateEl.textContent = now.toLocaleDateString('en-GB'); 
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  function setLoading(state) {
    isLoading = state;
    sendBtn.disabled = state;
    statusDot.className = "status-dot" + (state ? " loading" : "");
    messageInput.disabled = state;
  }

  function updateSendBtn() {
    const hasText = messageInput.value.trim().length > 0;
    const hasUploads = AttachmentManager.getAll().some((a) => !a.uploading);
    sendBtn.disabled = isLoading || (!hasText && !hasUploads);
  }

  function autoResizeTextarea() {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + "px";
  }

  return { init };
})();

// ----------------------------------------------------------
// Boot
// ----------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => App.init());
