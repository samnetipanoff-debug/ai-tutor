/* =========================================================
   CHAT SCREEN — text mode
   ========================================================= */

import telegram from "../telegram.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { t } from "../i18n.js";
import {
  showToast,
  setHeaderStatus,
  clearHeaderStatus,
} from "../app.js";
import { hydrateIcons } from "../icons.js";
import {
  fetchTts,
  playBlob,
  stopCurrent,
} from "../audio.js";

/* =========================================================
   LOCAL STATE
   ========================================================= */

let sending = false;

/* =========================================================
   RENDER
   ========================================================= */

export function renderChat() {
  const { profile, history } = getState();
  const lang = profile?.interface_language || "en";

  const wrapper = document.createElement("div");
  wrapper.className = "chat";

  wrapper.innerHTML = `
    <div class="chat-scroll" id="chatScroll">
      <div class="chat-messages" id="chatMessages"></div>
    </div>

    <div class="chat-input">
      <input
        class="chat-input-field"
        id="chatInput"
        type="text"
        placeholder="${t("chat.placeholder", null, lang)}"
        autocomplete="off"
        autocorrect="on"
        autocapitalize="sentences"
      />
      <button
        class="chat-input-btn"
        id="chatSend"
        type="button"
        aria-label="Send"
      >
        <span class="icon" data-icon="send"></span>
      </button>
    </div>
  `;

  hydrateIcons(wrapper);

  const messages = wrapper.querySelector("#chatMessages");
  const input = wrapper.querySelector("#chatInput");
  const sendBtn = wrapper.querySelector("#chatSend");

  // Загружаем историю
  renderHistory(messages, history, lang);

  // Если истории нет — показываем empty hint
  if (!history || history.length === 0) {
    renderEmpty(messages, lang);
  }

  // Отправка
  sendBtn.addEventListener("click", () => {
    sendTextMessage(input.value, messages, input, sendBtn);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage(input.value, messages, input, sendBtn);
    }
  });

  // Скролл вниз
  scrollToBottom(wrapper.querySelector("#chatScroll"));

  // Автофокус (только если не мобильный — чтобы не открывать клавиатуру)
  if (window.innerWidth > 640) {
    input.focus();
  }

  // Сохраняем ссылки для повторного использования
  wrapper._chatRefs = { messages, input, sendBtn, scroll: wrapper.querySelector("#chatScroll") };

  return wrapper;
}

/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory(messages, history, lang) {
  if (!Array.isArray(history)) return;

  for (const m of history) {
    if (!m?.role || !m?.content) continue;
    appendMessage(messages, m.role === "user" ? "user" : "bot", m.content);
  }
}

function renderEmpty(messages, lang) {
  const el = document.createElement("div");
  el.className = "chat-empty";
  el.innerHTML = `
    <div class="chat-empty-emoji">💬</div>
    <div class="text-sm">${t("chat.hint_listening", null, lang)}</div>
  `;
  messages.appendChild(el);
}

/* =========================================================
   MESSAGE APPEND
   ========================================================= */

function appendMessage(container, role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg is-${role}`;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  // Скролл
  const scroll = container.closest(".chat-scroll");
  if (scroll) scrollToBottom(scroll);

  return bubble;
}

function appendThinking(container) {
  const wrapper = document.createElement("div");
  wrapper.className = "msg is-bot";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  const thinking = document.createElement("div");
  thinking.className = "msg-thinking";
  thinking.innerHTML = "<span></span><span></span><span></span>";

  bubble.appendChild(thinking);
  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  const scroll = container.closest(".chat-scroll");
  if (scroll) scrollToBottom(scroll);

  return wrapper;
}

/* =========================================================
   SEND
   ========================================================= */

async function sendTextMessage(raw, messages, input, sendBtn) {
  const text = (raw || "").trim();
  if (!text || sending) return;

  sending = true;
  sendBtn.disabled = true;
  input.value = "";

  stopCurrent();

  appendMessage(messages, "user", text);

  const thinking = appendThinking(messages);

  setHeaderStatus("chat.hint_thinking", "thinking");

  try {
    const data = await api.sendText(text);

    thinking.remove();

    if (!data?.answer) {
      throw new Error("No answer");
    }

    const bubble = appendMessage(messages, "bot", data.answer);

    // Обновляем историю в state
    const { history } = getState();
    setState({
      history: [
        ...(history || []),
        { role: "user", content: text },
        { role: "assistant", content: data.answer },
      ],
    });

    // Пытаемся проиграть TTS
    clearHeaderStatus();
    await playAnswer(data.answer, bubble);

  } catch (error) {
    console.error("send error:", error);
    thinking.remove();

    const lang = getState().profile?.interface_language || "en";
    appendMessage(messages, "bot", t("chat.error_send", null, lang));
    setHeaderStatus("chat.error_send", "error");
    setTimeout(clearHeaderStatus, 3000);
  } finally {
    sending = false;
    sendBtn.disabled = false;
  }
}

async function playAnswer(text, bubble) {
  setHeaderStatus("chat.hint_speaking", "speaking");

  const blob = await fetchTts(text);

  if (!blob) {
    clearHeaderStatus();
    return;
  }

  await playBlob(blob, bubble);

  clearHeaderStatus();
}

/* =========================================================
   UTILS
   ========================================================= */

function scrollToBottom(scroll) {
  if (!scroll) return;
  requestAnimationFrame(() => {
    scroll.scrollTop = scroll.scrollHeight;
  });
}
