// Summarize conversation
import { model, openai } from "../../config/openai";

async function summarizeConversation(
  messages: { role: string; content: string }[],
): Promise<string> {
  const transcript = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  try {
    const res = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "Ты ассистент, делающий компактную сводку диалога.",
        },
        { role: "user", content: transcript },
      ],
      temperature: 0,
    });
    return res.choices[0].message.content?.trim() || "";
  } catch (error) {
    console.error("Summarization Error:", error);
    return "Не удалось создать сводку.";
  }
}

export { summarizeConversation };
