import {
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
} from "../config.ts";

export async function saveMessage(
  telegramId: number,
  conversationId: number,
  role: string,
  content: string,
) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/messages`,
    {
      method: "POST",

      headers: {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        telegram_id: telegramId,
        conversation_id: conversationId,
        role,
        content,
      }),
    },
  );

  if (!response.ok) {
    console.error(
      "Message save failed:",
      response.status,
      await response.text(),
    );

    return false;
  }

  return true;
}

export async function getChatHistory(
  telegramId: number,
  conversationId: number,
) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?telegram_id=eq.${telegramId}&conversation_id=eq.${conversationId}&select=role,content,created_at&order=created_at.desc&limit=10`,
    {
      headers: {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );

  if (!response.ok) {
    console.error(
      "History request failed:",
      response.status,
      await response.text(),
    );

    return [];
  }

  const messages = messagesWithParsedVoice(await response.json());
  const ordered = messages.reverse();

  for (const message of ordered) {
    if (message?.content?.type === "voice" && message.content.audio_path) {
      message.content.audio_url = await signVoice(message.content.audio_path);
    }
  }

  return ordered;
}


function messagesWithParsedVoice(messages: any[]) {
  return messages.map((message) => {
    if (!message?.content || typeof message.content !== "string") return message;
    try {
      const parsed = JSON.parse(message.content);
      if (parsed?.type === "voice") return { ...message, content: parsed };
    } catch {
      // ordinary text message
    }
    return message;
  });
}
