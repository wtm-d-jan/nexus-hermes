// Tests für die Fachlogik von NEXUS HERMES.
// Ausführen im Ordner hermes:  node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logik.js');

// Kleine Beispielfirma
const stamm = L.defaultStamm(['Geschäftsführung', 'Vertrieb', 'Service'], [
  { id: 'gf', name: 'Greta Chef', abt: 'Geschäftsführung', rolle: 'gf' },
  { id: 'vl', name: 'Viktor Verkauf', abt: 'Vertrieb', rolle: 'tl' },
  { id: 'v1', name: 'Fred Vertrieb', abt: 'Vertrieb', rolle: 'ma' },
  { id: 'sl', name: 'Sina Service', abt: 'Service', rolle: 'tl' },
  { id: 's1', name: 'Max Monteur', abt: 'Service', rolle: 'ma' }
]);
stamm.arten.find(a => a.name === 'Verkaufsleitergespräch').fest = ['vl'];

const ctx = (me, admin = false) => ({ me, admin, stamm });
let n = 0;
const neueId = () => 'x' + (++n);
const heute = '2026-11-23';

function besprechung(over = {}) {
  return Object.assign(L.neueBesprechung({ id: 'B1', stamm, art: 'Abteilungsbesprechung', abteilung: 'Vertrieb',
    datum: '2026-11-20', me: 'gf', neueId }), over);
}
function aufgabe(over = {}) {
  return Object.assign({ id: 'a' + (++n), text: 'Angebot nachfassen', wer: 'v1', von: 'gf', mit: [], faellig: '2026-11-30',
    status: 'offen', besprechung: 'B1', thema: '', archiv: null }, over);
}

test('Kurznamen', () => {
  assert.equal(L.kz('Viktor Verkauf'), 'V. Verkauf');
  assert.equal(L.kz('Y. Muster'), 'Y. Muster');
  assert.equal(L.kz('Pia'), 'Pia');
  assert.equal(L.kz(''), '');
});

test('Datum deutsch', () => {
  assert.equal(L.de('2026-11-03'), '03.11.2026');
  assert.equal(L.de('2026-11-03 14:05'), '03.11.2026');
  assert.equal(L.de(''), '');
});

test('Teilnehmer werden je nach Art automatisch eingetragen', () => {
  assert.deepEqual(Object.keys(L.autoTeilnehmer(stamm, 'Teamleiterbesprechung', '', null, 'gf')).sort(), ['gf', 'sl', 'vl']);
  assert.deepEqual(Object.keys(L.autoTeilnehmer(stamm, 'Abteilungsbesprechung', 'Service', null, 'gf')).sort(), ['gf', 's1', 'sl']);
  assert.deepEqual(Object.keys(L.autoTeilnehmer(stamm, 'Verkaufsleitergespräch', '', null, 'gf')).sort(), ['gf', 'vl']);
  assert.deepEqual(Object.keys(L.autoTeilnehmer(stamm, 'Mitarbeitergespräch', '', 's1', 'gf')).sort(), ['gf', 's1']);
  assert.deepEqual(Object.keys(L.autoTeilnehmer(stamm, 'Eigene Notiz', '', null, 'gf')), ['gf']);
});

test('Neue Besprechung übernimmt die Themenvorlage', () => {
  const b = besprechung();
  assert.equal(b.themen.length, 4);
  assert.equal(b.themen[0].titel, 'Offene Aufgaben aus letzter Runde');
  assert.equal(b.status, 'geplant');
  assert.equal(b.abteilung, 'Vertrieb');
});

test('Besprechung ohne Vorlage bekommt ein leeres Thema', () => {
  const b = L.neueBesprechung({ id: 'B9', stamm, art: 'Projektbesprechung', datum: heute, me: 'gf', neueId });
  assert.equal(b.themen.length, 1);
  assert.equal(b.abteilung, '');
});

test('Mitarbeitergespräch heißt nach der Person', () => {
  const b = L.neueBesprechung({ id: 'B9', stamm, art: 'Mitarbeitergespräch', person: 's1', datum: heute, me: 'gf', neueId });
  assert.equal(b.titel, 'Max Monteur');
});

test('Sichtbarkeit: Teilnehmer sehen, Fremde nicht, Bearbeiter alles', () => {
  const b = besprechung(); // Vertrieb, Ersteller GF
  assert.equal(L.kannSehen(b, ctx('v1')), true, 'Teilnehmer');
  assert.equal(L.kannSehen(b, ctx('s1')), false, 'andere Abteilung');
  assert.equal(L.kannSehen(b, ctx('s1', true)), true, 'Bearbeiter sieht alles');
});

test('Vertrauliche Besprechung sehen nur Bearbeiter, auch nicht Teilnehmer', () => {
  const b = besprechung({ vertraulich: true });
  assert.equal(L.kannSehen(b, ctx('v1')), false);
  assert.equal(L.kannSehen(b, ctx('gf', true)), true);
});

test('Besprechung der Leitung sieht ein Teamleiter mit Recht „alle“ nur als Teilnehmer', () => {
  const s = L.kopie(stamm);
  s.rollen.find(r => r.id === 'tl').p.bsp = 'alle';
  const b = besprechung({ teilnehmer: { gf: '' } });
  assert.equal(L.kannSehen(b, { me: 'sl', admin: false, stamm: s }), false);
  const b2 = besprechung({ ersteller: 'vl', teilnehmer: { vl: '' } });
  assert.equal(L.kannSehen(b2, { me: 'sl', admin: false, stamm: s }), true);
});

test('Recht „eigene Abteilung“', () => {
  const s = L.kopie(stamm);
  s.rollen.find(r => r.id === 'tl').p.bsp = 'abteilung';
  const b = besprechung({ ersteller: 'vl', teilnehmer: { vl: '', v1: '' } });
  assert.equal(L.kannSehen(b, { me: 'vl', admin: false, stamm: s }), true);
  const b2 = besprechung({ ersteller: 'sl', abteilung: 'Service', teilnehmer: { sl: '' } });
  assert.equal(L.kannSehen(b2, { me: 'vl', admin: false, stamm: s }), false);
});

test('Aufgaben sieht nur, wer beteiligt ist', () => {
  const a = aufgabe({ wer: 'v1', von: 'gf', mit: ['s1'] });
  assert.equal(L.aufgabeSichtbar(a, ctx('v1')), true);
  assert.equal(L.aufgabeSichtbar(a, ctx('s1')), true, 'beteiligt');
  assert.equal(L.aufgabeSichtbar(a, ctx('sl')), false);
  assert.equal(L.aufgabeSichtbar(a, ctx('sl', true)), true);
});

test('Aufgaben vergeben: Mitarbeiter nur an sich, Teamleiter an die Abteilung, nie an die Leitung', () => {
  assert.deepEqual(L.vergebbarAn(ctx('v1')), ['v1']);
  assert.deepEqual(L.vergebbarAn(ctx('vl')).sort(), ['v1', 'vl']);
  assert.ok(L.vergebbarAn(ctx('gf')).includes('s1'));
  assert.ok(!L.vergebbarAn(ctx('vl')).includes('gf'));
});

test('Offene Aufgaben aus früheren Runden derselben Art und Abteilung', () => {
  const alt = besprechung({ id: 'B0', datum: '2026-11-13' });
  const andere = besprechung({ id: 'BX', datum: '2026-11-13', abteilung: 'Service' });
  const neu = besprechung({ id: 'B1', datum: '2026-11-20' });
  const a1 = aufgabe({ besprechung: 'B0' });
  const a2 = aufgabe({ besprechung: 'B0', status: 'erledigt' });
  const a3 = aufgabe({ besprechung: 'BX' });
  const a4 = aufgabe({ besprechung: 'B0', archiv: { am: heute, von: 'gf' } });
  const r = L.offeneAusFrueheren(neu, [alt, andere, neu], [a1, a2, a3, a4]);
  assert.deepEqual(r.map(a => a.id), [a1.id]);
});

test('Abschluss braucht bei jeder Aufgabe Verantwortlichen und Datum', () => {
  const b = besprechung();
  const ok = L.abschlussPruefen(b, [aufgabe()]);
  assert.equal(ok.fehler.length, 0);
  const schlecht = L.abschlussPruefen(b, [aufgabe({ wer: '', faellig: '' })]);
  assert.equal(schlecht.fehler.length, 2);
  // leere Zeilen zählen nicht
  assert.equal(L.abschlussPruefen(b, [aufgabe({ text: '', wer: '' })]).fehler.length, 0);
});

test('Abschluss weist auf fehlende Anwesenheit hin, blockiert aber nicht', () => {
  const b = besprechung();
  const r = L.abschlussPruefen(b, [aufgabe()]);
  assert.ok(r.hinweise.some(h => h.includes('anwesend')));
  b.teilnehmer.v1 = 'a';
  assert.ok(!L.abschlussPruefen(b, [aufgabe()]).hinweise.some(h => h.includes('anwesend')));
});

test('Protokoll enthält Anwesende, Beschlüsse und alle Aufgaben, unabhängig vom Betrachter', () => {
  const b = besprechung();
  b.teilnehmer.v1 = 'a'; b.teilnehmer.vl = 'e';
  b.themen[0].notiz = 'Zeile eins\nZeile zwei';
  b.themen[0].beschluesse.push({ id: 'd1', text: 'Kredit nicht annehmen' });
  b.folgetermin = '2026-11-27';
  const a = aufgabe({ thema: b.themen[0].id, wer: 'v1', faellig: '2026-11-30' });
  const archiviert = aufgabe({ thema: b.themen[0].id, text: 'weg', archiv: { am: heute, von: 'gf' } });
  const p = L.protokoll(b, [a, archiviert], stamm);
  assert.match(p, /^PROTOKOLL ABTEILUNGSBESPRECHUNG VERTRIEB/);
  assert.match(p, /Anwesend: Fred Vertrieb/);
  assert.match(p, /Entschuldigt: Viktor Verkauf/);
  assert.match(p, /   Zeile zwei/);
  assert.match(p, /Beschluss: Kredit nicht annehmen/);
  assert.match(p, /Aufgabe: Angebot nachfassen \| Fred Vertrieb \| bis 30\.11\.2026/);
  assert.match(p, /Nächste Besprechung: 27\.11\.2026/);
  assert.doesNotMatch(p, /weg/);
});

test('Folgebesprechung übernimmt Art, Teilnehmer und Datum', () => {
  const b = besprechung({ folgetermin: '2026-11-27', vertraulich: true });
  b.teilnehmer.v1 = 'a';
  const f = L.folgeBesprechung(b, { id: 'B2', stamm, me: 'gf', heute, neueId });
  assert.equal(f.datum, '2026-11-27');
  assert.equal(f.art, b.art);
  assert.equal(f.abteilung, 'Vertrieb');
  assert.equal(f.vertraulich, true);
  assert.equal(f.vorgaenger, 'B1');
  assert.deepEqual(Object.keys(f.teilnehmer).sort(), Object.keys(b.teilnehmer).sort());
  assert.ok(Object.values(f.teilnehmer).every(v => v === ''), 'Anwesenheit beginnt neu');
});

test('Überfällig und Filter', () => {
  assert.equal(L.ueberfaellig(aufgabe({ faellig: '2026-11-22' }), heute), true);
  assert.equal(L.ueberfaellig(aufgabe({ faellig: '2026-11-23' }), heute), false);
  assert.equal(L.ueberfaellig(aufgabe({ faellig: '2026-11-22', status: 'erledigt' }), heute), false);
  assert.equal(L.ueberfaellig(aufgabe({ faellig: '' }), heute), false);
  const arch = aufgabe({ archiv: { am: heute } });
  assert.equal(L.passtFilter(arch, 'alle'), false);
  assert.equal(L.passtFilter(arch, 'archiv'), true);
  assert.equal(L.passtFilter(aufgabe({ status: 'inarbeit' }), 'aktiv'), true);
  assert.equal(L.passtFilter(aufgabe({ status: 'erledigt' }), 'aktiv'), false);
});

test('Status ändern schreibt Verlauf und Erledigt-Datum, Original bleibt unverändert', () => {
  const a = aufgabe();
  const b = L.statusSetzen(a, 'erledigt', 'v1', '2026-11-23 10:15');
  assert.equal(b.status, 'erledigt');
  assert.equal(b.erledigtAm, '2026-11-23');
  assert.equal(b.verlauf.length, 1);
  assert.equal(b.verlauf[0].sys, true);
  assert.equal(a.status, 'offen');
  assert.equal(L.statusSetzen(b, 'offen', 'v1', '2026-11-23 10:16').erledigtAm, '');
});

test('Sortierung: überfällig zuerst, ohne Datum zuletzt', () => {
  const r = L.sortiereAufgaben([
    aufgabe({ id: 'ohne', faellig: '' }),
    aufgabe({ id: 'spaet', faellig: '2026-12-10' }),
    aufgabe({ id: 'ueber', faellig: '2026-11-01' }),
    aufgabe({ id: 'bald', faellig: '2026-11-24' })
  ], heute);
  assert.deepEqual(r.map(a => a.id), ['ueber', 'bald', 'spaet', 'ohne']);
});

test('Zähler für „Meine Aufgaben“', () => {
  const z = L.zaehler([
    aufgabe({ wer: 'v1', faellig: '2026-11-01' }),
    aufgabe({ wer: 'v1' }),
    aufgabe({ wer: 's1', mit: ['v1'] }),
    aufgabe({ wer: 'v1', status: 'erledigt' }),
    aufgabe({ wer: 'v1', text: '' })
  ], 'v1', heute);
  assert.deepEqual(z, { offen: 3, ueberfaellig: 1 });
});

test('Mitarbeiter mit offenen Aufgaben kann nicht entfernt werden', () => {
  assert.equal(L.entfernenBlockiert('v1', [aufgabe({ wer: 'v1' })]), 1);
  assert.equal(L.entfernenBlockiert('v1', [aufgabe({ wer: 'v1', status: 'erledigt' })]), 0);
});

test('Konten: Doppelbelegung wird erkannt', () => {
  const r = L.kontenUebersicht({ u1: { ma: 'v1' }, u2: { ma: 'v1' }, u3: { ma: 's1' }, u4: {} });
  assert.equal(r.proMa.s1, 'u3');
  assert.deepEqual(r.doppelt, ['v1']);
});

test('Bearbeiter hat volle Rechte, unbekannte Person die kleinsten', () => {
  assert.equal(L.rechte(ctx('v1', true)).anlegen, 'ja');
  assert.equal(L.rechte(ctx('niemand')).bsp, 'teilgenommen');
  assert.equal(L.darf(ctx('gf'), 'anlegen'), true);
  assert.equal(L.darf(ctx('v1'), 'anlegen'), false);
});

test('Mitarbeiterliste aus dem Einrichten-Feld', () => {
  const r = L.mitarbeiterAusText('Greta Chef; Geschäftsführung; gf\n\nPia; Montage; TL\nPia; Montage; ma\nY. Muster; Service; chef\nOhne Abteilung', ['Büro']);
  assert.deepEqual(r, [
    { name: 'Greta Chef', abt: 'Geschäftsführung', rolle: 'gf' },
    { name: 'Pia', abt: 'Montage', rolle: 'tl' },
    { name: 'Y. Muster', abt: 'Service', rolle: 'ma' },
    { name: 'Ohne Abteilung', abt: 'Büro', rolle: 'ma' }
  ]);
});

test('Mitarbeiterliste auch mit Kommas und Kürzel statt Rolle', () => {
  const r = L.mitarbeiterAusText('Greta Chef, Geschäftsführung, GC\nMax Monteur,Service,tl', []);
  assert.deepEqual(r, [
    { name: 'Greta Chef', abt: 'Geschäftsführung', rolle: 'ma' },
    { name: 'Max Monteur', abt: 'Service', rolle: 'tl' }
  ]);
});
