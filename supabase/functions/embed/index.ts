import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const model = new Supabase.ai.Session("gte-small");

export default {
  fetch: async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await req.json();
    const input = typeof body?.input === "string" ? body.input.trim() : "";

    if (!input) {
      return Response.json({ error: "A non-empty input string is required." }, { status: 400 });
    }

    const embedding = await model.run(input, {
      mean_pool: true,
      normalize: true,
    });

    if (!Array.isArray(embedding) || embedding.length !== 384) {
      return Response.json(
        { error: "Embedding model returned an unexpected vector dimension." },
        { status: 500 },
      );
    }

    return Response.json({ embedding, dimensions: embedding.length });
  } catch (error) {
    console.error("Embedding generation failed", error);
    return Response.json({ error: "Embedding generation failed." }, { status: 500 });
  }
  },
};
