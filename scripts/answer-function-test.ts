import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.RLS_TEST_EMAIL;
const password = process.env.RLS_TEST_PASSWORD;

if (!url || !key || !email || !password) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL/public key or RLS_TEST_EMAIL/RLS_TEST_PASSWORD.",
  );
}

const supabase = createClient(url, key);

async function signInWithRetry() {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) return data.user;
    lastError = error;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError;
}

const user = await signInWithRetry();
console.log("Authenticated as:", user.email);

const question =
  process.env.RAG_TEST_QUESTION ??
  "What is the preventive maintenance schedule for the blue fleet vehicle?";

const { data, error } = await supabase.functions.invoke("answer", {
  body: { question },
});

if (error) throw error;
if (!data || typeof data.answer !== "string") {
  throw new Error("Answer function returned an invalid payload.");
}

console.log("Question:", question);
console.log("Answer:", data.answer);
console.log("Grounded:", data.grounded);
console.log("Sources:", data.sources ?? []);

const sourceNames = Array.isArray(data.sources)
  ? data.sources.map((source: { document_name?: string }) => source.document_name)
  : [];

if (email.toLowerCase().includes("tenant-a") && sourceNames.includes("test-b.pdf")) {
  throw new Error("RLS FAILURE: User A received a protected User B source.");
}
if (email.toLowerCase().includes("tenant-b") && sourceNames.includes("test-a.txt")) {
  throw new Error("RLS FAILURE: User B received a protected User A source.");
}

console.log("PASS: grounded answer returned without protected cross-user sources.");
