export const config = { runtime: "edge" };

type ImageInput = {
  id?: string;
  dataUrl: string;
  name?: string;
  tag?: string;
};

type AnalyzeRequest = {
  mode: "aggregate" | "per_image";
  prompt: string;
  images: ImageInput[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
};

async function callOpenAI({
  apiKey,
  model,
  temperature,
  prompt,
  images,
  max_tokens,
}: {
  apiKey: string;
  model: string;
  temperature: number;
  prompt: string;
  images: ImageInput[];
  max_tokens?: number;
}): Promise<string> {
  const content: any[] = [{ type: "text", text: prompt }];
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: img.dataUrl },
    });
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      temperature: temperature ?? 0.2,
      max_tokens: max_tokens ?? 1200,
      messages: [
        {
          role: "user",
          content,
        },
      ],
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    const msg =
      (data && (data.error?.message || data.message)) ||
      `OpenAI error (status ${resp.status})`;
    throw new Error(msg);
  }
  const text =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.message?.parts?.map((p: any) => p?.text).join("\n") ??
    "";
  return String(text || "");
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing OPENAI_API_KEY on server." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = (await req.json()) as AnalyzeRequest;
  const mode = body.mode || "aggregate";
  const prompt = body.prompt?.trim() || "";
  const images = Array.isArray(body.images) ? body.images : [];
  const model = body.model || "gpt-4o-mini";
  const temperature =
    typeof body.temperature === "number" ? body.temperature : 0.2;
  const max_tokens =
    typeof body.max_tokens === "number" ? body.max_tokens : 1200;

  if (!prompt) {
    return new Response(JSON.stringify({ error: "Missing prompt" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (images.length === 0) {
    return new Response(JSON.stringify({ error: "No images provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Optionnel: limiter le nombre d’images par requête (sécurité token)
  const limitedImages = images.slice(0, 12);

  try {
    if (mode === "aggregate") {
      const text = await callOpenAI({
        apiKey,
        model,
        temperature,
        prompt,
        images: limitedImages,
        max_tokens,
      });
      return new Response(
        JSON.stringify({ ok: true, mode: "aggregate", outputText: text }),
        { headers: { "Content-Type": "application/json" } },
      );
    } else {
      // per_image
      const results = await Promise.all(
        limitedImages.map(async (img) => {
          const text = await callOpenAI({
            apiKey,
            model,
            temperature,
            prompt,
            images: [img],
            max_tokens,
          });
          return { imageId: img.id, outputText: text };
        }),
      );
      return new Response(
        JSON.stringify({ ok: true, mode: "per_image", items: results }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}