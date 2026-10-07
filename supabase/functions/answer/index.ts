import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const embeddingModel = new Supabase.ai.Session("gte-small");
const GROQ_MODEL = "openai/gpt-oss-20b";
const MATCH_THRESHOLD = 0.55;
const MATCH_COUNT = 5;

type Match = {
  id: number;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

const runtime = globalThis as typeof globalThis & {
  Deno?: { env: { get(name: string): string | undefined } };
};

function getEnv(name: string) {
  return runtime.Deno?.env.get(name);
}

export default {
  fetch: async (req: Request) => {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const authorization = req.headers.get("Authorization");
      if (!authorization) {
        return Response.json({ error: "Missing authorization." }, { status: 401 });
      }

      const body = await req.json();
      const question = typeof body?.question === "string" ? body.question.trim() : "";
      if (!question) {
        return Response.json({ error: "A non-empty question is required." }, { status: 400 });
      }
      if (question.length > 2000) {
        return Response.json({ error: "Question is too long." }, { status: 400 });
      }

      const supabaseUrl = getEnv("SUPABASE_URL");
      const anonKey = getEnv("SUPABASE_ANON_KEY");
      const groqKey = getEnv("GROQ_API_KEY");
      if (!supabaseUrl || !anonKey || !groqKey) {
        console.error("Missing required server-side configuration.");
        return Response.json({ error: "Server configuration is incomplete." }, { status: 500 });
      }

      const embedding = await embeddingModel.run(question, {
        mean_pool: true,
        normalize: true,
      });
      if (!Array.isArray(embedding) || embedding.length !== 384) {
        return Response.json({ error: "Unexpected embedding dimension." }, { status: 500 });
      }

      // Forward the caller JWT to PostgREST. The RPC therefore executes under
      // the authenticated user's RLS context; no service-role key is used.
      const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/match_rag_chunks`, {
        method: "POST",
        headers: {
          Authorization: authorization,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query_embedding: embedding,
          match_threshold: MATCH_THRESHOLD,
          match_count: MATCH_COUNT,
        }),
      });

      if (!rpcResponse.ok) {
        console.error("RAG retrieval failed", rpcResponse.status, await rpcResponse.text());
        return Response.json({ error: "Knowledge retrieval failed." }, { status: 500 });
      }

      const matches = (await rpcResponse.json()) as Match[];
      if (!Array.isArray(matches) || matches.length === 0) {
        return Response.json({
          answer: "I don't have enough information in your knowledge base to answer that question.",
          grounded: false,
          sources: [],
        });
      }

      const context = matches
        .map(
          (match, index) =>
            `[SOURCE ${index + 1}] Document: ${match.document_name}; chunk: ${match.chunk_index}; similarity: ${Number(match.similarity).toFixed(4)}\n${match.content}`,
        )
        .join("\n\n");

      const systemPrompt = `You are a retrieval-grounded assistant.
Answer ONLY from the supplied knowledge-base sources.
Never use outside knowledge, browsing, assumptions, or invented facts.
If the sources do not contain enough information, say exactly: "I don't have enough information in your knowledge base to answer that question."
When you state information from a source, cite it inline as [1], [2], etc.
Use only citation numbers that exist in the supplied sources.
Answer in the same language as the user's question when practical.
Be concise and factual.`;

      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Question:\n${question}\n\nKnowledge-base sources:\n${context}`,
            },
          ],
          reasoning_effort: "low",
          temperature: 0.1,
          max_completion_tokens: 700,
        }),
      });

      if (!groqResponse.ok) {
        console.error("Groq generation failed", groqResponse.status, await groqResponse.text());
        return Response.json({ error: "Answer generation failed." }, { status: 502 });
      }

      const groq = await groqResponse.json();
      const rawAnswer = groq?.choices?.[0]?.message?.content?.trim();
      const answer = typeof rawAnswer === "string"
        ? rawAnswer.replaceAll("【", "[").replaceAll("】", "]").replaceAll("**", "")
        : "";
      if (!answer) {
        return Response.json({ error: "The language model returned no answer." }, { status: 502 });
      }

      return Response.json({
        answer,
        grounded: true,
        model: GROQ_MODEL,
        sources: matches.map((match, index) => ({
          citation: index + 1,
          document_id: match.document_id,
          document_name: match.document_name,
          chunk_index: match.chunk_index,
          similarity: match.similarity,
        })),
      });
    } catch (error) {
      console.error("Grounded answer failed", error);
      return Response.json({ error: "Grounded answer generation failed." }, { status: 500 });
    }
  },
};
