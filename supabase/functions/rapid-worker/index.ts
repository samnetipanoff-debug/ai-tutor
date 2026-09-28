import {
  CORS_HEADERS,
} from "./config.ts";

import {
  verifyTelegramWebAppData,
} from "./auth/telegram.ts";

import {
  getUserProfile,
} from "./db/users.ts";

import {
  getOrCreateConversation,
} from "./db/conversations.ts";

import {
  saveMessage,
  getChatHistory,
} from "./db/messages.ts";

import { 
  updateProgress 
} from "./db/progress.ts";

import {
  askOpenRouter,
} from "./ai/tutor.ts";

import {
  analyzeStudentMessage,
} from "./ai/mistake-analyzer.ts";

import {
  transcribeAudio,
} from "./voice/whisper.ts";

import {
  generateSpeech,
} from "./voice/tts.ts";

import {
  jsonResponse,
} from "./utils/json.ts";


// =====================================================
// BUILD CORRECTION
// =====================================================

function buildCorrection(
  mistake: any,
  interfaceLanguage: string,
) {
  const labels: Record<string, string> = {
    ru: "Небольшая поправка",
    en: "Small correction",
    sr: "Mala ispravka",
    es: "Pequeña corrección",
    de: "Kleine Korrektur",
    fr: "Petite correction",
  };

  const label =
    labels[interfaceLanguage] ||
    labels.en;

  return `${label}:\n“${mistake.corrected_text}”\n\n${mistake.explanation}`;
}


// =====================================================
// ARRAY BUFFER → BASE64
// =====================================================

function arrayBufferToBase64(
  buffer: ArrayBuffer,
) {
  const bytes =
    new Uint8Array(buffer);

  let binary = "";

  const chunkSize = 8192;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    const chunk =
      bytes.subarray(
        i,
        i + chunkSize,
      );

    binary +=
      String.fromCharCode(
        ...chunk,
      );
  }

  return btoa(binary);
}


// =====================================================
// MAIN
// =====================================================

Deno.serve(
  async (req) => {

    // =================================================
    // CORS
    // =================================================

    if (
      req.method === "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers: CORS_HEADERS,
        },
      );
    }


    // =================================================
    // HEALTH CHECK
    // =================================================

    if (
      req.method !== "POST"
    ) {
      return jsonResponse({
        ok: true,
        message:
          "AI Tutor backend is running",
      });
    }


    try {

      const contentType =
        req.headers.get(
          "content-type",
        ) || "";


      // =================================================
      // AUDIO → WHISPER
      // =================================================

      if (
        contentType.includes(
          "multipart/form-data",
        )
      ) {

        const formData =
          await req.formData();

        const initData =
          formData.get(
            "initData",
          );

        const audio =
          formData.get(
            "audio",
          );


        // -----------------------------------------------
        // TELEGRAM AUTH
        // -----------------------------------------------

        const telegramUser =
          await verifyTelegramWebAppData(
            String(
              initData || "",
            ),
          );


        if (!telegramUser) {
          return jsonResponse(
            {
              ok: false,
              error:
                "Invalid Telegram initData",
            },
            401,
          );
        }


        // -----------------------------------------------
        // AUDIO CHECK
        // -----------------------------------------------

        if (
          !audio ||
          !(audio instanceof File)
        ) {
          return jsonResponse(
            {
              ok: false,
              error:
                "Audio file is missing",
            },
            400,
          );
        }


        console.log(
          "AUDIO RECEIVED:",
          audio.name,
          audio.type,
          audio.size,
        );


        // -----------------------------------------------
        // WHISPER
        // -----------------------------------------------

        const transcription =
          await transcribeAudio(
            audio,
          );


        if (!transcription) {
          return jsonResponse(
            {
              ok: false,
              error:
                "Speech recognition failed",
            },
            500,
          );
        }


        console.log(
          "TRANSCRIPTION:",
          transcription,
        );


        return jsonResponse({
          ok: true,
          text:
            transcription,
        });
      }


      // =================================================
      // JSON REQUEST
      // =================================================

      const body =
        await req.json();


      const initData =
        body?.initData;

      const message =
        typeof body?.message === "string"
          ? body.message.trim()
          : "";

      const loadHistory =
        body?.load_history;

      const textToSpeech =
        body?.tts;

      const ttsText =
        body?.text;

      const isVoiceMessage =
        body?.voice === true;


      // =================================================
      // TELEGRAM AUTH
      // =================================================

      const telegramUser =
        await verifyTelegramWebAppData(
          initData,
        );


      if (!telegramUser) {
        return jsonResponse(
          {
            ok: false,
            error:
              "Invalid Telegram initData",
          },
          401,
        );
      }


      // =================================================
      // PROFILE
      // =================================================

      const profile =
        await getUserProfile(
          telegramUser.id,
        );


      // =================================================
      // TTS
      // =================================================

      if (
        textToSpeech === true &&
        ttsText
      ) {

        const speechAudio =
          await generateSpeech(
            ttsText,
            profile?.interface_language ||
              "en",
          );


        if (!speechAudio) {
          return jsonResponse(
            {
              ok: false,
              error:
                "TTS generation failed",
            },
            500,
          );
        }


        return jsonResponse({
          ok: true,

          audio:
            arrayBufferToBase64(
              speechAudio,
            ),

          format: "mp3",
        });
      }


      // =================================================
      // PROFILE / HISTORY
      // =================================================

      if (!message) {

        if (loadHistory) {

          const conversation =
            await getOrCreateConversation(
              telegramUser.id,
            );


          if (!conversation) {
            return jsonResponse(
              {
                ok: false,
                error:
                  "Conversation not found",
              },
              500,
            );
          }


          const history =
            await getChatHistory(
              telegramUser.id,
              conversation.id,
            );


          return jsonResponse({
            ok: true,

            user:
              telegramUser,

            profile:
              profile,

            conversation_id:
              conversation.id,

            history:
              history,
          });
        }


        return jsonResponse({
          ok: true,

          user:
            telegramUser,

          profile:
            profile,
        });
      }


      // =================================================
      // CONVERSATION
      // =================================================

      const conversation =
        await getOrCreateConversation(
          telegramUser.id,
        );


      if (!conversation) {
        return jsonResponse(
          {
            ok: false,
            error:
              "Conversation creation failed",
          },
          500,
        );
      }


      const conversationId =
        conversation.id;


      // =================================================
      // SAVE USER MESSAGE
      // =================================================

      const savedUserMessage =
        await saveMessage(
          telegramUser.id,
          conversationId,
          "user",
          message,
        );


      if (!savedUserMessage) {
        return jsonResponse(
          {
            ok: false,
            error:
              "Failed to save user message",
          },
          500,
        );
      }


      // =================================================
      // HISTORY
      // =================================================

      const history =
        await getChatHistory(
          telegramUser.id,
          conversationId,
        );


      // =================================================
      // AI RESPONSE
      // =================================================

      const answer =
        await askOpenRouter(
          profile,
          history,
          isVoiceMessage,
        );


      if (!answer) {
        return jsonResponse(
          {
            ok: false,
            error:
              "AI response failed",
          },
          500,
        );
      }


      // =================================================
      // ERROR ANALYSIS
      // =================================================

      const mistake =
        await analyzeStudentMessage(
          message,
          profile,
        );


      // =================================================
      // FINAL ANSWER
      // =================================================

      let finalAnswer =
        answer;


      if (
        mistake?.has_mistake === true
      ) {

        const correction =
          buildCorrection(
            mistake,
            profile?.interface_language ||
              "en",
          );


        finalAnswer =
          `${correction}\n\n${answer}`;


        console.log(
          "STUDENT MISTAKE:",
          mistake,
        );
      }


      // =================================================
      // SAVE AI MESSAGE
      // =================================================

      await saveMessage(
        telegramUser.id,
        conversationId,
        "assistant",
        finalAnswer,
      );


      // =================================================
      // RESPONSE
      // =================================================

      return jsonResponse({
        ok: true,

        user:
          telegramUser,

        profile:
          profile,

        conversation_id:
          conversationId,

        answer:
          finalAnswer,
      });


    } catch (error) {

      console.error(
        "BACKEND ERROR:",
        error,
      );


      return jsonResponse(
        {
          ok: false,
          error:
            "Invalid request",
        },
        400,
      );
    }
  },
);

