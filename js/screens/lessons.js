/* LESSONS — new symmetric card grid */
import telegram from "../telegram.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { t } from "../i18n.js";
import { navigate, showToast, showLoader, hideLoader } from "../app.js";
import { hydrateIcons } from "../icons.js";

const TOPICS=[
  {code:"work",emoji:"💼"},
  {code:"food",emoji:"🍽"},
  {code:"travel",emoji:"✈️"},
  {code:"family",emoji:"👨‍👩‍👧"},
  {code:"hobby",emoji:"🎨"},
  {code:"shopping",emoji:"🛍"}
];

export function renderLessons(){
  const {profile,currentLesson}=getState();
  const lang=profile?.interface_language||"en";
  const wrapper=document.createElement("div");
  wrapper.className="lessons";
  wrapper.innerHTML=`
    <div class="lessons-scroll">
      ${currentLesson?renderActiveLesson(currentLesson,lang):renderLessonIntro(lang)}
      <div class="lessons-section-title">${t("lessons.choose_topic",null,lang)}</div>
      <div class="lessons-list">${TOPICS.map((topic)=>renderTopicItem(topic,lang)).join("")}</div>
    </div>`;
  hydrateIcons(wrapper);
  const active=wrapper.querySelector("[data-resume-lesson]");
  if(active) active.addEventListener("click",()=>{telegram.haptic.impact("light");navigate("chat");});
  wrapper.querySelectorAll("[data-topic]").forEach((el)=>el.addEventListener("click",()=>startLesson(el.getAttribute("data-topic"))));
  return wrapper;
}
function renderLessonIntro(lang){
  return `
    <section class="lessons-intro">
      <span class="lessons-intro-icon"><span class="icon" data-icon="book"></span></span>
      <span class="lessons-intro-copy">
        <span class="lessons-intro-kicker">${t("lessons.title",null,lang)}</span>
        <span class="lessons-intro-title">${t("lessons.choose_topic",null,lang)}</span>
      </span>
    </section>`;
}
function renderActiveLesson(lesson,lang){
  const topicLabel=t(`lessons.topics.${lesson.topic}`,null,lang);
  const stepLabel=t(`lessons.steps.${lesson.current_step}`,null,lang);
  return `
    <div class="lessons-section-title">${t("lessons.progress_label",null,lang)}</div>
    <button class="lessons-item is-active" type="button" data-resume-lesson>
      <span class="lessons-item-emoji">📖</span>
      <span class="lessons-item-body">
        <span class="lessons-item-title">${escapeHtml(topicLabel)}</span>
        <span class="lessons-item-subtitle">${escapeHtml(lesson.current_word||"")} · ${escapeHtml(stepLabel)}</span>
      </span>
      <span class="lessons-item-status"><span class="icon" data-icon="play"></span></span>
    </button>
    <div class="lessons-start"><div class="lessons-section-title">${t("lessons.start_new",null,lang)}</div></div>`;
}
function renderTopicItem(topic,lang){
  const label=t(`lessons.topics.${topic.code}`,null,lang);
  return `
    <button class="lessons-item" type="button" data-topic="${topic.code}">
      <span class="lessons-item-emoji">${topic.emoji}</span>
      <span class="lessons-item-body"><span class="lessons-item-title">${escapeHtml(label)}</span></span>
      <span class="lessons-item-status"><span class="icon" data-icon="play"></span></span>
    </button>`;
}
async function startLesson(topic){
  const lang=getState().profile?.interface_language||"en";
  showLoader();
  try{
    const result=await api.startLesson(topic);
    if(!result?.lesson) throw new Error("No lesson returned");
    setState({currentLesson:result.lesson});
    telegram.haptic.notification("success");
    hideLoader();
    showToast(`${t("lessons.steps.new_item",null,lang)}: ${result.lesson.current_word||""}`,"success");
    navigate("lessons");
  }catch(error){
    console.error("startLesson error:",error);
    hideLoader();
    showToast(t("errors.network",null,lang),"error");
  }
}
function escapeHtml(str){return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
