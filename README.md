# Secure AI RAG Knowledge Base

A multi-user Retrieval-Augmented Generation demo built with Next.js, Supabase Auth, PostgreSQL/pgvector and Groq.

## Implemented

- Supabase Auth with private authenticated workspaces
- TXT, Markdown and PDF ingestion
- Text extraction and overlapping chunking
- 384-dimensional embeddings with Supabase Edge Runtime `gte-small`
- pgvector storage and semantic retrieval
- PostgreSQL Row Level Security on documents and chunks
- `SECURITY INVOKER` vector-search RPC so caller RLS remains active
- Grounded answer generation through Groq
- Source citations with document, chunk and similarity metadata
- Next.js dashboard for upload, question answering and private document listing
- No service-role key in the authenticated retrieval or answer path

## Verified security behavior

The project was tested with two separate Supabase Auth users. User A retrieves its own `test-a.txt` content and cannot retrieve User B content. User B retrieves its own `test-b.pdf` content and cannot retrieve User A content.

Document/chunk isolation, vector retrieval and grounded answer generation passed in both directions. The same tenant isolation was also verified visually through the dashboard. A production `npm run build` passes.

## Architecture

```text
Authenticated user
      |
      v
Next.js dashboard
      |
      v
Supabase Edge Function
      |
      +--> gte-small embedding (384D)
      |
      v
match_rag_chunks()
      |
      v
PostgreSQL + pgvector + RLS
      |
      v
Only caller-authorized chunks
      |
      v
Groq grounded generation
      |
      v
Answer + citations
```

The caller JWT is forwarded to PostgREST for retrieval. The vector-search RPC runs as `SECURITY INVOKER`, so PostgreSQL RLS remains the authorization boundary. Groq receives only the question and chunks already authorized for that user; it has no database credentials.

## Local setup

Copy `.env.example` to `.env.local` and configure the public Supabase URL and publishable key. Keep test-user passwords and provider secrets out of Git.

```bash
npm install
npm run dev
```

The deployed answer function reads `GROQ_API_KEY` from a Supabase Edge Function secret rather than the repository.

## Verification

```bash
npm run build
npm run test:rls-chunks
npm run test:embed
npm run test:vector-rls
npm run test:answer
```

Authenticated test commands use local `RLS_TEST_EMAIL` and `RLS_TEST_PASSWORD` environment variables. Run the isolation checks with each test user when validating both tenant directions.

## Current scope

This is a working portfolio demo, not a claim of production-scale readiness. Current ingestion limits are 1 MB per file and 50 pages per PDF. Semantic retrieval returns up to five matches with a 0.55 similarity threshold. The current embedding model is intended for the English-language demo corpus.
