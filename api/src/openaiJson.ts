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

  const extractResponsesText = (r: any): string => {
    const direct = typeof r?.output_text === "string" ? r.output_text : "";
    if (direct && direct.trim()) return direct.trim();

    const outputs = Array.isArray(r?.output) ? r.output : [];
    const parts: string[] = [];
    for (const o of outputs) {
      const content = Array.isArray(o?.content) ? o.content : [];
      for (const c of content) {
        if (typeof c?.text === "string") parts.push(c.text);
        else if (typeof c?.text?.value === "string") parts.push(c.text.value);
        else if (typeof c?.text?.content === "string") parts.push(c.text.content);
        else if (typeof c?.value === "string") parts.push(c.value);
        else if (typeof c?.content === "string") parts.push(c.content);
      }
    }
    return parts.join("").trim();
  };

  const isUnsupportedTemperatureError = (err: any) => {
    const msg =
      String(err?.message || err?.error?.message || err?.response?.data?.error?.message || err?.response?.data || "").toLowerCase();
    return (err?.status === 400 || err?.code === 400) && msg.includes("unsupported parameter") && msg.includes("temperature");
  };

  const isUnsupportedMaxTokensError = (err: any) => {
    const msg =
      String(err?.message || err?.error?.message || err?.response?.data?.error?.message || err?.response?.data || "").toLowerCase();
    return (err?.status === 400 || err?.code === 400) && msg.includes("unsupported parameter") && msg.includes("max_tokens");
  };

  // Some models (notably gpt-5-mini) may return empty `output_text`/`output` via Responses API in our setup.
  // Prefer Chat Completions for gpt-5-mini, unless explicitly forced via USE_RESPONSES_API=1.
  const preferChatCompletions = /^gpt-5-mini$/i.test(model) && process.env.USE_RESPONSES_API !== "1";

  const preferResponses =
    !preferChatCompletions &&
    (process.env.USE_RESPONSES_API === "1" || /^gpt-5/i.test(model) || /^o\d/i.test(model) || /^gpt-4\.1/i.test(model));

  const t0 = Date.now();

  const callChatCompletions = async (): Promise<{ jsonText: string; usage: JsonCallUsage }> => {
    const params: any = {
      model,
      temperature,
      // Some models (notably gpt-5*) use `max_completion_tokens` instead of `max_tokens` in Chat Completions.
      max_tokens: maxOutputTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: instructions }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
    };

    let completion: any;
    try {
      completion = await (client as any).chat.completions.create(params);
    } catch (err: any) {
      // Retry without unsupported knobs (some models restrict params).
      if (isUnsupportedTemperatureError(err)) {
        delete params.temperature;
        completion = await (client as any).chat.completions.create(params);
      } else if (isUnsupportedMaxTokensError(err)) {
        delete params.max_tokens;
        params.max_completion_tokens = maxOutputTokens;
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
  };

  const callResponses = async (): Promise<{ jsonText: string; usage: JsonCallUsage }> => {
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
      jsonText: extractResponsesText(r),
      usage: {
        model,
        api: "responses",
        latencyMs,
        promptTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : null,
        completionTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : null,
        totalTokens: typeof usage?.total_tokens === "number" ? usage.total_tokens : null,
      },
    };
  };

  if (preferChatCompletions) {
    // Try Chat Completions first (gpt-5-mini).
    const r1 = await callChatCompletions();
    if (r1.jsonText) return r1;
    // Fallback to Responses if content came back empty for some reason.
    return callResponses();
  }

  if (preferResponses) {
    const r1 = await callResponses();
    if (r1.jsonText) return r1;
    // Fallback to chat completions if Responses returned no text.
    return callChatCompletions();
  }

  return callChatCompletions();
}
