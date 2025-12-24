// api/src/openaiJson.ts
// Helper to get strict JSON responses across Chat Completions and Responses APIs.

import type OpenAI from "openai";

export type JsonCallUsage = {
  model: string;
  api: "responses" | "chat_completions";
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export async function createJsonObjectResponse(args: {
  client: OpenAI;
  model: string;
  instructions: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  temperature: number;
  maxOutputTokens: number;
}): Promise<{ jsonText: string; usage: JsonCallUsage }> {
  const { client, model, instructions, messages, temperature, maxOutputTokens } = args;

  const preferResponses =
    process.env.USE_RESPONSES_API === "1" ||
    /^gpt-5/i.test(model) ||
    /^o\d/i.test(model) ||
    /^gpt-4\.1/i.test(model);

  const t0 = Date.now();

  if (preferResponses) {
    const r: any = await (client as any).responses.create({
      model,
      instructions,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      text: { format: { type: "json_object" } },
      temperature,
      max_output_tokens: maxOutputTokens,
    });
    const latencyMs = Date.now() - t0;
    const usage = r?.usage;
    return {
      jsonText: String(r?.output_text || "").trim(),
      usage: {
        model,
        api: "responses",
        latencyMs,
        promptTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : null,
        completionTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : null,
        totalTokens: typeof usage?.total_tokens === "number" ? usage.total_tokens : null,
      },
    };
  }

  const completion: any = await (client as any).chat.completions.create({
    model,
    temperature,
    max_tokens: maxOutputTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: instructions },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  const latencyMs = Date.now() - t0;
  const usage = completion?.usage;
  const content = completion?.choices?.[0]?.message?.content || "";
  return {
    jsonText: String(content || "").trim(),
    usage: {
      model,
      api: "chat_completions",
      latencyMs,
      promptTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null,
      completionTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null,
      totalTokens: typeof usage?.total_tokens === "number" ? usage.total_tokens : null,
    },
  };
}

