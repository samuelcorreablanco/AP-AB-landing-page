-- ============================================================
--  Tabla de cotizaciones para Ap-Ab
--  Ejecútalo en: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- Tabla de leads (botón "Empecemos" de la página de proceso)
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  idea        text,
  created_at  timestamptz default now()
);
alter table public.leads enable row level security;
drop policy if exists "anyone can submit a lead" on public.leads;
create policy "anyone can submit a lead"
  on public.leads for insert to anon with check (true);

create table if not exists public.quotes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  company     text,
  message     text not null,
  created_at  timestamptz default now()
);

-- Seguridad: solo permitir INSERTAR desde la web (no leer datos públicamente)
alter table public.quotes enable row level security;

drop policy if exists "anyone can submit a quote" on public.quotes;
create policy "anyone can submit a quote"
  on public.quotes
  for insert
  to anon
  with check (true);

-- Nota: NO creamos política de SELECT, así nadie puede leer las cotizaciones
-- con la anon key. Tú las ves desde el panel de Supabase (Table Editor).
