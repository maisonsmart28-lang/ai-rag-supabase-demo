import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const email = process.env.RLS_TEST_EMAIL!;
const password = process.env.RLS_TEST_PASSWORD!;

async function main() {
  if (!url || !key || !email || !password) throw new Error("Missing Supabase/RLS test environment variables.");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !auth.user) throw authError ?? new Error("Authentication failed.");

  console.log("Authenticated as:", auth.user.email);

  const query = "blue fleet private maintenance vehicle";
  const { data: embeddingData, error: embeddingError } = await supabase.functions.invoke("embed", {
    body: { input: query },
  });
  if (embeddingError || !Array.isArray(embeddingData?.embedding) || embeddingData.embedding.length !== 384) {
    throw embeddingError ?? new Error("Invalid query embedding.");
  }

  const { data, error } = await supabase.rpc("match_rag_chunks", {
    query_embedding: embeddingData.embedding,
    match_threshold: 0,
    match_count: 20,
  });
  if (error) throw error;

  const rows = data ?? [];
  console.log("Vector results:", rows.length);
  for (const row of rows) {
    console.log("-", row.document_name, "chunk", row.chunk_index, "similarity", Number(row.similarity).toFixed(4));
  }

  const forbidden = rows.filter((row: any) =>
    ["test-b.pdf", "user-b-rag-pdf-test.pdf", "user-b-rag-test.txt"].includes(row.document_name),
  );

  if (forbidden.length > 0) {
    throw new Error("FAIL: authenticated user can retrieve User B vector chunks.");
  }

  console.log("PASS: vector search returned no User B protected chunks.");
  await supabase.auth.signOut();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
