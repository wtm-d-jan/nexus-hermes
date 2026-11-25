-- NEXUS HERMES · Datenbank (Supabase / Postgres)
-- So ist das Projekt „nexus-hermes“ eingerichtet. Für ein neues Projekt einmal
-- im SQL-Editor ausführen.
--
-- Idee: Alles, was die App speichert, ist ein JSON-Dokument in der Tabelle docs
-- (coll = Sammlung, id = Dokument). Wer was darf, regeln die Policies unten:
--   * Nur freigegebene Konten sehen und schreiben überhaupt etwas.
--   * coll „geheim“ (vertrauliche Besprechungen) nur Admins.
--   * coll „privat:<uid>“ (Meine Notiz) nur die Person selbst.
--   * coll „stamm“ (Mitarbeiter, Rollen, Vorlagen) schreiben nur Admins.
--   * Das allererste Konto wird automatisch Admin.

create table public.konten (
  uid uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  email text,
  ma text,
  freigegeben boolean not null default false,
  admin boolean not null default false,
  angelegt timestamptz not null default now()
);

create table public.docs (
  coll text not null check (coll ~ '^[A-Za-z0-9:_-]{1,80}$'),
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  daten jsonb not null,
  geaendert timestamptz not null default now(),
  geaendert_von uuid default auth.uid(),
  primary key (coll, id),
  constraint docs_groesse check (pg_column_size(daten) < 512000)
);

alter table public.konten enable row level security;
alter table public.docs enable row level security;

create or replace function public.hermes_freigegeben() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.konten k where k.uid = auth.uid() and k.freigegeben);
$$;
create or replace function public.hermes_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.konten k where k.uid = auth.uid() and k.freigegeben and k.admin);
$$;

create or replace function public.hermes_konto_neu() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.uid := auth.uid();
  new.email := (select u.email from auth.users u where u.id = auth.uid());
  if not exists (select 1 from public.konten) then
    new.admin := true; new.freigegeben := true;
  else
    new.admin := false; new.freigegeben := false;
  end if;
  return new;
end $$;
create trigger konten_neu before insert on public.konten for each row execute function public.hermes_konto_neu();

create or replace function public.hermes_konto_aendern() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.uid := old.uid; new.email := old.email; new.angelegt := old.angelegt;
  if not public.hermes_admin() then
    new.freigegeben := old.freigegeben; new.admin := old.admin;
  end if;
  if old.admin and not new.admin and not exists (select 1 from public.konten k where k.admin and k.uid <> old.uid) then
    new.admin := true;
  end if;
  return new;
end $$;
create trigger konten_aendern before update on public.konten for each row execute function public.hermes_konto_aendern();

create or replace function public.hermes_docs_stempel() returns trigger
language plpgsql set search_path = '' as $$
begin new.geaendert := now(); new.geaendert_von := auth.uid(); return new; end $$;
create trigger docs_stempel before insert or update on public.docs for each row execute function public.hermes_docs_stempel();

create policy konten_lesen on public.konten for select to authenticated
  using (uid = auth.uid() or public.hermes_freigegeben());
create policy konten_anlegen on public.konten for insert to authenticated
  with check (uid = auth.uid());
create policy konten_aendern on public.konten for update to authenticated
  using (uid = auth.uid() or public.hermes_admin()) with check (true);
create policy konten_loeschen on public.konten for delete to authenticated
  using (public.hermes_admin() and uid <> auth.uid());

create or replace function public.hermes_darf_lesen(c text) returns boolean
language sql stable set search_path = '' as $$
  select public.hermes_freigegeben()
     and (c <> 'geheim' or public.hermes_admin())
     and (c not like 'privat:%' or c = 'privat:' || auth.uid()::text);
$$;
create or replace function public.hermes_darf_schreiben(c text) returns boolean
language sql stable set search_path = '' as $$
  select public.hermes_darf_lesen(c) and (c <> 'stamm' or public.hermes_admin());
$$;
create policy docs_lesen on public.docs for select to authenticated using (public.hermes_darf_lesen(coll));
create policy docs_anlegen on public.docs for insert to authenticated with check (public.hermes_darf_schreiben(coll));
create policy docs_aendern on public.docs for update to authenticated using (public.hermes_darf_schreiben(coll)) with check (public.hermes_darf_schreiben(coll));
create policy docs_loeschen on public.docs for delete to authenticated using (public.hermes_darf_schreiben(coll));

revoke all on public.konten, public.docs from anon;
grant select, insert, update, delete on public.konten, public.docs to authenticated;
revoke execute on function public.hermes_freigegeben(), public.hermes_admin(), public.hermes_darf_lesen(text), public.hermes_darf_schreiben(text) from anon, public;
grant execute on function public.hermes_freigegeben(), public.hermes_admin(), public.hermes_darf_lesen(text), public.hermes_darf_schreiben(text) to authenticated;
revoke execute on function public.hermes_konto_neu(), public.hermes_konto_aendern(), public.hermes_docs_stempel() from anon, authenticated, public;

alter publication supabase_realtime add table public.docs, public.konten;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg','image/png','image/webp']);
create policy fotos_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.hermes_freigegeben());
