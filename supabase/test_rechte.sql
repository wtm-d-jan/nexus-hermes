-- Test der Zugriffsregeln. Läuft komplett in einer Transaktion und wird am Ende
-- per Fehler zurückgerollt: „ALLE RECHTE-TESTS OK“ heißt bestanden.
do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a'; -- erstes Konto = Admin
  m uuid := '00000000-0000-0000-0000-00000000000b'; -- Mitarbeiter
  f uuid := '00000000-0000-0000-0000-00000000000c'; -- noch nicht freigegeben
  n int;
begin
  if exists (select 1 from public.konten) then raise exception 'Test nur auf leerer Datenbank'; end if;
  insert into auth.users (id, email, aud, role) values (a, 'a@test.local', 'authenticated', 'authenticated'), (m, 'm@test.local', 'authenticated', 'authenticated'), (f, 'f@test.local', 'authenticated', 'authenticated');

  -- als Admin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.konten (ma) values ('m1');
  if not (select admin and freigegeben from public.konten where uid = a) then raise exception '1: erstes Konto ist nicht Admin'; end if;
  insert into public.docs (coll, id, daten) values ('stamm', 'main', '{"x":1}'), ('besprechungen', 'b1', '{}'), ('geheim', 'g1', '{}'), ('privat:' || a, 'n1', '{"text":"nur ich"}');

  -- als Mitarbeiter, noch nicht freigegeben
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  insert into public.konten (ma, freigegeben, admin) values ('m2', true, true);
  if (select admin or freigegeben from public.konten where uid = m) then raise exception '2: Konto hat sich selbst freigegeben'; end if;
  select count(*) into n from public.docs; if n <> 0 then raise exception '3: ohne Freigabe sichtbar: %', n; end if;
  update public.konten set freigegeben = true, admin = true where uid = m;
  if (select freigegeben from public.konten where uid = m) then raise exception '4: Selbst-Freigabe per Update'; end if;

  -- Admin gibt frei
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  update public.konten set freigegeben = true where uid = m;

  -- als freigegebener Mitarbeiter
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  select count(*) into n from public.docs where coll = 'besprechungen'; if n <> 1 then raise exception '5: normale Besprechung nicht sichtbar'; end if;
  select count(*) into n from public.docs where coll = 'geheim'; if n <> 0 then raise exception '6: vertrauliche Besprechung sichtbar'; end if;
  select count(*) into n from public.docs where coll like 'privat:%'; if n <> 0 then raise exception '7: fremde private Notiz sichtbar'; end if;
  update public.docs set daten = '{"x":2}' where coll = 'stamm'; get diagnostics n = row_count; if n <> 0 then raise exception '8: Mitarbeiter ändert Stammdaten'; end if;
  begin
    insert into public.docs (coll, id, daten) values ('geheim', 'g2', '{}');
    raise exception '9: Mitarbeiter schreibt vertraulich';
  exception when insufficient_privilege then null; end;
  insert into public.docs (coll, id, daten) values ('aufgaben', 'a1', '{}'), ('privat:' || m, 'n1', '{}');
  update public.konten set admin = false where uid = a; -- darf er nicht
  if not (select admin from public.konten where uid = a) then raise exception '10: Mitarbeiter entzieht Admin'; end if;
  delete from public.konten where uid = a; get diagnostics n = row_count; if n <> 0 then raise exception '11: Mitarbeiter löscht Konto'; end if;

  -- als nicht freigegebenes Konto
  perform set_config('request.jwt.claims', json_build_object('sub', f, 'role', 'authenticated')::text, true);
  insert into public.konten (ma) values (null);
  begin
    insert into public.docs (coll, id, daten) values ('aufgaben', 'a2', '{}');
    raise exception '12: nicht freigegeben schreibt';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.konten; if n <> 1 then raise exception '13: nicht freigegeben sieht fremde Konten: %', n; end if;

  -- letzter Admin bleibt Admin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  update public.konten set admin = false where uid = a;
  if not (select admin from public.konten where uid = a) then raise exception '14: letzter Admin entfernt'; end if;
  select count(*) into n from public.docs where coll = 'geheim'; if n <> 1 then raise exception '15: Admin sieht vertraulich nicht'; end if;

  raise exception 'ALLE RECHTE-TESTS OK';
end $$;
