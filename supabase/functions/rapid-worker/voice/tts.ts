import { OPENROUTER_API_KEY } from "../config.ts";


// =====================================================
// CLEAN TEXT FOR TTS
// =====================================================

function cleanTextForSpeech(
  text: string,
) {
  let cleaned = text;


  // ---------------------------------------------------
  // MARKDOWN LINKS
  // [text](https://example.com)
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /\[([^\]]+)\]\([^)]+\)/g,
    "$1",
  );


  // ---------------------------------------------------
  // INLINE CODE
  // `text`
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /`([^`]+)`/g,
    "$1",
  );


  // ---------------------------------------------------
  // CODE BLOCKS
  // ```text```
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /```[\s\S]*?```/g,
    (match) =>
      match
        .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
        .replace(/```$/, ""),
  );


  // ---------------------------------------------------
  // BOLD / ITALIC / STRIKETHROUGH
  // **text**
  // *text*
  // __text__
  // _text_
  // ~~text~~
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /(\*\*|__|\*|_|~~)/g,
    "",
  );


  // ---------------------------------------------------
  // MARKDOWN HEADINGS
  // # Heading
  // ## Heading
  // ### Heading
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /^\s{0,3}#{1,6}\s+/gm,
    "",
  );


  // ---------------------------------------------------
  // MARKDOWN BULLETS
  // - item
  // * item
  // + item
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /^\s*[-*+]\s+/gm,
    "",
  );


  // ---------------------------------------------------
  // MARKDOWN QUOTES
  // > text
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /^\s*>\s?/gm,
    "",
  );


  // ---------------------------------------------------
  // MARKDOWN HORIZONTAL RULE
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /^\s*([-*_]){3,}\s*$/gm,
    "",
  );


  // ---------------------------------------------------
  // EMOJIS
  // Includes:
  // - faces
  // - gestures
  // - symbols
  // - flags
  // - pictographs
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /[\u{1F1E6}-\u{1F1FF}]/gu,
    "",
  );

  cleaned = cleaned.replace(
    /[\u{1F300}-\u{1FAFF}]/gu,
    "",
  );

  cleaned = cleaned.replace(
    /[\u{2600}-\u{27BF}]/gu,
    "",
  );


  // ---------------------------------------------------
  // EMOJI VARIATION SELECTORS
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /[\u{FE0E}\u{FE0F}]/gu,
    "",
  );


  // ---------------------------------------------------
  // ZERO WIDTH JOINER
  // Used to combine emojis.
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /\u200D/g,
    "",
  );


  // ---------------------------------------------------
  // MULTIPLE SPACES
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /[ \t]{2,}/g,
    " ",
  );


  // ---------------------------------------------------
  // TOO MANY EMPTY LINES
  // ---------------------------------------------------

  cleaned = cleaned.replace(
    /\n{3,}/g,
    "\n\n",
  );


  // ---------------------------------------------------
  // TRIM
  // ---------------------------------------------------

  cleaned = cleaned.trim();


  return cleaned;
}


// =====================================================
// TEXT → SPEECH
// =====================================================

export async function generateSpeech(
  text: string,
  interfaceLanguage: string,
) {

  const speechText =
    cleanTextForSpeech(text);


  if (!speechText) {
    console.log(
      "TTS skipped: no speakable text",
    );

    return null;
  }


  console.log(
    "TTS ORIGINAL:",
    text,
  );

  console.log(
    "TTS CLEANED:",
    speechText,
  );


  try {

    const response = await fetch(
      "https://openrouter.ai/api/v1/audio/speech",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${OPENROUTER_API_KEY}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          model:
            "x-ai/grok-voice-tts-1.0",

          voice:
            "eve",

          input:
            speechText,

          response_format:
            "mp3",
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
