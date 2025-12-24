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

function extractResponsesText(r: any): string {
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
      else if (typeof c?.refusal === "string") parts.push(c.refusal);
    }
  }
  return parts.join("").trim();
}

export async function createJsonObjectResponse(args: {
  client: OpenAI;
  model: string;
  instructions: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  temperature: number;
  maxOutputTokens: number;
}): Promise<{ jsonText: string; usage: JsonCallUsage }> {
  const { client, model, instructions, messages, temperature, maxOutputTokens } = args;

  const isGpt5Mini = /^gpt-5-mini$/i.test(model);

  const preferResponses =
    !isGpt5Mini &&
    (process.env.USE_RESPONSES_API === "1" ||
      /^gpt-5/i.test(model) ||
      /^o\d/i.test(model) ||
      /^gpt-4\.1/i.test(model));

  const t0 = Date.now();

  if (preferResponses) {
    const params: any = {
      model,
      instructions,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      text: { format: { type: "json_object" } },
      max_output_tokens: maxOutputTokens,
    };
    // gpt-5-mini only supports the default temperature; do not send a custom value.
    if (!isGpt5Mini) params.temperature = temperature;

    let r: any = await (client as any).responses.create(params);
    const latencyMs = Date.now() - t0;
    const usage = r?.usage;
    const jsonText = extractResponsesText(r);

    if (process.env.AI_LOG_CONTENT === "1") {
      console.log("[openaiJson][responses_api] output_text:", r?.output_text?.slice(0, 200));
      console.log("[openaiJson][responses_api] output:", JSON.stringify(r?.output)?.slice(0, 300));
      console.log("[openaiJson][responses_api] extracted:", jsonText.slice(0, 200));
    }

    // Fallback: some setups return empty output_text/output; try Chat Completions.
    if (!jsonText) {
      if (process.env.AI_LOG_CONTENT === "1") {
        console.log("[openaiJson] Responses API returned empty, trying Chat Completions fallback...");
      }
      try {
        const completion: any = await (client as any).chat.completions.create({
          model,
          ...(isGpt5Mini ? {} : { temperature }),
          ...(isGpt5Mini ? { max_completion_tokens: maxOutputTokens } : { max_tokens: maxOutputTokens }),
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: instructions },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        });
        const usage2 = completion?.usage;
        const content2 = completion?.choices?.[0]?.message?.content || "";

        if (process.env.AI_LOG_CONTENT === "1") {
          console.log("[openaiJson][chat_completions_fallback] content:", content2?.slice(0, 200));
        }

        return {
          jsonText: String(content2 || "").trim(),
          usage: {
            model,
            api: "chat_completions",
            latencyMs: Date.now() - t0,
            promptTokens: typeof usage2?.prompt_tokens === "number" ? usage2.prompt_tokens : null,
            completionTokens: typeof usage2?.completion_tokens === "number" ? usage2.completion_tokens : null,
            totalTokens: typeof usage2?.total_tokens === "number" ? usage2.total_tokens : null,
          },
        };
      } catch (err) {
        if (process.env.AI_LOG_CONTENT === "1") {
          console.log("[openaiJson][chat_completions_fallback] ERROR:", err);
        }
        // ignore fallback errors, keep original responses usage
      }
    }

    return {
      jsonText,
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
    ...(isGpt5Mini ? {} : { temperature }),
    ...(isGpt5Mini ? { max_completion_tokens: maxOutputTokens } : { max_tokens: maxOutputTokens }),
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
