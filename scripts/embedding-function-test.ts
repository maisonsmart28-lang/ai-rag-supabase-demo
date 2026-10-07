import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.RLS_TEST_EMAIL;
  const password = process.env.RLS_TEST_PASSWORD;

  if (!url || !key || !email || !password) {
    throw new Error("Missing Supabase URL/key or RLS_TEST_EMAIL/RLS_TEST_PASSWORD.");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !auth.user) throw authError ?? new Error("Authentication failed.");

  const { data, error } = await supabase.functions.invoke("embed", {
    body: { input: "Preventive fleet maintenance is required every fifteen thousand kilometers." },
  });

  if (error) throw error;
  if (!data || !Array.isArray(data.embedding)) throw new Error("Embedding response is missing an embedding array.");
  if (data.embedding.length !== 384 || data.dimensions !== 384) {
    throw new Error(`Expected 384 dimensions, got ${data.embedding.length}.`);
  }
  if (!data.embedding.every((value: unknown) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("Embedding contains a non-finite value.");
  }

  console.log(`Authenticated as: ${email}`);
  console.log(`Embedding dimensions: ${data.embedding.length}`);
  console.log("PASS: authenticated Edge Function returned a valid 384-dimensional embedding.");

  await supabase.auth.signOut();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
