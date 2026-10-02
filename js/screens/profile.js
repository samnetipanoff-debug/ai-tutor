/* =========================================================
   PROFILE SCREEN
   ========================================================= */

import telegram from "../telegram.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { t, getSupportedLanguages } from "../i18n.js";
import { navigate, showToast, setHeaderStatus, clearHeaderStatus } from "../app.js";
import { hydrateIcons } from "../icons.js";

/* =========================================================
   OPTIONS
   ========================================================= */

const LANGUAGE_EMOJIS = {
  ru: "🇷🇺",
  en: "🇬🇧",
  de: "🇩🇪",
  sr: "🇷🇸",
  es: "🇪🇸",
  fr: "🇫🇷",
};

const LEVELS = ["a1", "a2", "b1", "b2", "c1"];
const GOALS = ["conversation", "work", "travel", "study", "culture"];

export function renderProfile() {
  const { user, profile } = getState();
  const lang = profile?.interface_language || "en";

  const name =
    user?.first_name ||
    user?.username ||
    "User";

  const wrapper = document.createElement("div");
  wrapper.className = "profile";

  wrapper.innerHTML = `
    <div class="profile-scroll">
      <div class="profile-header">
        <div class="profile-avatar">👩🏻‍🏫</div>
        <div class="profile-username">${escapeHtml(name)}</div>
        <div class="profile-subtitle">${escapeHtml(user?.username ? "@" + user.username : "")}</div>
      </div>

      <div class="profile-section">
        ${renderRow("interface_language", "settings", t("profile.interface_language", null, lang), labelForLanguage(profile?.interface_language, lang))}
        ${renderRow("native_language", "user", t("profile.native_language", null, lang), labelForLanguage(profile?.native_language, lang))}
        ${renderRow("learning_language", "book", t("profile.learning_language", null, lang), labelForLanguage(profile?.learning_language, lang))}
      </div>

      <div class="profile-section">
        ${renderRow("level", "chart", t("profile.level", null, lang), labelForLevel(profile?.level, lang))}
        ${renderRow("goal", "trophy", t("profile.goal", null, lang), labelForGoal(profile?.goal, lang))}
      </div>
        ${renderRow(
          "level",
          "chart",
          t("profile.level", null, lang),
          labelForLevel(profile?.level, lang),
        )}

        <div class="profile-section-title" style="margin-top: var(--sp-4);">
          ${t("profile.goal", null, lang)}
        </div>
        ${renderRow(
          "goal",
          "trophy",
          t("profile.goal", null, lang),
          labelForGoal(profile?.goal, lang),
        )}
      </div>
    </div>

    <div class="profile-footer">
      <button class="btn btn-secondary btn-block" id="profileReset" type="button">
        ${t("common.close", null, lang)}
      </button>
    </div>
  `;

  hydrateIcons(wrapper);

  // Роутинг на sheet-выбор
  wrapper.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("click", () => {
      telegram.haptic.selection();
      const field = el.getAttribute("data-field");
      openSheet(field, wrapper);
    });
  });

  // Кнопка "Закрыть" — в меню
  wrapper.querySelector("#profileReset").addEventListener("click", () => {
    telegram.haptic.impact("light");
    navigate("menu");
  });

  return wrapper;
}

/* =========================================================
   ROW RENDER
   ========================================================= */

function renderRow(field, icon, label, value) {
  return `
    <button class="profile-row" type="button" data-field="${field}">
      <span class="profile-row-icon icon" data-icon="${icon}"></span>
      <div class="profile-row-copy">
        <div class="profile-row-label">${escapeHtml(label)}</div>
        <div class="profile-row-value">${escapeHtml(value)}</div>
      </div>
      <span class="profile-row-arrow icon" data-icon="arrowRight"></span>
    </button>
  `;
}

/* =========================================================
   SHEET (bottom modal для выбора)
   ========================================================= */

function openSheet(field, parentWrapper) {
  const { profile } = getState();
  const lang = profile?.interface_language || "en";

  let title = "";
  let options = [];

  switch (field) {
    case "interface_language":
      title = t("profile.interface_language", null, lang);
      options = getSupportedLanguages().map((code) => ({
        value: code,
        emoji: LANGUAGE_EMOJIS[code] || "🌐",
        label: t(`languages.${code}`, null, lang),
      }));
      break;

    case "native_language":
      title = t("profile.native_language", null, lang);
      options = getSupportedLanguages().map((code) => ({
        value: code,
        emoji: LANGUAGE_EMOJIS[code] || "🌐",
        label: t(`languages.${code}`, null, lang),
      }));
      break;

    case "learning_language":
      title = t("profile.learning_language", null, lang);
      options = getSupportedLanguages().map((code) => ({
        value: code,
        emoji: LANGUAGE_EMOJIS[code] || "🌐",
        label: t(`languages.${code}`, null, lang),
      }));
      break;

    case "level":
      title = t("profile.level", null, lang);
      options = LEVELS.map((code) => ({
        value: code,
        emoji: "•",
        label: t(`onboarding.levels.${code}`, null, lang),
      }));
      break;

    case "goal":
      title = t("profile.goal", null, lang);
      options = GOALS.map((code) => ({
        value: code,
        emoji: "•",
        label: t(`onboarding.goals.${code}`, null, lang),
      }));
      break;

    default:
      return;
  }

  // Backdrop
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const current = profile?.[field];

  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">${escapeHtml(title)}</div>
      <div class="sheet-options">
        ${options
          .map(
            (opt) => `
              <button class="option ${opt.value === current ? "is-selected" : ""}" data-value="${opt.value}" type="button">
                <div class="option-left">
                  <span class="option-emoji">${opt.emoji}</span>
                  <div class="option-text">
                    <span class="option-title">${escapeHtml(opt.label)}</span>
                  </div>
                </div>
                <span class="option-check">
                  <span class="icon" data-icon="check"></span>
                </span>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  hydrateIcons(backdrop);

  // Animation
  requestAnimationFrame(() => {
    backdrop.classList.add("is-visible");
  });

  // Close on backdrop click
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeSheet(backdrop);
  });

  // Select option
  backdrop.querySelectorAll(".option").forEach((el) => {
    el.addEventListener("click", async () => {
      const value = el.getAttribute("data-value");
      closeSheet(backdrop);
      await saveField(field, value);
    });
  });
}

function closeSheet(backdrop) {
  backdrop.classList.remove("is-visible");
  setTimeout(() => {
    backdrop.remove();
  }, 250);
}

/* =========================================================
   SAVE FIELD
   ========================================================= */

async function saveField(field, value) {
  const lang = getState().profile?.interface_language || "en";

  setHeaderStatus("common.loading");

  try {
    const result = await api.updateProfile({ [field]: value });

    if (!result?.profile) {
      throw new Error("Invalid response");
    }

    setState({ profile: result.profile });
    clearHeaderStatus();

    telegram.haptic.notification("success");
    showToast(t("profile.save_success", null, lang), "success");

    // Перерисовываем экран
    navigate("profile");
  } catch (error) {
    console.error("saveField error:", error);
    clearHeaderStatus();
    showToast(t("errors.network", null, lang), "error");
  }
}

/* =========================================================
   LABELS
   ========================================================= */

function labelForLanguage(code, lang) {
  if (!code) return "—";
  return t(`languages.${code}`, null, lang);
}

function labelForLevel(code, lang) {
  if (!code) return "—";
  return t(`onboarding.levels.${code.toLowerCase()}`, null, lang);
}

function labelForGoal(code, lang) {
  if (!code) return "—";
  return t(`onboarding.goals.${code}`, null, lang);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
