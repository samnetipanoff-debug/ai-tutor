/* =========================================================
   CHAT SCREEN — text + explicit voice messages
   ========================================================= */

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
let mediaRecorder = null;
let recordingStream = null;
let recordingChunks = [];
let recordingStartedAt = 0;
let recordingTimer = null;
let pendingVoiceBlob = null;
let pendingVoiceMime = "audio/webm";

/* =========================================================
   RENDER
   ========================================================= */

export function renderChat() {
  resetRecordingState();

  const { profile, history } = getState();
  const lang = profile?.interface_language || "en";

  const wrapper = document.createElement("div");
  wrapper.className = "chat";

  wrapper.innerHTML = `
    <div class="chat-scroll" id="chatScroll">
      <div class="chat-messages" id="chatMessages"></div>
    </div>

    <div class="voice-preview-wrap" id="voicePreviewWrap" hidden></div>

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
        id="chatMic"
        type="button"
        aria-label="${t("chat.record_voice", null, lang)}"
      >
        <span class="icon" data-icon="mic"></span>
      </button>
      <button
        class="chat-input-btn"
        id="chatSend"
        type="button"
        aria-label="${t("chat.send", null, lang)}"
      >
        <span class="icon" data-icon="check"></span>
      </button>
    </div>
  `;

  hydrateIcons(wrapper);

  const messages = wrapper.querySelector("#chatMessages");
  const input = wrapper.querySelector("#chatInput");
  const sendBtn = wrapper.querySelector("#chatSend");
  const micBtn = wrapper.querySelector("#chatMic");
  const scroll = wrapper.querySelector("#chatScroll");

  renderHistory(messages, history);

  if (!history || history.length === 0) {
    renderEmpty(messages, lang);
  }

  sendBtn.addEventListener("click", () => {
    sendTextMessage(input.value, messages, input, sendBtn);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage(input.value, messages, input, sendBtn);
    }
  });

  micBtn.addEventListener("click", () => {
    if (mediaRecorder?.state === "recording") {
      stopRecording();
    } else {
      startRecording(wrapper);
    }
  });

  scrollToBottom(scroll);

  if (window.innerWidth > 640) {
    input.focus();
  }

  return wrapper;
}

/* =========================================================
   HISTORY / EMPTY
   ========================================================= */

function renderHistory(messages, history) {
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
    <div class="chat-empty-title">${t("chat.voice_title", null, lang)}</div>
    <div class="text-sm">${t("chat.hint_microphone", null, lang)}</div>
  `;
  messages.appendChild(el);
}

/* =========================================================
   MESSAGE APPEND
   ========================================================= */

function appendMessage(container, role, text) {
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

function appendCorrection(container, correction) {
  if (!correction?.corrected) return;

  const wrapper = document.createElement("div");
  wrapper.className = "msg is-bot";

  const card = document.createElement("div");
  card.className = "msg-correction";

  const label = document.createElement("div");
  label.className = "msg-correction-label";
  label.textContent = t(
    "chat.correction",
    null,
    getState().profile?.interface_language || "en",
  );

  const corrected = document.createElement("div");
  corrected.className = "msg-correction-text";
  corrected.textContent = correction.corrected;

  card.append(label, corrected);

  if (correction.explanation) {
    const explanation = document.createElement("div");
    explanation.className = "msg-correction-explanation";
    explanation.textContent = correction.explanation;
    card.appendChild(explanation);
  }

  wrapper.appendChild(card);
  container.appendChild(wrapper);

  const scroll = container.closest(".chat-scroll");
  if (scroll) scrollToBottom(scroll);
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
  }
}

/* =========================================================
   EXPLICIT VOICE RECORDING
   ========================================================= */

async function startRecording(wrapper) {
  if (sending || mediaRecorder) return;

  const lang = getState().profile?.interface_language || "en";

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast(t("chat.error_voice", null, lang), "error");
    return;
  }

  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mimeType = getRecordingMimeType();
    mediaRecorder = new MediaRecorder(
      recordingStream,
      mimeType ? { mimeType } : undefined,
    );

    recordingChunks = [];
    recordingStartedAt = Date.now();
    pendingVoiceBlob = null;
    pendingVoiceMime = mediaRecorder.mimeType || mimeType || "audio/webm";

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) recordingChunks.push(event.data);
    });

    mediaRecorder.addEventListener("stop", () => {
      const blob = new Blob(recordingChunks, {
        type: pendingVoiceMime,
      });

      releaseRecordingStream();
      mediaRecorder = null;
      recordingChunks = [];

      if (!blob.size) {
        resetRecordingUI(wrapper);
        showToast(t("chat.error_voice", null, lang), "error");
        return;
      }

      pendingVoiceBlob = blob;
      showVoicePreview(wrapper, blob);
    });

    mediaRecorder.start(250);
    setRecordingUI(wrapper, true);
    setHeaderStatus("chat.recording", "listening");
  } catch (error) {
    console.error("microphone error:", error);
    releaseRecordingStream();
    mediaRecorder = null;

    showToast(
      t("chat.hint_microphone_denied", null, lang),
      "error",
    );
  }
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") return;

  mediaRecorder.stop();
  setHeaderStatus(
    "chat.processing_recording",
    "thinking",
  );
}

function getRecordingMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  return candidates.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  }) || "";
}

function releaseRecordingStream() {
  if (!recordingStream) return;
  for (const track of recordingStream.getTracks()) {
    track.stop();
  }
  recordingStream = null;
}

function setRecordingUI(wrapper, active) {
  const micBtn = wrapper.querySelector("#chatMic");
  const input = wrapper.querySelector("#chatInput");
  const sendBtn = wrapper.querySelector("#chatSend");

  if (!micBtn) return;

  if (active) {
    micBtn.classList.add("is-recording");
    micBtn.innerHTML = '<span class="icon" data-icon="stop"></span>';
    micBtn.setAttribute(
      "aria-label",
      t(
        "chat.stop_recording",
        null,
        getState().profile?.interface_language || "en",
      ),
    );
    hydrateIcons(micBtn);
    input.disabled = true;
    sendBtn.disabled = true;
    startRecordingTimer(wrapper);
  } else {
    micBtn.classList.remove("is-recording");
    micBtn.innerHTML = '<span class="icon" data-icon="mic"></span>';
    micBtn.setAttribute(
      "aria-label",
      t(
        "chat.record_voice",
        null,
        getState().profile?.interface_language || "en",
      ),
    );
    hydrateIcons(micBtn);
    input.disabled = false;
    sendBtn.disabled = false;
    stopRecordingTimer(wrapper);
  }
}

function startRecordingTimer(wrapper) {
  stopRecordingTimer(wrapper);
  const micBtn = wrapper.querySelector("#chatMic");
  if (!micBtn) return;

  const update = () => {
    const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
    micBtn.innerHTML = `
      <span class="voice-recording-time">${formatDuration(seconds)}</span>
    `;
  };

  update();
  recordingTimer = setInterval(update, 250);
}

function stopRecordingTimer() {
  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = null;
}

function formatDuration(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/* =========================================================
   VOICE PREVIEW / SEND
   ========================================================= */

function showVoicePreview(wrapper, blob) {
  setRecordingUI(wrapper, false);

  const wrap = wrapper.querySelector("#voicePreviewWrap");
  if (!wrap) return;

  const lang = getState().profile?.interface_language || "en";
  const duration = Math.max(
    1,
    Math.round((Date.now() - recordingStartedAt) / 1000),
  );

  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="voice-preview">
      <div class="voice-preview-icon">
        <span class="icon" data-icon="mic"></span>
      </div>
      <div class="voice-preview-info">
        <strong>${t("chat.voice_ready", null, lang)}</strong>
        <span>${formatDuration(duration)}</span>
      </div>
      <div class="voice-preview-actions">
        <button class="voice-preview-cancel" type="button">
          ${t("chat.delete_voice", null, lang)}
        </button>
        <button class="voice-preview-send" type="button">
          <span class="icon" data-icon="check"></span>
          <span>${t("chat.send_voice", null, lang)}</span>
        </button>
      </div>
    </div>
  `;

  hydrateIcons(wrap);

  wrap.querySelector(".voice-preview-cancel")?.addEventListener(
    "click",
    () => {
      pendingVoiceBlob = null;
      wrap.hidden = true;
      wrap.innerHTML = "";
      clearHeaderStatus();
    },
  );

  wrap.querySelector(".voice-preview-send")?.addEventListener(
    "click",
    () => {
      sendPendingVoice(wrapper);
    },
  );

  clearHeaderStatus();
}

async function sendPendingVoice(wrapper) {
  if (!pendingVoiceBlob || sending) return;

  const blob = pendingVoiceBlob;
  const mimeType = pendingVoiceMime;
  pendingVoiceBlob = null;

  const wrap = wrapper.querySelector("#voicePreviewWrap");
  if (wrap) {
    wrap.hidden = true;
    wrap.innerHTML = "";
  }

  const messages = wrapper.querySelector("#chatMessages");
  if (!messages) return;

  sending = true;
  setHeaderStatus("chat.hint_thinking", "thinking");
  stopCurrent();

  const thinking = appendThinking(messages);

  try {
    const data = await api.sendVoice(blob, mimeType);

    thinking.remove();

    const recognized = (data?.text || "").trim();
    const answer = (data?.answer || "").trim();

    if (!recognized) throw new Error("No transcription");
    if (!answer) throw new Error("No answer from voice pipeline");

    appendMessage(messages, "user", recognized);

    const bubble = appendMessage(messages, "bot", answer);

    if (data?.correction?.corrected) {
      appendCorrection(messages, data.correction);
    }

    const { history } = getState();
    const nextHistory = [
      ...(history || []),
      { role: "user", content: recognized },
      { role: "assistant", content: data?.correction?.corrected
          ? `${answer}\n\n${data.correction.corrected}${data.correction.explanation ? `\n\n${data.correction.explanation}` : ""}`
          : answer },
    ];

    setState({ history: nextHistory });

    clearHeaderStatus();
    await playAnswer(answer, bubble);
  } catch (error) {
    console.error("voice error:", error);
    thinking.remove();

    const lang = getState().profile?.interface_language || "en";
    appendMessage(messages, "bot", t("chat.error_voice", null, lang));

    setHeaderStatus("chat.error_voice", "error");
    setTimeout(clearHeaderStatus, 3000);
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
   CLEANUP
   ========================================================= */

function resetRecordingState() {
  stopRecordingTimer();

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch {
      // ignore cleanup error
    }
  }

  releaseRecordingStream();
  mediaRecorder = null;
  recordingChunks = [];
  pendingVoiceBlob = null;
}

function resetRecordingUI(wrapper) {
  const wrap = wrapper.querySelector("#voicePreviewWrap");
  if (wrap) {
    wrap.hidden = true;
    wrap.innerHTML = "";
  }

  setRecordingUI(wrapper, false);
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
