import { CORS_HEADERS } from "./config.ts";

import { verifyTelegramWebAppData } from "./auth/telegram.ts";

import {
  getUserProfile,
  updateOnboardingStep,
  updateProfile,
} from "./db/users.ts";

import { getOrCreateConversation } from "./db/conversations.ts";

import {
  saveMessage,
  getChatHistory,
} from "./db/messages.ts";

import { updateProgress } from "./db/progress.ts";
import { getProgress } from "./db/progress-read.ts";

import { askOpenRouter } from "./ai/tutor.ts";
import { analyzeStudentMessage } from "./ai/mistake-analyzer.ts";

import { transcribeAudio } from "./voice/whisper.ts";
import { generateSpeech } from "./voice/tts.ts";

import { jsonResponse } from "./utils/json.ts";


Deno.serve(async (req) => {
  try {
    // --------------------------------------------------
    // CORS
    // --------------------------------------------------

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // --------------------------------------------------
    // Health check
    // --------------------------------------------------

    if (req.method !== "POST") {
      return jsonResponse(
        {
          ok: true,
          service: "rapid-worker",
        },
        200,
        CORS_HEADERS,
      );
    }

    // --------------------------------------------------
    // Multipart: voice upload
    // --------------------------------------------------

    const contentType =
      req.headers.get("content-type") || "";

    if (
      contentType.includes(
        "multipart/form-data",
      )
    ) {
      const formData = await req.formData();

      const initData =
        String(
          formData.get("initData") || "",
        );

      const audio =
        formData.get("audio");

      if (!initData) {
        return jsonResponse(
          {
            ok: false,
            error: "Missing initData",
          },
          400,
          CORS_HEADERS,
        );
      }

      // Telegram authentication
      const telegramUser =
        await verifyTelegramWebAppData(
          initData,
        );

      if (!telegramUser) {
        return jsonResponse(
          {
            ok: false,
            error: "Invalid Telegram initData",
          },
          401,
          CORS_HEADERS,
        );
      }

      const profile =
        await getUserProfile(
          telegramUser.id,
          telegramUser,
        );

      if (
        !profile?.learning_language
      ) {
        return jsonResponse(
          {
            ok: false,
            error:
              "Learning language is not configured",
          },
          400,
          CORS_HEADERS,
        );
      }

      if (!(audio instanceof File)) {
        return jsonResponse(
          {
            ok: false,
            error: "Audio file is missing",
          },
          400,
          CORS_HEADERS,
        );
      }

      const transcription =
        await transcribeAudio(
          audio,
          profile.learning_language,
        );

      if (!transcription) {
        return jsonResponse(
          { ok: false, error: "Speech could not be transcribed" },
          422,
          CORS_HEADERS,
        );
      }

      // Voice uses the same single conversation pipeline as text.
      const conversation =
        await getOrCreateConversation(telegramUser.id);

      await saveMessage(
        telegramUser.id,
        conversation.id,
        "user",
        transcription,
      );

      const history =
        await getChatHistory(telegramUser.id, conversation.id);

      const [answer, mistake] = await Promise.all([
        askOpenRouter(profile, history, true),
        analyzeStudentMessage(transcription, profile),
      ]);

      let finalAnswer = answer;

      if (mistake?.has_mistake) {
        const correction = mistake.explanation
          ? `${mistake.corrected_text}\n\n${mistake.explanation}`
          : mistake.corrected_text;
        finalAnswer = `${answer}\n\n${correction}`;
      }

      await saveMessage(
        telegramUser.id,
        conversation.id,
        "assistant",
        finalAnswer,
      );

      try {
        await updateProgress(
          String(telegramUser.id),
          profile?.level || null,
        );
      } catch (error) {
        console.error("Progress update failed:", error);
      }

      return jsonResponse(
        {
          ok: true,
          text: transcription,
          answer: finalAnswer,
        },
        200,
        CORS_HEADERS,
      );
    }

    // --------------------------------------------------
    // JSON body
    // --------------------------------------------------

    const body = await req.json();

    const {
      initData,
      message,
      load_history,
      tts,
      text,
      voice,
      progress,
      onboarding,
      profile_update,
    } = body;

    // --------------------------------------------------
    // Telegram authentication
    // --------------------------------------------------

    if (!initData) {
      return jsonResponse(
        {
          ok: false,
          error: "Missing initData",
        },
        400,
        CORS_HEADERS,
      );
    }

    const telegramUser =
      await verifyTelegramWebAppData(
        initData,
      );

    if (!telegramUser) {
      return jsonResponse(
        {
          ok: false,
          error: "Invalid Telegram initData",
        },
        401,
        CORS_HEADERS,
      );
    }

    // --------------------------------------------------
    // User profile
    // --------------------------------------------------

    const profile =
      await getUserProfile(
        telegramUser.id,
        telegramUser,
      );

    // --------------------------------------------------
    // Progress
    // --------------------------------------------------

    if (progress) {
      const result =
        await getProgress(
          String(telegramUser.id),
        );

      return jsonResponse(
        {
          ok: true,
          ...result,
        },
        200,
        CORS_HEADERS,
      );
    }

    // --------------------------------------------------
    // Onboarding
    // --------------------------------------------------

    if (onboarding) {
      const {
        step,
        value,
      } = onboarding;

      const updatedProfile =
        await updateOnboardingStep(
          telegramUser.id,
          step,
          value,
        );

      return jsonResponse(
        {
          ok: true,
          profile: updatedProfile,
        },
        200,
        CORS_HEADERS,
      );
    }

    // --------------------------------------------------
    // Profile update
    // --------------------------------------------------

    if (profile_update) {
      const updatedProfile =
        await updateProfile(
          telegramUser.id,
          profile_update,
        );

      return jsonResponse(
        {
          ok: true,
          profile: updatedProfile,
        },
        200,
        CORS_HEADERS,
      );
    }

    // --------------------------------------------------
    // TTS
    // --------------------------------------------------

    if (tts) {
      const ttsText =
        text ||
        body.text ||
        "";

      if (!ttsText) {
        return jsonResponse(
          {
            ok: false,
            error: "Missing text for TTS",
          },
          400,
          CORS_HEADERS,
        );
      }

      const audioBuffer =
        await generateSpeech(
          ttsText,
          profile?.interface_language ||
            "en",
        );

      const base64 =
        Uint8Array.from(
          new Uint8Array(audioBuffer),
        );

      let binary = "";

      for (
        let i = 0;
        i < base64.length;
        i++
      ) {
        binary += String.fromCharCode(
          base64[i],
        );
      }

      const encoded =
        btoa(binary);

      return jsonResponse(
        {
          ok: true,
          audio: encoded,
          mime_type: "audio/mpeg",
        },
        200,
        CORS_HEADERS,
      );
    }

    // --------------------------------------------------
    // Load chat history
    // --------------------------------------------------

    if (
      !message &&
      load_history
    ) {
      const conversation =
        await getOrCreateConversation(
          telegramUser.id,
        );

      const history =
        await getChatHistory(
          telegramUser.id,
          conversation.id,
        );

      return jsonResponse(
        {
          ok: true,
          user: telegramUser,
          profile,
          conversation_id:
            conversation.id,
          history,
        },
        200,
        CORS_HEADERS,
      );
    }

    // --------------------------------------------------
    // Profile only
    // --------------------------------------------------

    if (!message) {
      return jsonResponse(
        {
          ok: true,
          user: telegramUser,
          profile,
        },
        200,
        CORS_HEADERS,
      );
    }

    // --------------------------------------------------
    // Conversation
    // --------------------------------------------------

    const conversation =
      await getOrCreateConversation(
        telegramUser.id,
      );

    // Save user message
    await saveMessage(
      telegramUser.id,
      conversation.id,
      "user",
      message,
    );

    // Load recent history
    const history =
      await getChatHistory(
        telegramUser.id,
        conversation.id,
      );

    // --------------------------------------------------
    // AI response + mistake analysis
    // --------------------------------------------------

    const isVoiceMessage =
      voice === true;

    const [
      answer,
      mistake,
    ] = await Promise.all([
      askOpenRouter(
        profile,
        history,
        isVoiceMessage,
      ),

      analyzeStudentMessage(
        message,
        profile,
      ),
    ]);

    // --------------------------------------------------
    // Correction
    // --------------------------------------------------

    let finalAnswer =
      answer;

    if (
      mistake?.has_mistake
    ) {
      const correction =
        mistake.explanation
          ? `${mistake.corrected_text}\n\n${mistake.explanation}`
          : mistake.corrected_text;

      finalAnswer =
        `${answer}\n\n${correction}`;
    }

    // --------------------------------------------------
    // Save assistant message
    // --------------------------------------------------

    await saveMessage(
      telegramUser.id,
      conversation.id,
      "assistant",
      finalAnswer,
    );

    // --------------------------------------------------
    // Update progress
    // --------------------------------------------------

    try {
      await updateProgress(
        String(telegramUser.id),
        profile?.level || null,
      );
    } catch (error) {
      console.error(
        "Progress update failed:",
        error,
      );
    }

    // --------------------------------------------------
    // Response
    // --------------------------------------------------

    return jsonResponse(
      {
        ok: true,
        user: telegramUser,
        profile,
        conversation_id:
          conversation.id,
        answer: finalAnswer,
      },
      200,
      CORS_HEADERS,
    );
  } catch (error) {
    console.error(
      "rapid-worker error:",
      error,
    );

    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      500,
      CORS_HEADERS,
    );
  }
});
