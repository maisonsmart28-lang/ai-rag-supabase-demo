"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { extractText, getDocumentProxy } from "unpdf";

const MAX_FILE_BYTES = 1024 * 1024;
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;
const MAX_PDF_PAGES = 50;

function chunkText(input: string) {
  const text = input.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      const sentenceBreak = text.lastIndexOf(". ", end);
      const candidate = Math.max(paragraphBreak, sentenceBreak);
      if (candidate > start + Math.floor(CHUNK_SIZE * 0.6)) end = candidate + 1;
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}

export async function ingestDocument(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/dashboard?upload=missing");
  if (file.size > MAX_FILE_BYTES) redirect("/dashboard?upload=too-large");

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "txt" && extension !== "md" && extension !== "markdown" && extension !== "pdf") {
    redirect("/dashboard?upload=unsupported");
  }

  let text: string;
  if (extension === "pdf") {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
      if (pdf.numPages > MAX_PDF_PAGES) redirect("/dashboard?upload=too-many-pages");
      const extracted = await extractText(pdf, { mergePages: true });
      text = String(extracted.text).trim();
      await pdf.destroy();
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
      redirect("/dashboard?upload=pdf-error");
    }
  } else {
    text = (await file.text()).trim();
  }
  if (!text) redirect("/dashboard?upload=empty");

  const chunks = chunkText(text);
  if (!chunks.length) redirect("/dashboard?upload=empty");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sourceType = extension === "txt" ? "text" : extension === "pdf" ? "pdf" : "markdown";
  const { data: document, error: documentError } = await supabase
    .from("rag_documents")
    .insert({ name: file.name.slice(0, 255), source_type: sourceType })
    .select("id")
    .single();

  if (documentError || !document) throw new Error("Unable to create document.");

  const { error: chunksError } = await supabase
    .from("rag_document_chunks")
    .insert(chunks.map((content, chunk_index) => ({
      document_id: document.id,
      chunk_index,
      content,
    })));

  if (chunksError) {
    await supabase.from("rag_documents").delete().eq("id", document.id);
    throw new Error("Unable to store document chunks.");
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard?upload=ok&chunks=${chunks.length}`);
}

export async function createDocument(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("rag_documents")
    .insert({ name, source_type: "text" });

  if (error) throw new Error("Unable to create document.");

  revalidatePath("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
