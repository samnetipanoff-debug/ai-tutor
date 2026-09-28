import { OPENROUTER_API_KEY } from "../config.ts";

export async function analyzeStudentMessage(
  message: string,
  profile: any,
) {
  const interfaceLanguage =
    profile?.interface_language || "ru";

  const learningLanguage =
    profile?.learning_language || "en";

  const prompt = `
You are a language-learning mistake analyzer.

Analyze ONLY the student's latest message.

INTERFACE LANGUAGE:
${interfaceLanguage}

LEARNING LANGUAGE:
${learningLanguage}

RULES:

- Analyze only meaningful mistakes in the learning language.
- Do not invent mistakes.
- Do not correct punctuation.
- Do not correct capitalization.
- Do not correct harmless typos.
- Do not correct acceptable informal language.
- Do not correct stylistic preferences.
- Preserve the student's intended meaning.
- If the message is entirely in the interface language and is not an attempt to use the learning language, return no mistake.
- If the message contains multiple languages, analyze only the part that is clearly an attempt to use the learning language.
- The corrected version MUST be in the learning language.
- The explanation MUST be in the interface language.
- Do not provide explanations in the learning language.
- Do not provide a correction if the student's sentence is already acceptable.

Return ONLY valid JSON.

If there is no meaningful mistake:

{"has_mistake":false}

If there is a meaningful mistake:

{
  "has_mistake": true,
  "original_text": "exact relevant student text",
  "corrected_text": "corrected version",
  "explanation": "short explanation in the interface language"
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
          "HTTP-Referer":
            "https://ai-tutor-chi-sand.vercel.app/",
          "X-Title": "AI Tutor Mistake Analyzer",
        },

        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 180,
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

      return {
        has_mistake: false,
      };
    }

    const data = await response.json();

    let content =
      data?.choices?.[0]?.message?.content || "";

    content = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const result = JSON.parse(content);

    if (!result || result.has_mistake !== true) {
      return {
        has_mistake: false,
      };
    }

    return {
      has_mistake: true,
      original_text: result.original_text || message,
      corrected_text: result.corrected_text || "",
      explanation: result.explanation || "",
    };
  } catch (error) {
    console.error(
      "Mistake analyzer failed:",
      error,
    );

    return {
      has_mistake: false,
    };
  }
}
