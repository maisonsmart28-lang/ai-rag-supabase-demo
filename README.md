# Secure AI RAG Knowledge Base

A portfolio-grade multi-user Retrieval-Augmented Generation demo built with Next.js, Supabase Auth, PostgreSQL and pgvector.

## Security first

Document ownership and chunk retrieval are protected by PostgreSQL Row Level Security. The vector search RPC is SECURITY INVOKER so authenticated-user RLS remains active during semantic retrieval. The isolation model has already been validated with two real Supabase Auth users in the companion RLS test harness.

## Planned flow

1. Authenticate
2. Upload a PDF, Markdown or text document
3. Extract and chunk text
4. Generate 384-dimensional embeddings
5. Store embeddings in pgvector
6. Retrieve only chunks visible to the authenticated user
7. Produce grounded answers with source citations

## Local setup

Copy `.env.example` to `.env.local` and provide only the public Supabase URL and publishable key. Never commit passwords or service-role credentials.

```bash
npm install
npm run dev
```

## Status

Foundation created. Authentication and ingestion are the next implementation step.
