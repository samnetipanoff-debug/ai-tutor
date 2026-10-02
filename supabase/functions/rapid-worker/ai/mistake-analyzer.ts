import { OPENROUTER_API_KEY } from "../config.ts";

export async function analyzeStudentMessage(
  message: string,
  profile: any,
) {
  const interfaceLanguage = profile?.interface_language || "ru";
  const learningLanguage = profile?.learning_language || "en";

  const prompt = `
You are the semantic language-learning analyzer for an AI tutor.

INTERFACE LANGUAGE:
${interfaceLanguage}

LEARNING LANGUAGE:
${learningLanguage}

Analyze the student's ENTIRE latest message as one attempt to communicate one meaning.

The student may mix the learning language with the interface language because they do not know how to say part of the thought in the learning language.

IMPORTANT:
- First reconstruct the student's intended meaning from the whole message.
- Do not analyze only the learning-language fragments.
- If the student uses an interface-language fragment inside an otherwise meaningful learning-language sentence and its meaning is clear, treat it as "unknown_expression": the student knows what they want to say but does not know how to say that part in the learning language.
- When the intended meaning is clear, corrected_text MUST be a COMPLETE natural sentence in the learning language that expresses the student's whole intended meaning, not just a corrected fragment.
- Preserve the student's intended meaning. Do not add facts or intentions that are not reasonably supported by the message.
- Do not correct punctuation, capitalization, harmless typos, acceptable informal language, or stylistic preferences.
- If the entire message is in the interface language and is clearly not an attempt to practice the learning language, return "normal".
- If the intended meaning cannot be reconstructed with reasonable confidence, return "ambiguous" and ask ONE concise clarification question in the interface language.
- Never invent what an unclear phrase means.
- The clarification question must help distinguish the plausible meanings.
- If the sentence is acceptable in the learning language, return "normal".

Return ONLY valid JSON.

Normal:
{
  "status": "normal",
  "has_mistake": false
}

Meaning is clear but there is a meaningful grammar/wording problem or a missing learning-language expression:
{
  "status": "mistake",
  "has_mistake": true,
  "original_text": "relevant student message",
  "corrected_text": "complete corrected sentence in the learning language",
  "explanation": "short explanation in the interface language"
}

Meaning is clear and the student used another language for part of the thought:
{
  "status": "unknown_expression",
  "has_mistake": true,
  "original_text": "relevant student message",
  "corrected_text": "complete natural sentence in the learning language",
  "explanation": "short explanation in the interface language"
}

Meaning is genuinely unclear:
{
  "status": "ambiguous",
  "has_mistake": false,
  "clarification_question": "one concise question in the interface language"
}

Student message:
${message}
`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai-tutor-chi-sand.vercel.app/",
          "X-Title": "AI Tutor Mistake Analyzer",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 260,
          temperature: 0,
        }),
      },
    );

    if (!response.ok) {
      console.error(
        "Mistake analyzer error:",
        response.status,
        await response.text(),
      );
      return { status: "normal", has_mistake: false };
    }

    let content = (await response.json())?.choices?.[0]?.message?.content || "";
    content = content
      .replace(/^\`\`\`json\s*/i, "")
      .replace(/^\`\`\`\s*/i, "")
      .replace(/\s*\`\`\`$/i, "")
      .trim();

    const result = JSON.parse(content);

    if (result?.status === "ambiguous") {
      return {
        status: "ambiguous",
        has_mistake: false,
        clarification_question: result.clarification_question || "",
      };
    }

    if (
      (result?.status === "mistake" || result?.status === "unknown_expression") &&
      result?.corrected_text
    ) {
      return {
        status: result.status,
        has_mistake: true,
        original_text: result.original_text || message,
        corrected_text: result.corrected_text,
        explanation: result.explanation || "",
      };
    }

    return {
      status: "normal",
      has_mistake: false,
    };
  } catch (error) {
    console.error("Mistake analyzer failed:", error);
    return {
      status: "normal",
      has_mistake: false,
    };
  }
}
