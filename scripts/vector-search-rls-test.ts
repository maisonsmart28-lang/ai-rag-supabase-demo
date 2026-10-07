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
  let authUser: { email?: string } | null = null;
  let lastAuthError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (!authError && auth.user) {
      authUser = auth.user;
      break;
    }

    lastAuthError = authError;
    const isRetryableNetworkError =
      Boolean(authError) &&
      (authError as { status?: number; name?: string }).status === 0 &&
      (authError as { name?: string }).name === "AuthRetryableFetchError";

    if (!isRetryableNetworkError || attempt === 3) break;

    console.warn(`Transient auth network failure (attempt ${attempt}/3); retrying...`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }

  if (!authUser) throw lastAuthError ?? new Error("Authentication failed.");

  console.log("Authenticated as:", authUser.email);

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

  const isUserA = authUser.email === "tenant-a@rls-demo.test";
  const isUserB = authUser.email === "tenant-b@rls-demo.test";

  if (!isUserA && !isUserB) {
    throw new Error("This harness only supports the controlled User A/User B test accounts.");
  }

  const expectedDocuments = isUserA ? ["test-a.txt"] : ["test-b.pdf"];
  const forbiddenDocuments = isUserA
    ? ["test-b.pdf", "user-b-rag-pdf-test.pdf", "user-b-rag-test.txt"]
    : ["test-a.txt"];

  const expected = rows.filter((row: any) => expectedDocuments.includes(row.document_name));
  const forbidden = rows.filter((row: any) => forbiddenDocuments.includes(row.document_name));

  if (expected.length === 0) {
    throw new Error(`FAIL: ${authUser.email} did not retrieve its own expected vector document.`);
  }

  if (forbidden.length > 0) {
    throw new Error(`FAIL: ${authUser.email} retrieved another user's protected vector chunks.`);
  }

  console.log(
    `PASS: ${authUser.email} retrieved own vector content and no protected cross-user chunks.`,
  );
  await supabase.auth.signOut();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
