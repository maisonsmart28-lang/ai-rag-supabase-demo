import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ingestDocument, logout } from "./actions";

const uploadMessages: Record<string, string> = {
  ok: "Document ingested successfully.",
  missing: "Choose a file before uploading.",
  "too-large": "File is too large. Maximum size is 1 MB.",
  unsupported: "Only TXT, Markdown and PDF files are supported.",
  "too-many-pages": "PDF is too long. Maximum is 50 pages.",
  "pdf-error": "The PDF could not be parsed.",
  empty: "The selected file contains no usable text.",
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ upload?: string; chunks?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: documents } = await supabase
    .from("rag_documents")
    .select("id,name,source_type,created_at,rag_document_chunks(count)")
    .order("created_at", { ascending: false });

  return <main className="dashShell">
    <header className="dashHeader">
      <div><p className="eyebrow">PRIVATE WORKSPACE</p><h1>Knowledge Base</h1></div>
      <form action={logout}><button className="secondary">Sign out</button></form>
    </header>

    <section className="panel">
      <h2>Ingest a document</h2>
      <p className="muted">TXT, Markdown or PDF, maximum 1 MB. PDFs are limited to 50 pages. Extracted text is stored as RLS-protected chunks.</p>
      <form action={ingestDocument} className="uploadForm">
        <input name="file" type="file" accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf" required />
        <button type="submit">Upload and chunk</button>
      </form>
      {params.upload && <p className={params.upload === "ok" ? "success" : "error"}>
        {uploadMessages[params.upload] ?? "Upload failed."}
        {params.upload === "ok" && params.chunks ? ` ${params.chunks} chunk(s) created.` : ""}
      </p>}
    </section>

    <section className="panel">
      <h2>Your documents</h2>
      <p className="muted">RLS restricts this list and its chunks to the authenticated owner.</p>
      {!documents?.length ? <div className="empty">No documents yet.</div> :
        <div className="docList">{documents.map((d) => {
          const count = d.rag_document_chunks?.[0]?.count ?? 0;
          return <article key={d.id}>
            <strong>{d.name}</strong>
            <span>{d.source_type} · {count} chunk(s)</span>
          </article>;
        })}</div>}
    </section>
  </main>;
}
