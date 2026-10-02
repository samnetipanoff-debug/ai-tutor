/* PROFILE SCREEN */
import telegram from "../telegram.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { t, getSupportedLanguages } from "../i18n.js";
import { navigate, showToast, setHeaderStatus, clearHeaderStatus } from "../app.js";
import { hydrateIcons } from "../icons.js";

const LANGUAGE_EMOJIS = { ru:"🇷🇺", en:"🇬🇧", de:"🇩🇪", sr:"🇷🇸", es:"🇪🇸", fr:"🇫🇷" };
const LEVELS = ["a1","a2","b1","b2","c1"];
const GOALS = ["conversation","work","travel","study","culture"];

export function renderProfile() {
  const { user, profile } = getState();
  const lang = profile?.interface_language || "en";
  const name = user?.first_name || user?.username || "User";
  const wrapper = document.createElement("div");
  wrapper.className = "profile";

  wrapper.innerHTML = `
    <div class="profile-scroll">
      <section class="profile-identity">
        <div class="profile-avatar">👩🏻‍🏫</div>
        <div class="profile-name">${escapeHtml(name)}</div>
        <div class="profile-handle">${escapeHtml(user?.username ? "@" + user.username : "")}</div>
      </section>

      <div class="profile-group-label">${t("profile.interface_language", null, lang)}</div>
      <section class="profile-section">
        ${renderRow("interface_language","settings",t("profile.interface_language",null,lang),labelForLanguage(profile?.interface_language,lang))}
        ${renderRow("native_language","user",t("profile.native_language",null,lang),labelForLanguage(profile?.native_language,lang))}
        ${renderRow("learning_language","book",t("profile.learning_language",null,lang),labelForLanguage(profile?.learning_language,lang))}
      </section>

      <div class="profile-group-label">${t("profile.level", null, lang)}</div>
      <section class="profile-section">
        ${renderRow("level","chart",t("profile.level",null,lang),labelForLevel(profile?.level,lang))}
        ${renderRow("goal","trophy",t("profile.goal",null,lang),labelForGoal(profile?.goal,lang))}
      </section>
    </div>
  `;

  hydrateIcons(wrapper);
  wrapper.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("click", () => {
      telegram.haptic.selection();
      openSheet(el.getAttribute("data-field"));
    });
  });
  return wrapper;
}

function renderRow(field, icon, label, value) {
  return `
    <button class="profile-row" type="button" data-field="${field}">
      <span class="profile-row-icon"><span class="icon" data-icon="${icon}"></span></span>
      <span class="profile-row-copy">
        <span class="profile-row-label">${escapeHtml(label)}</span>
        <span class="profile-row-value">${escapeHtml(value)}</span>
      </span>
      <span class="profile-row-arrow icon" data-icon="arrowRight"></span>
    </button>
  `;
}

function openSheet(field) {
  const { profile } = getState();
  const lang = profile?.interface_language || "en";
  let title = "", options = [];

  if (field === "interface_language" || field === "native_language" || field === "learning_language") {
    title = t(`profile.${field}`, null, lang);
    options = getSupportedLanguages().map((code) => ({ value:code, emoji:LANGUAGE_EMOJIS[code]||"🌐", label:t(`languages.${code}`,null,lang) }));
  } else if (field === "level") {
    title = t("profile.level", null, lang);
    options = LEVELS.map((code) => ({ value:code, emoji:"•", label:t(`onboarding.levels.${code}`,null,lang) }));
  } else if (field === "goal") {
    title = t("profile.goal", null, lang);
    options = GOALS.map((code) => ({ value:code, emoji:"•", label:t(`onboarding.goals.${code}`,null,lang) }));
  } else return;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const current = profile?.[field];

  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">${escapeHtml(title)}</div>
      <div class="sheet-options">
        ${options.map((opt) => `
          <button class="option ${opt.value===current?"is-selected":""}" data-value="${opt.value}" type="button">
            <div class="option-left"><span class="option-emoji">${opt.emoji}</span><div class="option-text"><span class="option-title">${escapeHtml(opt.label)}</span></div></div>
            <span class="option-check"><span class="icon" data-icon="check"></span></span>
          </button>`).join("")}
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  hydrateIcons(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("is-visible"));
  backdrop.addEventListener("click",(e)=>{ if(e.target===backdrop) closeSheet(backdrop); });
  backdrop.querySelectorAll(".option").forEach((el)=>{
    el.addEventListener("click",async()=>{
      const value=el.getAttribute("data-value");
      closeSheet(backdrop);
      await saveField(field,value);
    });
  });
}

function closeSheet(backdrop) {
  backdrop.classList.remove("is-visible");
  setTimeout(()=>backdrop.remove(),250);
}

async function saveField(field,value) {
  const lang=getState().profile?.interface_language||"en";
  setHeaderStatus("common.loading");
  try {
    const result=await api.updateProfile({[field]:value});
    if(!result?.profile) throw new Error("Invalid response");
    setState({profile:result.profile});
    clearHeaderStatus();
    telegram.haptic.notification("success");
    showToast(t("profile.save_success",null,lang),"success");
    navigate("profile");
  } catch(error) {
    console.error("saveField error:",error);
    clearHeaderStatus();
    showToast(t("errors.network",null,lang),"error");
  }
}

function labelForLanguage(code,lang){ return code ? t(`languages.${code}`,null,lang) : "—"; }
function labelForLevel(code,lang){ return code ? t(`onboarding.levels.${String(code).toLowerCase()}`,null,lang) : "—"; }
function labelForGoal(code,lang){ return code ? t(`onboarding.goals.${code}`,null,lang) : "—"; }
function escapeHtml(str){ return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }