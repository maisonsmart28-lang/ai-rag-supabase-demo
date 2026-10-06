import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: documents } = await supabase
    .from("rag_documents")
    .select("id,name,source_type,created_at")
    .order("created_at", { ascending: false });

  return <main className="dashShell">
    <header className="dashHeader">
      <div><p className="eyebrow">PRIVATE WORKSPACE</p><h1>Knowledge Base</h1></div>
      <form action={logout}><button className="secondary">Sign out</button></form>
    </header>
    <section className="panel">
      <h2>Your documents</h2>
      <p className="muted">RLS restricts this list to the authenticated owner.</p>
      {!documents?.length ? <div className="empty">No documents yet. Upload comes next.</div> :
        <div className="docList">{documents.map((d) =>
          <article key={d.id}><strong>{d.name}</strong><span>{d.source_type}</span></article>
        )}</div>}
    </section>
  </main>;
}
