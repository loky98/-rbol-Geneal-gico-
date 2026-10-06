-- =============================================================
-- Árbol Genealógico · Familia Valenverguer
-- Ejecuta este archivo completo en Supabase → SQL Editor → Run
-- =============================================================

-- ---------- Personas ----------
create table if not exists public.persons (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null,
  last_name    text,
  gender       text check (gender in ('M', 'F', 'O')),
  birth_year   int,
  death_year   int,
  age          int,            -- edad aproximada cuando no se conoce el año de nacimiento
  description  text,
  photo_path   text,           -- ruta en Storage de la foto de perfil
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- Relaciones ----------
-- type = 'parent'  → related_id es padre/madre de person_id
-- type = 'spouse'  → person_id y related_id son pareja
create table if not exists public.relationships (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.persons(id) on delete cascade,
  related_id  uuid not null references public.persons(id) on delete cascade,
  type        text not null check (type in ('parent', 'spouse')),
  created_at  timestamptz not null default now(),
  unique (person_id, related_id, type),
  check (person_id <> related_id)
);

-- ---------- Archivos: fotos, audios y textos ----------
create table if not exists public.media (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.persons(id) on delete cascade,
  kind          text not null check (kind in ('photo', 'audio', 'text')),
  storage_path  text,
  title         text,
  text_content  text,
  transcript    text,
  created_at    timestamptz not null default now()
);

create index if not exists relationships_person_idx  on public.relationships (person_id);
create index if not exists relationships_related_idx on public.relationships (related_id);
create index if not exists media_person_idx          on public.media (person_id);

-- ---------- Seguridad: solo usuarios autenticados (la contraseña familiar) ----------
alter table public.persons       enable row level security;
alter table public.relationships enable row level security;
alter table public.media         enable row level security;

drop policy if exists "familia_all" on public.persons;
drop policy if exists "familia_all" on public.relationships;
drop policy if exists "familia_all" on public.media;

create policy "familia_all" on public.persons       for all to authenticated using (true) with check (true);
create policy "familia_all" on public.relationships for all to authenticated using (true) with check (true);
create policy "familia_all" on public.media         for all to authenticated using (true) with check (true);

-- ---------- Storage: bucket privado para fotos y audios ----------
insert into storage.buckets (id, name, public)
values ('family-media', 'family-media', false)
on conflict (id) do nothing;

drop policy if exists "familia_media_select" on storage.objects;
drop policy if exists "familia_media_insert" on storage.objects;
drop policy if exists "familia_media_update" on storage.objects;
drop policy if exists "familia_media_delete" on storage.objects;

create policy "familia_media_select" on storage.objects for select to authenticated using (bucket_id = 'family-media');
create policy "familia_media_insert" on storage.objects for insert to authenticated with check (bucket_id = 'family-media');
create policy "familia_media_update" on storage.objects for update to authenticated using (bucket_id = 'family-media');
create policy "familia_media_delete" on storage.objects for delete to authenticated using (bucket_id = 'family-media');
