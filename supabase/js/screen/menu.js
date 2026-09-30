/* =========================================================
   MENU SCREEN
   ========================================================= */

import telegram from "../telegram.js";
import { getState } from "../state.js";
import { t } from "../i18n.js";
import { navigate } from "../app.js";
import { hydrateIcons } from "../icons.js";

export function renderMenu() {
  const { user, profile } = getState();

  const lang = profile?.interface_language || "en";
  const name =
    user?.first_name ||
    user?.username ||
    "👋";

  const wrapper = document.createElement("div");
  wrapper.className = "menu";

  wrapper.innerHTML = `
    <div class="menu-scroll">
      <div class="menu-greeting">
        <div class="menu-greeting-name">
          ${escapeHtml(name)}
        </div>
        <div class="menu-greeting-sub">
          ${t("menu.title", null, lang)}
        </div>
      </div>

      <div class="menu-cards">
        ${renderCard("chat", "chat", "menu.chat_title", "menu.chat_subtitle", lang)}
        ${renderCard("lessons", "book", "menu.lessons_title", "menu.lessons_subtitle", lang)}
        ${renderCard("progress", "chart", "menu.progress_title", "menu.progress_subtitle", lang)}
        ${renderCard("profile", "user", "menu.profile_title", "menu.profile_subtitle", lang)}
      </div>

      ${renderHint(lang)}
    </div>
  `;

  hydrateIcons(wrapper);

  // Навигация
  wrapper.querySelectorAll(".menu-card").forEach((el) => {
    el.addEventListener("click", () => {
      telegram.haptic.impact("light");
      const target = el.getAttribute("data-target");
      if (target) navigate(target);
    });
  });

  return wrapper;
}

/* =========================================================
   HELPERS
   ========================================================= */

function renderCard(target, icon, titleKey, subtitleKey, lang) {
  return `
    <button class="menu-card" type="button" data-target="${target}">
      <div class="menu-card-icon">
        <span class="icon" data-icon="${icon}"></span>
      </div>
      <div class="menu-card-body">
        <div class="menu-card-title">${t(titleKey, null, lang)}</div>
        <div class="menu-card-subtitle">${t(subtitleKey, null, lang)}</div>
      </div>
      <span class="menu-card-arrow icon" data-icon="arrowRight"></span>
    </button>
  `;
}

function renderHint(lang) {
  return `
    <div class="menu-hint">
      <span class="menu-hint-icon icon" data-icon="sparkles"></span>
      <div class="menu-hint-text">
        ${t("onboarding.step_done_subtitle", null, lang)}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
