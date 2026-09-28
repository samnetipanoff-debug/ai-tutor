import { OPENROUTER_API_KEY } from "../config.ts";

export async function generateSpeech(
  text: string,
  interfaceLanguage: string,
) {
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/audio/speech",
      {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          model: "x-ai/grok-voice-tts-1.0",
          voice: "eve",
          input: text,
          response_format: "mp3",
        }),
      },
    );

    if (!response.ok) {
      console.error(
        "TTS error:",
        response.status,
        await response.text(),
      );

      return null;
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error(
      "Speech generation failed:",
      error,
    );

    return null;
  }
}
