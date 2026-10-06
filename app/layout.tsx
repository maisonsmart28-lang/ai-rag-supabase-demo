import "./globals.css";

export const metadata = { title: "Secure AI RAG", description: "Multi-user RAG with Supabase RLS and pgvector" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
