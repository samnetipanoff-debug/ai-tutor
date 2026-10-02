/* HOME — rebuilt component structure */
import telegram from "../telegram.js";
import { getState } from "../state.js";
import { t } from "../i18n.js";
import { navigate } from "../app.js";
import { hydrateIcons } from "../icons.js";

export function renderMenu() {
  const { user, profile } = getState();
  const lang = profile?.interface_language || "en";
  const name = user?.first_name || user?.username || "👋";

  const wrapper = document.createElement("div");
  wrapper.className = "menu";
  wrapper.innerHTML = `
    <div class="menu-scroll">
      <section class="menu-intro">
        <div class="menu-eyebrow">AI TUTOR</div>
        <h1 class="menu-greeting-name">${escapeHtml(name)}</h1>
        <p class="menu-greeting-sub">${t("menu.title", null, lang)}</p>
      </section>

      <button class="menu-hero" type="button" data-target="chat">
        <div class="menu-hero-orb"><span class="icon" data-icon="chat"></span></div>
        <div class="menu-hero-copy">
          <div class="menu-hero-kicker">${t("menu.chat_title", null, lang)}</div>
          <div class="menu-hero-title">${t("menu.chat_subtitle", null, lang)}</div>
        </div>
        <span class="menu-hero-action icon" data-icon="arrowRight" aria-hidden="true"></span>
      </button>

      <div class="menu-section-label">${t("lessons.title", null, lang)}</div>
      <section class="menu-actions">
        ${renderAction("lessons","book","menu.lessons_title","menu.lessons_subtitle",lang)}
        ${renderAction("progress","chart","menu.progress_title","menu.progress_subtitle",lang)}
        ${renderAction("profile","user","menu.profile_title","menu.profile_subtitle",lang)}
      </section>

      <div class="menu-hint">
        <span class="menu-hint-icon icon" data-icon="sparkles"></span>
        <div class="menu-hint-text">${t("onboarding.step_done_subtitle", null, lang)}</div>
      </div>
    </div>
  `;

  hydrateIcons(wrapper);

  wrapper.querySelectorAll("[data-target]").forEach((el) => {
    el.addEventListener("click", () => {
      telegram.haptic.impact("light");
      navigate(el.getAttribute("data-target"));
    });
  });

  return wrapper;
}

function renderAction(target, icon, titleKey, subtitleKey, lang) {
  return `
    <button class="menu-action" type="button" data-target="${target}">
      <span class="menu-action-icon"><span class="icon" data-icon="${icon}"></span></span>
      <span class="menu-action-copy">
        <span class="menu-action-title">${t(titleKey, null, lang)}</span>
        <span class="menu-action-subtitle">${t(subtitleKey, null, lang)}</span>
      </span>
    </button>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
