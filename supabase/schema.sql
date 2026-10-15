-- Run once in Supabase Dashboard → SQL Editor.
create extension if not exists vector with schema extensions;
create table if not exists public.documents (
  id text primary key, session_id uuid not null, filename text not null,
  stored_name text not null, pages integer not null, chunks integer not null,
  characters integer not null, created_at timestamptz not null default now()
);
create index if not exists documents_session_idx on public.documents(session_id);
create table if not exists public.pdf_chunks (
  id bigint generated always as identity primary key,
  session_id uuid not null, document_id text not null references public.documents(id) on delete cascade,
  content text not null, source text not null, page integer not null, chunk_index integer not null,
  embedding extensions.vector(1536) not null
);
create index if not exists pdf_chunks_session_idx on public.pdf_chunks(session_id);
create index if not exists pdf_chunks_embedding_idx on public.pdf_chunks using hnsw (embedding extensions.vector_cosine_ops);
alter table public.documents enable row level security;
alter table public.pdf_chunks enable row level security;
create or replace function public.match_pdf_chunks(
  query_embedding extensions.vector(1536), filter_session_id uuid, match_count int default 6
) returns table(text text, source text, page integer, score float)
language sql stable as $$
  select c.content, c.source, c.page, 1 - (c.embedding <=> query_embedding) as score
  from public.pdf_chunks c where c.session_id = filter_session_id
  order by c.embedding <=> query_embedding limit greatest(1, least(match_count, 20));
$$;
revoke all on function public.match_pdf_chunks(extensions.vector, uuid, int) from public, anon, authenticated;
grant execute on function public.match_pdf_chunks(extensions.vector, uuid, int) to service_role;
