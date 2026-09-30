/* =========================================================
   voice-engine.js
   Полностью автоматический голосовой движок для AI Tutor.
   Без кнопок записи. С barge-in. С адаптивным VAD.

   Использование:
     import VoiceEngine from "./voice-engine.js";

     const engine = new VoiceEngine({
       onSpeechStart: () => {},
       onSpeechEnd: (blob, mimeType) => {},
       onBargeIn: () => {},
       onStatusChange: (status) => {},
       onError: (err) => {}
     });
     await engine.start();
   ========================================================= */

const DEFAULTS = {
  // --- VAD ---
  analyserFftSize: 2048,
  smoothingTimeConstant: 0.75,

  // Калибровка при старте
  initialCalibrationMs: 600,
  initialNoiseFloor: 0.012,

  // Адаптивный noise floor
  adaptiveNoiseAlpha: 0.01,
  adaptiveNoiseCeiling: 0.06,

  // Пороги (множители к noiseFloor)
  speechStartMultiplier: 3.0,
  speechKeepMultiplier: 2.0,
  speechAbsoluteMin: 0.018,

  // --- Тайминги ---
  speechStartHoldMs: 90,
  silenceBaseMs: 750,
  silenceShortMs: 900,
  silenceLongMs: 1100,
  minSpeechDurationMs: 280,
  maxRecordingMs: 20000,

  // --- Barge-in ---
  bargeInHoldMs: 450,
  bargeInCooldownMs: 700,
  bargeInThresholdMultiplier: 8,
  bargeInTtsGraceMs: 900,

  // --- Echo cooldown ---
  echoCooldownAfterTtsMs: 400,
  echoCooldownAfterBargeInMs: 200,

  // --- Микрофон ---
  audioConstraints: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

function getSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  for (const type of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
    ) {
      return type;
    }
  }
  return "";
}

class VoiceEngine {
  constructor(options = {}) {
    this.opts = Object.assign({}, DEFAULTS, options);

    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    this.onBargeIn = options.onBargeIn || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onError = options.onError || (() => {});

    this.mediaStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.analyserData = null;
    this.rafId = null;

    this.mediaRecorder = null;
    this.recordingChunks = [];
    this.recorderMimeType = "";

    this.running = false;
    this.permission = "unknown";
    this.vadState = "idle";
    this.isRecording = false;
    this.isSpeaking = false;
    this.fetching = false;

    this.noiseFloor = this.opts.initialNoiseFloor;
    this.calibrationStartedAt = 0;
    this.speechStartedAt = 0;
    this.lastVoiceAt = 0;
    this.speechStartTimer = null;

    this.bargeInCandidateAt = 0;
    this.lastBargeInAt = 0;
    this.ttsStartedAt = 0;

    this.echoCooldownUntil = 0;

    this.maxRecordingTimer = null;

    this.currentStatus = "idle";
  }

  async start() {
    if (this.running) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      this._error("getUserMedia unavailable");
      this.permission = "denied";
      return;
    }

    this._setStatus("connecting");

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: this.opts.audioConstraints,
      });
    } catch (err) {
      this.permission =
        err?.name === "NotAllowedError" ? "denied" : "unknown";
      this._error(err?.name === "NotAllowedError" ? "mic-denied" : "mic-error");
      return;
    }

    this.permission = "granted";

    try {
      await this._setupAnalyser();
    } catch (err) {
      this._error("audio-context-error", err);
      return;
    }

    this.running = true;
    this.vadState = "calibrating";
    this.calibrationStartedAt = performance.now();
    this.noiseFloor = this.opts.initialNoiseFloor;

    this._setStatus("calibrating");
    this._loop();
  }

  stop() {
    this.running = false;

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.speechStartTimer) {
      clearTimeout(this.speechStartTimer);
      this.speechStartTimer = null;
    }

    if (this.maxRecordingTimer) {
      clearTimeout(this.maxRecordingTimer);
      this.maxRecordingTimer = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try { this.mediaRecorder.stop(); } catch (_) {}
    }
    this.mediaRecorder = null;
    this.recordingChunks = [];

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      try { this.audioContext.close(); } catch (_) {}
      this.audioContext = null;
    }

    this.analyser = null;
    this.analyserData = null;

    this.isRecording = false;
    this.isSpeaking = false;
    this.fetching = false;
    this.vadState = "idle";

    this._setStatus("idle");
  }

  notifyTtsStart() {
    this.isSpeaking = true;
    this.ttsStartedAt = performance.now();
    this._setStatus("speaking");
  }

  notifyTtsEnd() {
    this.isSpeaking = false;
    this.echoCooldownUntil =
      performance.now() + this.opts.echoCooldownAfterTtsMs;
    if (!this.isRecording && !this.fetching) {
      this.vadState = "listening";
      this._setStatus("listening");
    }
  }

  notifyFetchStart() {
    this.fetching = true;
    this._setStatus("thinking");
  }

  notifyFetchEnd() {
    this.fetching = false;
    if (!this.isSpeaking && !this.isRecording) {
      this.vadState = "listening";
      this._setStatus("listening");
    }
  }

  pause() {
    if (this.speechStartTimer) {
      clearTimeout(this.speechStartTimer);
      this.speechStartTimer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try { this.mediaRecorder.stop(); } catch (_) {}
    }
    this.isRecording = false;
    this.vadState = "listening";
  }

  _setStatus(status) {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    try { this.onStatusChange(status); } catch (_) {}
  }

  _error(code, err) {
    console.error("[VoiceEngine]", code, err || "");
    try { this.onError({ code, error: err }); } catch (_) {}
    this._setStatus("error");
  }

  async _setupAnalyser() {
    this.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();

    if (this.audioContext.state === "suspended") {
      try { await this.audioContext.resume(); } catch (_) {}
    }

    const source =
      this.audioContext.createMediaStreamSource(this.mediaStream);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.opts.analyserFftSize;
    this.analyser.smoothingTimeConstant =
      this.opts.smoothingTimeConstant;

    this.analyserData = new Uint8Array(this.analyser.fftSize);
    source.connect(this.analyser);
  }

  _loop() {
    if (!this.running) return;

    this.rafId = requestAnimationFrame(() => this._loop());

    if (!this.analyser || !this.analyserData) return;

    this.analyser.getByteTimeDomainData(this.analyserData);
    const rms = this._computeRms(this.analyserData);
    const now = performance.now();

    if (
      now - this.calibrationStartedAt <
      this.opts.initialCalibrationMs
    ) {
      this.noiseFloor =
        this.noiseFloor * 0.95 + rms * 0.05;
      return;
    }

    if (this.vadState === "calibrating") {
      this.vadState = "listening";
      this._setStatus("listening");
    }

    if (now < this.echoCooldownUntil) return;

    this._adaptNoiseFloor(rms);

    if (this.fetching) return;

    if (this.isSpeaking) {
      this._handleSpeaking(now, rms);
      return;
    }

    this._handleListening(now, rms);
  }

  _adaptNoiseFloor(rms) {
    if (this.isRecording) return;
    if (this.isSpeaking) return;
    if (rms > this.noiseFloor * 2.0) return;
    if (rms > this.opts.adaptiveNoiseCeiling) return;

    this.noiseFloor =
      this.noiseFloor * (1 - this.opts.adaptiveNoiseAlpha) +
      rms * this.opts.adaptiveNoiseAlpha;
  }

  _speechThreshold(multiplier) {
    return Math.max(
      this.opts.speechAbsoluteMin,
      this.noiseFloor * multiplier
    );
  }

  _handleListening(now, rms) {
    const startThreshold = this._speechThreshold(
      this.opts.speechStartMultiplier
    );
    const keepThreshold = this._speechThreshold(
      this.opts.speechKeepMultiplier
    );

    if (!this.isRecording) {
      if (rms > startThreshold) {
        if (!this.speechStartTimer) {
          this.speechStartTimer = setTimeout(() => {
            this.speechStartTimer = null;
            this._startRecording();
          }, this.opts.speechStartHoldMs);
        }
      } else {
        if (this.speechStartTimer) {
          clearTimeout(this.speechStartTimer);
          this.speechStartTimer = null;
        }
      }
      return;
    }

    if (rms > keepThreshold) {
      this.lastVoiceAt = now;
      return;
    }

    const speechDuration = now - this.speechStartedAt;
    const silenceNeeded = this._silenceMs(speechDuration);

    if (now - this.lastVoiceAt >= silenceNeeded) {
      this._stopRecording();
    }
  }

  _silenceMs(speechDurationMs) {
    if (speechDurationMs < 1000) return this.opts.silenceShortMs;
    if (speechDurationMs > 4000) return this.opts.silenceLongMs;
    return this.opts.silenceBaseMs;
  }

  _handleSpeaking(now, rms) {
    if (now - this.ttsStartedAt < this.opts.bargeInTtsGraceMs) {
      this.bargeInCandidateAt = 0;
      return;
    }

    const bargeThreshold = this._speechThreshold(
      this.opts.bargeInThresholdMultiplier
    );

    if (rms < bargeThreshold) {
      this.bargeInCandidateAt = 0;
      return;
    }

    if (!this.bargeInCandidateAt) {
      this.bargeInCandidateAt = now;
      return;
    }

    const held = now - this.bargeInCandidateAt;
    if (held < this.opts.bargeInHoldMs) return;

    if (now - this.lastBargeInAt < this.opts.bargeInCooldownMs) {
      return;
    }

    this.lastBargeInAt = now;
    this.bargeInCandidateAt = 0;

    this.isSpeaking = false;
    this.echoCooldownUntil =
      now + this.opts.echoCooldownAfterBargeInMs;

    try { this.onBargeIn(); } catch (_) {}

    this._setStatus("interrupted");
  }

  _computeRms(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const n = (data[i] - 128) / 128;
      sum += n * n;
    }
    return Math.sqrt(sum / data.length);
  }

  _startRecording() {
    if (this.isRecording) return;
    if (this.fetching) return;
    if (!this.mediaStream) return;

    if (
      this.mediaRecorder &&
      this.mediaRecorder.state !== "inactive"
    ) {
      return;
    }

    const mimeType = getSupportedMimeType();
    this.recorderMimeType = mimeType;

    try {
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.mediaStream, { mimeType })
        : new MediaRecorder(this.mediaStream);
    } catch (err) {
      this._error("recorder-init-failed", err);
      return;
    }

    this.recordingChunks = [];
    this.isRecording = true;
    this.speechStartedAt = performance.now();
    this.lastVoiceAt = performance.now();

    this._setStatus("recording");

    try { this.onSpeechStart(); } catch (_) {}

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordingChunks.push(event.data);
      }
    };

    this.mediaRecorder.onerror = (event) => {
      this._error("recorder-error", event);
      this.isRecording = false;
      this.recordingChunks = [];
    };

    this.mediaRecorder.onstop = () => {
      this._onRecorderStop();
    };

    this.mediaRecorder.start(100);

    this.maxRecordingTimer = setTimeout(() => {
      this.maxRecordingTimer = null;
      if (this.isRecording) {
        this._stopRecording();
      }
    }, this.opts.maxRecordingMs);
  }

  _stopRecording() {
    if (this.speechStartTimer) {
      clearTimeout(this.speechStartTimer);
      this.speechStartTimer = null;
    }

    if (this.maxRecordingTimer) {
      clearTimeout(this.maxRecordingTimer);
      this.maxRecordingTimer = null;
    }

    if (
      !this.mediaRecorder ||
      this.mediaRecorder.state === "inactive"
    ) {
      this.isRecording = false;
      return;
    }

    try {
      this.mediaRecorder.stop();
    } catch (err) {
      this._error("recorder-stop-failed", err);
      this.mediaRecorder = null;
      this.isRecording = false;
      this._setStatus("listening");
    }
  }

  _onRecorderStop() {
    const recorder = this.mediaRecorder;
    const chunks = this.recordingChunks;

    this.mediaRecorder = null;
    this.recordingChunks = [];
    this.isRecording = false;

    if (!chunks.length) {
      this._setStatus("listening");
      return;
    }

    const duration = performance.now() - this.speechStartedAt;
    if (duration < this.opts.minSpeechDurationMs) {
      this._setStatus("listening");
      return;
    }

    const mimeType =
      recorder?.mimeType ||
      this.recorderMimeType ||
      "audio/webm";

    const blob = new Blob(chunks, { type: mimeType });

    try {
      this.onSpeechEnd(blob, mimeType);
    } catch (err) {
      this._error("onSpeechEnd-threw", err);
    }

    this._setStatus("thinking");
  }
}

export { VoiceEngine };
export default VoiceEngine;
