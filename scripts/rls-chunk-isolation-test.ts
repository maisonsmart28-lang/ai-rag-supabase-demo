import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.RLS_TEST_EMAIL;
  const password = process.env.RLS_TEST_PASSWORD;

  if (!url || !key || !email || !password) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, RLS_TEST_EMAIL or RLS_TEST_PASSWORD.");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !auth.user) throw authError ?? new Error("Authentication failed.");

  const { data: documents, error: documentError } = await supabase
    .from("rag_documents")
    .select("id,name")
    .eq("name", "user-b-rag-test.txt");

  if (documentError) throw documentError;

  const { data: chunks, error: chunkError } = await supabase
    .from("rag_document_chunks")
    .select("id,document_id,content")
    .ilike("content", "%BLUE-FLEET-B-2026%");

  if (chunkError) throw chunkError;

  const isUserA = email.toLowerCase() === "tenant-a@rls-demo.test";
  console.log(`Authenticated as: ${email}`);
  console.log(`Visible User B documents: ${documents?.length ?? 0}`);
  console.log(`Visible confidential User B chunks: ${chunks?.length ?? 0}`);

  if (isUserA) {
    if ((documents?.length ?? 0) !== 0) throw new Error("FAIL: User A can read User B document.");
    if ((chunks?.length ?? 0) !== 0) throw new Error("FAIL: User A can read User B chunk.");
    console.log("PASS: User A cannot read User B document or confidential chunk.");
  } else {
    console.log("INFO: This script enforces the cross-user zero-result assertion when run as User A.");
  }

  await supabase.auth.signOut();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
