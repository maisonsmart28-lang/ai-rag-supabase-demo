import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { askKnowledgeBase, ingestDocument, logout } from "./actions";

const uploadMessages: Record<string, string> = {
  ok: "Document ingested successfully.",
  missing: "Choose a file before uploading.",
  "too-large": "File is too large. Maximum size is 1 MB.",
  unsupported: "Only TXT, Markdown and PDF files are supported.",
  "too-many-pages": "PDF is too long. Maximum is 50 pages.",
  "pdf-error": "The PDF could not be parsed.",
  empty: "The selected file contains no usable text.",
};

type AnswerSource = {
  citation: number;
  document_id: string;
  document_name: string;
  chunk_index: number;
  similarity: number;
};

type AnswerResult = {
  question: string;
  answer: string;
  grounded: boolean;
  sources: AnswerSource[];
};

function decodeAnswerResult(value?: string): AnswerResult | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.question !== "string" || typeof parsed.answer !== "string") return null;
    return {
      question: parsed.question,
      answer: parsed.answer,
      grounded: parsed.grounded === true,
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    };
  } catch {
    return null;
  }
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ upload?: string; chunks?: string; ask?: string; result?: string }>;
}) {
  const params = await searchParams;
  const answerResult = params.ask === "ok" ? decodeAnswerResult(params.result) : null;
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
      <h2>Ask your knowledge base</h2>
      <p className="muted">Answers are generated only from passages your authenticated account can retrieve through RLS.</p>
      <form action={askKnowledgeBase} className="searchForm">
        <input className="questionInput" name="question" type="text" placeholder="Ask a question about your documents..." maxLength={2000} required />
        <button type="submit">Ask AI</button>
      </form>

      {params.ask === "missing" && <p className="error">Enter a question.</p>}
      {params.ask === "too-long" && <p className="error">Question is too long.</p>}
      {params.ask === "answer-error" && <p className="error">Unable to generate a grounded answer.</p>}
      {params.ask === "ok" && !answerResult && <p className="error">The answer result could not be displayed.</p>}

      {answerResult && <div className="answerBlock">
        <p className="answerQuestion">{answerResult.question}</p>
        <div className="answerText">{answerResult.answer}</div>
        <p className="groundingStatus">{answerResult.grounded ? "Grounded in your private knowledge base" : "Insufficient source evidence"}</p>
        {answerResult.sources.length > 0 && <div className="sourceList">
          <h3>Sources</h3>
          {answerResult.sources.map((source) => <article className="sourceCard" key={source.citation + source.document_id + source.chunk_index}>
            <strong>[{source.citation}] {source.document_name}</strong>
            <span>chunk {source.chunk_index + 1} · similarity {Number(source.similarity).toFixed(3)}</span>
          </article>)}
        </div>}
      </div>}
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
