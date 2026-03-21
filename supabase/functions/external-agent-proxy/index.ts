import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  messages: { role: string; content: string }[];
  model_id: string;
  provider: "openai" | "anthropic" | "google";
  api_key: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, model_id, provider, api_key } =
      (await req.json()) as RequestBody;

    if (!api_key) {
      return new Response(
        JSON.stringify({ error: "API key mancante" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let reply: string;

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model_id,
          messages,
          max_tokens: 4096,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        return new Response(
          JSON.stringify({ error: `OpenAI error: ${res.status} ${t}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const data = await res.json();
      reply = data.choices?.[0]?.message?.content || "";
    } else if (provider === "anthropic") {
      // Convert messages format for Anthropic
      const systemMsg = messages.find((m) => m.role === "system");
      const chatMsgs = messages.filter((m) => m.role !== "system");

      const body: Record<string, unknown> = {
        model: model_id,
        max_tokens: 4096,
        messages: chatMsgs.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      };
      if (systemMsg) body.system = systemMsg.content;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": api_key,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        return new Response(
          JSON.stringify({ error: `Anthropic error: ${res.status} ${t}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const data = await res.json();
      reply =
        data.content
          ?.filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("") || "";
    } else if (provider === "google") {
      // Gemini API
      const geminiMessages = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model_id}:generateContent?key=${api_key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: geminiMessages }),
        }
      );
      if (!res.ok) {
        const t = await res.text();
        return new Response(
          JSON.stringify({ error: `Google error: ${res.status} ${t}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const data = await res.json();
      reply =
        data.candidates?.[0]?.content?.parts
          ?.map((p: any) => p.text)
          .join("") || "";
    } else {
      return new Response(
        JSON.stringify({ error: `Provider non supportato: ${provider}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("external-agent-proxy error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Errore sconosciuto",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
