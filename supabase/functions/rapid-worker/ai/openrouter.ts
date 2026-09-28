import { OPENROUTER_API_KEY } from "../config.ts";

export async function callOpenRouter(
  messages: Array<{
    role: string;
    content: string;
  }>,
  maxTokens = 350,
  temperature = 0.7,
  title = "AI Tutor",
) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          "https://ai-tutor-chi-sand.vercel.app/",
        "X-Title": title,
      },

      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();

    console.error(
      "OpenRouter error:",
      response.status,
      errorText,
    );

    return null;
  }

  const data = await response.json();

  const answer =
    data?.choices?.[0]?.message?.content || null;

  console.log("OPENROUTER RESPONSE:", answer);

  return answer;
}
