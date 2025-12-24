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

  const isUnsupportedTemperatureError = (err: any) => {
    const msg =
      String(err?.message || err?.error?.message || err?.response?.data?.error?.message || err?.response?.data || "").toLowerCase();
    return (err?.status === 400 || err?.code === 400) && msg.includes("unsupported parameter") && msg.includes("temperature");
  };

  const preferResponses =
    process.env.USE_RESPONSES_API === "1" ||
    /^gpt-5/i.test(model) ||
    /^o\d/i.test(model) ||
    /^gpt-4\.1/i.test(model);

  const t0 = Date.now();

  if (preferResponses) {
    const params: any = {
      model,
      instructions,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      text: { format: { type: "json_object" } },
      temperature,
      max_output_tokens: maxOutputTokens,
    };

    let r: any;
    try {
      r = await (client as any).responses.create(params);
    } catch (err: any) {
      if (isUnsupportedTemperatureError(err)) {
        delete params.temperature;
        r = await (client as any).responses.create(params);
      } else {
        throw err;
      }
    }
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

  const params: any = {
    model,
    temperature,
    max_tokens: maxOutputTokens,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: instructions }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
  };

  let completion: any;
  try {
    completion = await (client as any).chat.completions.create(params);
  } catch (err: any) {
    if (isUnsupportedTemperatureError(err)) {
      delete params.temperature;
      completion = await (client as any).chat.completions.create(params);
    } else {
      throw err;
    }
  }
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
