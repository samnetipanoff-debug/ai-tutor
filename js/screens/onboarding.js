/* =========================================================
   ONBOARDING — 6-step wizard
   ========================================================= */

import telegram from "../telegram.js";
import { api } from "../api.js";
import {
  getState,
  setState,
} from "../state.js";
import { t, getSupportedLanguages } from "../i18n.js";
import { navigate, showToast, setHeaderStatus, clearHeaderStatus } from "../app.js";
import { hydrateIcons } from "../icons.js";

/* =========================================================
   STEPS
   ========================================================= */

const STEPS = [
  "interface_language",
  "native_language",
  "learning_language",
  "level",
  "goal",
  "done",
];

/* =========================================================
   SVG FLAGS
   ========================================================= */

const LANGUAGE_FLAGS = {
  ru: `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <rect width="24" height="16" fill="#fff"/>
    <rect y="5.33" width="24" height="5.34" fill="#0039a6"/>
    <rect y="10.67" width="24" height="5.33" fill="#d52b1e"/>
  </svg>`,

  en: `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <rect width="24" height="16" fill="#012169"/>
    <path d="M0 0 L24 16 M24 0 L0 16" stroke="#fff" stroke-width="3"/>
    <path d="M0 0 L24 16 M24 0 L0 16" stroke="#c8102e" stroke-width="1.6"/>
    <path d="M12 0 V16 M0 8 H24" stroke="#fff" stroke-width="5"/>
    <path d="M12 0 V16 M0 8 H24" stroke="#c8102e" stroke-width="3"/>
  </svg>`,

  de: `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <rect width="24" height="16" fill="#000"/>
    <rect y="5.33" width="24" height="5.34" fill="#dd0000"/>
    <rect y="10.67" width="24" height="5.33" fill="#ffce00"/>
  </svg>`,

  sr: `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <rect width="24" height="16" fill="#c6363c"/>
    <rect y="5.33" width="24" height="5.34" fill="#0c4076"/>
    <rect y="10.67" width="24" height="5.33" fill="#fff"/>
  </svg>`,

  es: `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <rect width="24" height="16" fill="#aa151b"/>
    <rect y="4" width="24" height="8" fill="#f1bf00"/>
  </svg>`,

  fr: `<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <rect width="8" height="16" fill="#0055a4"/>
    <rect x="8" width="8" height="16" fill="#fff"/>
    <rect x="16" width="8" height="16" fill="#ef4135"/>
  </svg>`,
};

/* =========================================================
   NATIVE LANGUAGE NAMES (одинаковые на любом интерфейсе)
   ========================================================= */

const LANGUAGE_NATIVE_NAMES = {
  ru: "Русский",
  en: "English",
  de: "Deutsch",
  sr: "Srpski",
  es: "Español",
  fr: "Français",
};

/* =========================================================
   LEVELS + GOALS
   ========================================================= */

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const LEVEL_EMOJIS = {
  a1: "🌱",
  a2: "🌿",
  b1: "🌳",
  b2: "🔥",
  c1: "🏆",
};

const GOALS = ["conversation", "work", "travel", "study", "culture"];
const GOAL_EMOJIS = {
  conversation: "🗣",
  work: "💼",
  travel: "✈️",
  study: "📚",
  culture: "🎬",
};

/* =========================================================
   LOCAL STATE
   ========================================================= */

let localStep = null;
let localValue = null;
let submitting = false;

/* =========================================================
   ENTRY POINT
   ========================================================= */

export function renderOnboarding() {
  const { profile } = getState();

  const step =
    localStep ||
    profile?.onboarding_step ||
    "interface_language";

  localStep = step;

  if (step === "done") {
    return renderDone();
  }

  return renderStep(step);
}

/* =========================================================
   PROGRESS BAR
   ========================================================= */

function renderProgress(currentStep) {
  const idx = STEPS.indexOf(currentStep);
  const total = STEPS.length - 1;

  let html = '<div class="onboarding-progress">';

  for (let i = 0; i < total; i++) {
    const cls =
      i < idx
        ? "is-done"
        : i === idx
          ? "is-current"
          : "";
    html += `<div class="onboarding-progress-dot ${cls}"></div>`;
  }

  html += "</div>";
  return html;
}

/* =========================================================
   RENDER STEP
   ========================================================= */

function renderStep(step) {
  const wrapper = document.createElement("div");
  wrapper.className = "onboarding";

  const config = getStepConfig(step);
  if (!config) {
    return wrapper;
  }

  wrapper.innerHTML = `
    <div class="onboarding-header">
      ${renderProgress(step)}
      <h1 class="onboarding-title">${config.title}</h1>
      <p class="onboarding-subtitle">${config.subtitle}</p>
    </div>

    <div class="onboarding-body">
      ${config.bodyHtml}
    </div>

    <div class="onboarding-footer">
      <button
        class="btn btn-primary btn-block btn-lg"
        id="onboardingContinue"
        type="button"
        disabled
      >
        ${t("common.continue", null, getInterfaceLanguage())}
      </button>
    </div>
  `;

  hydrateIcons(wrapper);

  const body = wrapper.querySelector(".onboarding-body");
  const continueBtn = wrapper.querySelector("#onboardingContinue");

  // Bind option buttons
  body.querySelectorAll(".option").forEach((el) => {
    el.addEventListener("click", () => {
      const value = el.getAttribute("data-value");
      selectOption(body, value, config.multiSelect);
      telegram.haptic.selection();
      continueBtn.disabled = false;
    });
  });

  // Bind continue
  continueBtn.addEventListener("click", () => {
    if (submitting) return;
    submitStep(step, config.getValue ? config.getValue() : localValue);
  });

  // Pre-select already saved value
  const current = getCurrentValue(step);
  if (current) {
    const btn = body.querySelector(`.option[data-value="${current}"]`);
    if (btn) {
      btn.classList.add("is-selected");
      continueBtn.disabled = false;
      localValue = current;
    }
  }

  return wrapper;
}

/* =========================================================
   SELECT
   ========================================================= */

function selectOption(root, value, multi = false) {
  if (!multi) {
    root.querySelectorAll(".option").forEach((el) => {
      el.classList.toggle(
        "is-selected",
        el.getAttribute("data-value") === value,
      );
    });
    localValue = value;
    return;
  }

  const el = root.querySelector(`.option[data-value="${value}"]`);
  if (el) el.classList.toggle("is-selected");

  const selected = [...root.querySelectorAll(".option.is-selected")].map(
    (n) => n.getAttribute("data-value"),
  );
  localValue = selected;
}

/* =========================================================
   SUBMIT
   ========================================================= */

async function submitStep(step, value) {
  if (submitting) return;
  if (!value || (Array.isArray(value) && value.length === 0)) return;

  submitting = true;
  setHeaderStatus("common.loading");

  try {
    const result = await api.saveOnboardingStep(step, value);

    if (!result?.profile) {
      throw new Error("Invalid response");
    }

    setState({ profile: result.profile });

    localStep = result.profile.onboarding_step;
    localValue = null;

    if (result.profile.onboarding_step === "done") {
      clearHeaderStatus();
      setTimeout(() => {
        navigate("menu");
      }, 800);
    } else {
      clearHeaderStatus();
      const fresh = renderOnboarding();
      replaceScreen(fresh);
    }
  } catch (error) {
    console.error("onboarding submit error:", error);
    clearHeaderStatus();
    showToast(t("errors.network", null, getInterfaceLanguage()), "error");
  } finally {
    submitting = false;
  }
}

/* =========================================================
   DONE SCREEN
   ========================================================= */

function renderDone() {
  const wrapper = document.createElement("div");
  wrapper.className = "onboarding";

  wrapper.innerHTML = `
    <div class="onboarding-done">
      <div class="onboarding-done-icon">
        <span class="icon" data-icon="check"></span>
      </div>
      <h1 class="onboarding-title text-center">
        ${t("onboarding.step_done_title", null, getInterfaceLanguage())}
      </h1>
      <p class="onboarding-subtitle text-center">
        ${t("onboarding.step_done_subtitle", null, getInterfaceLanguage())}
      </p>
      <button
        class="btn btn-primary btn-lg"
        id="onboardingStart"
        type="button"
        style="margin-top: 8px;"
      >
        ${t("onboarding.step_done_start", null, getInterfaceLanguage())}
      </button>
    </div>
  `;

  hydrateIcons(wrapper);

  wrapper.querySelector("#onboardingStart").addEventListener("click", () => {
    telegram.haptic.impact("medium");
    navigate("menu");
  });

  return wrapper;
}

/* =========================================================
   STEP CONFIG
   ========================================================= */

function getStepConfig(step) {
  switch (step) {
    case "interface_language":
      return {
        title: t("onboarding.step_interface_title", null, detectInterfaceLanguage()),
        subtitle: t("onboarding.step_interface_subtitle", null, detectInterfaceLanguage()),
        bodyHtml: renderLanguageGrid(),
        getValue: () => localValue,
      };

    case "native_language":
      return {
        title: t("onboarding.step_native_title", null, getInterfaceLanguage()),
        subtitle: t("onboarding.step_native_subtitle", null, getInterfaceLanguage()),
        bodyHtml: renderLanguageGrid(),
        getValue: () => localValue,
      };

    case "learning_language":
      return {
        title: t("onboarding.step_learning_title", null, getInterfaceLanguage()),
        subtitle: t("onboarding.step_learning_subtitle", null, getInterfaceLanguage()),
        bodyHtml: renderLanguageGrid({
          exclude: [getState().profile?.native_language],
        }),
        getValue: () => localValue,
      };

    case "level":
      return {
        title: t("onboarding.step_level_title", null, getInterfaceLanguage()),
        subtitle: t("onboarding.step_level_subtitle", null, getInterfaceLanguage()),
        bodyHtml: renderLevelList(),
        getValue: () => localValue,
      };

    case "goal":
      return {
        title: t("onboarding.step_goal_title", null, getInterfaceLanguage()),
        subtitle: t("onboarding.step_goal_subtitle", null, getInterfaceLanguage()),
        bodyHtml: renderGoalList(),
        getValue: () => localValue,
      };

    default:
      return null;
  }
}

/* =========================================================
   BODY BUILDERS
   ========================================================= */

function renderLanguageGrid(opts = {}) {
  const languages = getSupportedLanguages().filter(
    (code) => !opts.exclude?.includes(code),
  );

  let html = '<div class="onboarding-grid">';

  for (const code of languages) {
    const flagSvg = LANGUAGE_FLAGS[code] || "";
    const label = t(`languages.${code}`, null, getInterfaceLanguage());
    const native = LANGUAGE_NATIVE_NAMES[code] || "";

    html += `
      <button
        class="option"
        type="button"
        data-value="${code}"
      >
        <div class="option-left">
          <span class="option-flag">${flagSvg}</span>
          <div class="option-text">
            <span class="option-title">${label}</span>
            ${
              native && native !== label
                ? `<span class="option-subtitle">${native}</span>`
                : ""
            }
          </div>
        </div>
        <span class="option-check">
          <span class="icon" data-icon="check"></span>
        </span>
      </button>
    `;
  }

  html += "</div>";
  return html;
}

function renderLevelList() {
  let html = '<div class="option-list">';

  for (const code of LEVELS) {
    const emoji = LEVEL_EMOJIS[code] || "•";
    const label = t(`onboarding.levels.${code}`, null, getInterfaceLanguage());

    html += `
      <button class="option" type="button" data-value="${code}">
        <div class="option-left">
          <span class="option-emoji">${emoji}</span>
          <div class="option-text">
            <span class="option-title">${label}</span>
          </div>
        </div>
        <span class="option-check">
          <span class="icon" data-icon="check"></span>
        </span>
      </button>
    `;
  }

  html += "</div>";
  return html;
}

function renderGoalList() {
  let html = '<div class="option-list">';

  for (const code of GOALS) {
    const emoji = GOAL_EMOJIS[code] || "•";
    const label = t(`onboarding.goals.${code}`, null, getInterfaceLanguage());

    html += `
      <button class="option" type="button" data-value="${code}">
        <div class="option-left">
          <span class="option-emoji">${emoji}</span>
          <div class="option-text">
            <span class="option-title">${label}</span>
          </div>
        </div>
        <span class="option-check">
          <span class="icon" data-icon="check"></span>
        </span>
      </button>
    `;
  }

  html += "</div>";
  return html;
}

/* =========================================================
   HELPERS
   ========================================================= */

function getCurrentValue(step) {
  const { profile } = getState();
  if (!profile) return null;

  switch (step) {
    case "interface_language":
      return profile.interface_language || null;
    case "native_language":
      return profile.native_language || null;
    case "learning_language":
      return profile.learning_language || null;
    case "level":
      return profile.level || null;
    case "goal":
      return profile.goal || null;
    default:
      return null;
  }
}

function getInterfaceLanguage() {
  return (
    getState().profile?.interface_language ||
    detectInterfaceLanguage()
  );
}

function detectInterfaceLanguage() {
  const fromTg = telegram.user?.language_code;
  const supported = getSupportedLanguages();

  if (fromTg && supported.includes(fromTg)) return fromTg;
  return "en";
}

/* =========================================================
   DOM SWAP
   ========================================================= */

function replaceScreen(newNode) {
  const screenEl = document.getElementById("screen");
  if (!screenEl) return;
  screenEl.innerHTML = "";
  screenEl.appendChild(newNode);
  hydrateIcons(screenEl);
}
