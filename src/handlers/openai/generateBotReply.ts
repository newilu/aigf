// Generate bot reply
import { model, openai } from "../../config/openai";

async function generateBotReply({
  history,
  summaries = [],
  prompt,
}: {
  history: string[];
  summaries?: string[];
  prompt: string;
}): Promise<string[]> {
  const messages: any[] = [{ role: "system", content: prompt }];

  // Добавляем summaries, если есть
  if (summaries.length > 0) {
    const summariesText = summaries
      .map((s, i) => `Сводка ${i + 1}: ${s}`)
      .join("\n");
    messages.push({
      role: "assistant",
      content: `Ранее было:\n${summariesText}`,
    });
  }

  // Добавляем историю
  history.forEach((msg) => {
    messages.push({
      role: msg.startsWith("BOT:") ? "assistant" : "user",
      content: msg,
    });
  });

  try {
    const temperature = Math.random() * (1.0 - 0.5) + 0.5; // Случайная креативность
    const top_p = Math.random() * (1.0 - 0.8) + 0.8; // Случайная точность
    const res = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      top_p,
    });
    return (res.choices[0].message.content?.trim() || "").split("[END_MSG]");
  } catch (error) {
    console.error("API Error:", error);
    return ["ойй, пиздец, давай позже"];
  }
}

export { generateBotReply };
