import { callOpenRouter } from "./openrouter.ts";

export async function translateTutorAnswer(text: string, fromLanguage: string, toLanguage: string) {
  if (!text) return "";
  if (fromLanguage === toLanguage) return text;
  return await callOpenRouter(
    [
      { role: "system", content: `Translate the tutor answer faithfully into ${toLanguage}. Return ONLY the translation. Preserve meaning, tone and question marks. Do not explain. Do not add quotation marks.` },
      { role: "user", content: text },
    ],
    180,
    0,
    "AI Tutor Translation",
  );
}
