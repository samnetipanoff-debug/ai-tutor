import { OPENROUTER_API_KEY } from "../config.ts";

export async function transcribeAudio(
  audioFile: File,
  learningLanguage: string,
) {
  const formData = new FormData();

  formData.append(
    "file",
    audioFile,
  );

  formData.append(
    "model",
    "openai/whisper-1",
  );

  // Язык берём из профиля пользователя.
  // Например: en, sr, de, fr, es, ru.
  formData.append(
    "language",
    learningLanguage,
  );

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/audio/transcriptions",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${OPENROUTER_API_KEY}`,
        },

        body: formData,
      },
    );

    if (!response.ok) {
      console.error(
        "Whisper error:",
        response.status,
        await response.text(),
      );

      return null;
    }

    const data =
      await response.json();

    return data?.text || null;

  } catch (error) {

    console.error(
      "Transcription failed:",
      error,
    );

    return null;
  }
}
