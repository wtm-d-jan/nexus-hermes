// Tests für die Anbindung an Supabase (speicher.js), mit einem nachgebauten Supabase-Client.
const test = require('node:test');
const assert = require('node:assert/strict');
global.document = { addEventListener() {} };
global.setInterval = () => 0;
const S = require('../speicher.js');

test('Pfade werden auf Tabellen abgebildet', () => {
  assert.deepEqual(S.zielDoc('besprechungen/b1'), { tab: 'docs', coll: 'besprechungen', id: 'b1' });
  assert.deepEqual(S.zielDoc('konten/u1'), { tab: 'konten', id: 'u1' });
  assert.deepEqual(S.zielDoc('data/users/u1/n-b1'), { tab: 'docs', coll: 'privat:u1', id: 'n-b1' });
  assert.deepEqual(S.zielColl('data/users/u1'), { tab: 'docs', coll: 'privat:u1' });
  assert.deepEqual(S.zielColl('konten'), { tab: 'konten' });
  assert.deepEqual(S.zielColl('aufgaben'), { tab: 'docs', coll: 'aufgaben' });
});

// Fake-Client: merkt sich jeden Aufruf
function fakeSb(antwort = { data: [], error: null }) {
  const log = [];
  const kette = (tab) => {
    const k = { tab, ops: [] };
    const p = new Proxy(k, {
      get(t, name) {
        if (name === 'then') return (ok, err) => { log.push(k); return Promise.resolve(antwort).then(ok, err); };
        return (...args) => { k.ops.push([name, ...args]); return p; };
      }
    });
    return p;
  };
  const chan = { on() { return chan; }, subscribe() { return chan; } };
  return { log, from: (tab) => kette(tab), channel: () => chan };
}

test('Speichern einer Besprechung ist ein upsert in docs', async () => {
  const sb = fakeSb({ error: null });
  await S.Speicher(sb).doc('besprechungen/b1').set({ titel: 'KW 48' });
  assert.equal(sb.log[0].tab, 'docs');
  assert.deepEqual(sb.log[0].ops[0], ['upsert', { coll: 'besprechungen', id: 'b1', daten: { titel: 'KW 48' } }]);
});

test('Konto ändern schreibt nur erlaubte Felder', async () => {
  const sb = fakeSb({ error: null });
  await S.Speicher(sb).doc('konten/u1').set({ ma: 'm3', email: 'x@y.de', freigegeben: true, uid: 'boese' });
  assert.equal(sb.log[0].tab, 'konten');
  assert.deepEqual(sb.log[0].ops[0], ['update', { ma: 'm3', freigegeben: true }]);
  assert.deepEqual(sb.log[0].ops[1], ['eq', 'uid', 'u1']);
});

test('Private Notiz landet in privat:<uid>', async () => {
  const sb = fakeSb({ error: null });
  await S.Speicher(sb).doc('data/users/u7/n-b1').set({ text: 'nur ich' });
  assert.deepEqual(sb.log[0].ops[0][1].coll, 'privat:u7');
});

test('Löschen trifft genau ein Dokument', async () => {
  const sb = fakeSb({ error: null });
  await S.Speicher(sb).doc('vorschlaege/v1').delete();
  assert.deepEqual(sb.log[0].ops, [['delete'], ['eq', 'coll', 'vorschlaege'], ['eq', 'id', 'v1']]);
});

test('Fehlende Rechte werden als invalid_argument gemeldet', async () => {
  const sb = fakeSb({ error: { code: '42501', message: 'new row violates row-level security policy' } });
  await assert.rejects(S.Speicher(sb).doc('geheim/g1').set({}), (e) => e.code === 'invalid_argument');
});

test('Laden liefert Dokumente wie erwartet', async () => {
  const sb = fakeSb({ data: [{ id: 'b1', daten: { titel: 'A' } }], error: null });
  const snap = await new Promise((r) => S.Speicher(sb).collection('besprechungen').onSnapshot(r));
  assert.equal(snap.docs.length, 1);
  assert.equal(snap.docs[0].id, 'b1');
  assert.deepEqual(snap.docs[0].data(), { titel: 'A' });
  assert.deepEqual(sb.log[0].ops, [['select', 'id,daten'], ['eq', 'coll', 'besprechungen']]);
});

test('Ein einzelnes fehlendes Dokument meldet exists: false', async () => {
  const sb = fakeSb({ data: [], error: null });
  const d = await new Promise((r) => S.Speicher(sb).doc('stamm/main').onSnapshot(r));
  assert.equal(d.exists, false);
});
