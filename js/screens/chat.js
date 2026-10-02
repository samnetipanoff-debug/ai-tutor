/* =========================================================
   CHAT SCREEN — text + auto voice
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
import VoiceEngine from "../voice-engine.js";

/* =========================================================
   LOCAL STATE
   ========================================================= */

let sending = false;
let lastVoiceBlobSentAt = 0;

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
        <span class="icon" data-icon="check"></span>
      </button>
    </div>
  `;

  hydrateIcons(wrapper);

  const messages = wrapper.querySelector("#chatMessages");
  const input = wrapper.querySelector("#chatInput");
  const sendBtn = wrapper.querySelector("#chatSend");
  const scroll = wrapper.querySelector("#chatScroll");

  // История
  renderHistory(messages, history, lang);

  if (!history || history.length === 0) {
    renderEmpty(messages, lang);
  }

  // Текстовый ввод
  sendBtn.addEventListener("click", () => {
    sendTextMessage(input.value, messages, input, sendBtn);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage(input.value, messages, input, sendBtn);
    }
  });

  scrollToBottom(scroll);

  if (window.innerWidth > 640) {
    input.focus();
  }

  // Голосовой движок
  startVoiceEngine(messages);

  return wrapper;
}

/* =========================================================
   HISTORY / EMPTY
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
    <div class="chat-empty-emoji">🎙</div>
    <div class="text-sm">${t("chat.hint_microphone", null, lang)}</div>
  `;
  messages.appendChild(el);
}

/* =========================================================
   MESSAGE APPEND
   ========================================================= */

function appendMessage(container, role, text) {
  // удаляем empty, если есть
  const empty = container.querySelector(".chat-empty");
  if (empty) empty.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `msg is-${role}`;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

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
   TEXT SEND
   ========================================================= */

async function sendTextMessage(raw, messages, input, sendBtn) {
  const text = (raw || "").trim();
  if (!text || sending) return;

  sending = true;
  sendBtn.disabled = true;
  input.value = "";

  stopCurrent();
  pauseVoiceEngine();

  appendMessage(messages, "user", text);

  const thinking = appendThinking(messages);

  setHeaderStatus("chat.hint_thinking", "thinking");

  try {
    const data = await api.sendText(text);
    thinking.remove();

    if (!data?.answer) throw new Error("No answer");

    const bubble = appendMessage(messages, "bot", data.answer);

    const { history } = getState();
    setState({
      history: [
        ...(history || []),
        { role: "user", content: text },
        { role: "assistant", content: data.answer },
      ],
    });

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
    resumeVoiceEngine();
  }
}

/* =========================================================
   VOICE → BACKEND
   ========================================================= */

async function handleVoiceBlob(blob, mimeType) {
  if (sending) return;
  if (!blob || blob.size === 0) return;

  // защита от дубликатов
  const now = Date.now();
  if (now - lastVoiceBlobSentAt < 800) return;
  lastVoiceBlobSentAt = now;

  sending = true;
  const messages = document.getElementById("chatMessages");
  if (!messages) {
    sending = false;
    return;
  }

  stopCurrent();

  const engine = getState().voiceEngine;
  if (engine) engine.notifyFetchStart();

  const thinking = appendThinking(messages);

  setHeaderStatus("chat.hint_thinking", "thinking");

  try {
    const data = await api.sendVoice(blob, mimeType);

    thinking.remove();

    // Если бэк отдаёт единый { text, answer } — используем оба.
    // Если только { text } — отправляем текст в LLM вторым запросом.
    let recognized = data?.text || "";
    let answer = data?.answer || "";

    if (!recognized) throw new Error("No transcription");

    appendMessage(messages, "user", recognized);

    if (!answer) {
      throw new Error("No answer from voice pipeline");
    }

    const bubble = appendMessage(messages, "bot", answer);

    const { history } = getState();
    setState({
      history: [
        ...(history || []),
        { role: "user", content: recognized },
        { role: "assistant", content: answer },
      ],
    });

    if (engine) engine.notifyFetchEnd();
    clearHeaderStatus();

    await playAnswer(answer, bubble);
  } catch (error) {
    console.error("voice error:", error);
    thinking.remove();

    const lang = getState().profile?.interface_language || "en";
    appendMessage(messages, "bot", t("chat.error_voice", null, lang));

    setHeaderStatus("chat.error_voice", "error");
    setTimeout(clearHeaderStatus, 3000);

    if (engine) engine.notifyFetchEnd();
  } finally {
    sending = false;
  }
}

/* =========================================================
   TTS
   ========================================================= */

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
   VOICE ENGINE
   ========================================================= */

function startVoiceEngine(messages) {
  // если движок уже создан — просто переиспользуем
  let engine = getState().voiceEngine;

  if (engine) return;

  engine = new VoiceEngine({
    onSpeechStart: () => {
      // авто-запись стартовала
    },

    onSpeechEnd: (blob, mimeType) => {
      handleVoiceBlob(blob, mimeType);
    },

    onBargeIn: () => {
      // пользователь перебил ИИ — глушим TTS
      stopCurrent();
    },

    onStatusChange: (status) => {
      switch (status) {
        case "listening":
          setHeaderStatus("chat.hint_listening", "listening");
          break;
        case "recording":
          setHeaderStatus("chat.hint_recording", "listening");
          break;
        case "thinking":
          setHeaderStatus("chat.hint_thinking", "thinking");
          break;
        case "speaking":
          setHeaderStatus("chat.hint_speaking", "speaking");
          break;
        case "interrupted":
          setHeaderStatus("chat.hint_interrupted", "listening");
          break;
        case "idle":
        case "calibrating":
          // ничего — ждём
          break;
        case "error":
          // ошибку покажет onError
          break;
      }
    },

    onError: ({ code }) => {
      console.error("[voice]", code);

      const lang = getState().profile?.interface_language || "en";

      if (code === "mic-denied") {
        showToast(t("chat.hint_microphone_denied", null, lang), "error");
      } else if (code === "mic-error") {
        showToast(t("chat.hint_microphone", null, lang), "error");
      }
    },
  });

  setState({ voiceEngine: engine });
  engine.start();
}

function pauseVoiceEngine() {
  const engine = getState().voiceEngine;
  if (engine) engine.pause();
}

function resumeVoiceEngine() {
  // движок сам вернётся в listening по окончании speaking/fetching
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
