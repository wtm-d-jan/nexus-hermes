/* NEXUS HERMES · Fachlogik
 * Reine Funktionen ohne Oberfläche und ohne Datenbank. Die Seite (index.html)
 * und die Tests (test/logik.test.js) benutzen genau dieselben Funktionen.
 *
 * Begriffe:
 *   stamm   = Stammdaten: abteilungen, arten, rollen, mitarbeiter
 *   ctx     = wer gerade schaut: { me: Mitarbeiter-ID, admin: true/false, stamm }
 *   b       = eine Besprechung, a = eine Aufgabe
 */
(function (root) {
  'use strict';

  // ---------- Rechte ----------

  // Die Rechte, die eine Rolle haben kann. „Verwalten“ und „Vertrauliches sehen“
  // sind keine Rollenrechte mehr: das darf, wer im Teilen-Menü Bearbeiter ist.
  var PERMS = [
    ['bsp', 'Besprechungen sehen', 'bsp'],
    ['aufgEdit', 'Aufgaben vergeben an', 'aufg'],
    ['anlegen', 'Besprechungen anlegen und leiten', 'jn'],
    ['tlrunde', 'Automatisch in der Teamleiterbesprechung', 'jn']
  ];
  var POPT = {
    bsp: [['alle', 'alle'], ['abteilung', 'eigene Abteilung'], ['teilgenommen', 'nur als Teilnehmer']],
    aufg: [['alle', 'alle'], ['abteilung', 'eigene Abteilung'], ['eigene', 'nur sich selbst']],
    jn: [['ja', 'ja'], ['nein', 'nein']]
  };
  var ADMIN_P = { bsp: 'alle', aufgEdit: 'alle', anlegen: 'ja', tlrunde: 'ja' };

  var DEFAULT_ROLLEN = [
    { id: 'gf', name: 'Geschäftsführer', p: { bsp: 'alle', aufgEdit: 'alle', anlegen: 'ja', tlrunde: 'ja' } },
    { id: 'pk', name: 'Prokurist', p: { bsp: 'alle', aufgEdit: 'alle', anlegen: 'ja', tlrunde: 'ja' } },
    { id: 'tl', name: 'Teamleiter', p: { bsp: 'teilgenommen', aufgEdit: 'abteilung', anlegen: 'nein', tlrunde: 'ja' } },
    { id: 'ma', name: 'Mitarbeiter', p: { bsp: 'teilgenommen', aufgEdit: 'eigene', anlegen: 'nein', tlrunde: 'nein' } }
  ];

  var DEFAULT_ARTEN = [
    { name: 'Teamleiterbesprechung', tn: 'teamleiter', themen: ['Offene Aufgaben aus letzter Runde', 'Auslastung und Termine', 'Personal', 'Reklamationen und Service', 'Offene Angebote und Aufträge', 'Sonstiges'] },
    { name: 'Abteilungsbesprechung', tn: 'abteilung', themen: ['Offene Aufgaben aus letzter Runde', 'Auslastung und Einteilung', 'Probleme und Material', 'Sonstiges'] },
    { name: 'Verkaufsleitergespräch', tn: 'fest', fest: [], themen: ['Offene Angebote', 'Auftragseingang', 'Kunden und Projekte', 'Marketing', 'Sonstiges'] },
    { name: 'Mitarbeitergespräch', tn: 'person', themen: ['Was läuft gut', 'Was läuft nicht gut', 'Ziele und Vereinbarungen'] },
    { name: 'Projektbesprechung', tn: 'frei', themen: [] },
    { name: 'Eigene Notiz', tn: 'keine', themen: [] }
  ];

  // Arten, die standardmäßig vertraulich angelegt werden.
  function vertraulichVorbelegt(art) { return art.tn === 'person' || art.tn === 'keine'; }

  function kopie(x) { return JSON.parse(JSON.stringify(x)); }

  function defaultStamm(abteilungen, mitarbeiter) {
    return {
      abteilungen: (abteilungen || []).slice(),
      arten: kopie(DEFAULT_ARTEN),
      rollen: kopie(DEFAULT_ROLLEN),
      mitarbeiter: kopie(mitarbeiter || [])
    };
  }

  function ma(stamm, id) {
    return (stamm.mitarbeiter || []).find(function (m) { return m.id === id; }) || null;
  }
  function rolle(stamm, id) {
    var r = stamm.rollen || [];
    return r.find(function (x) { return x.id === id; }) || r[r.length - 1] || { id: '', name: '', p: {} };
  }
  function rechte(ctx) {
    if (ctx.admin) return ADMIN_P;
    var m = ma(ctx.stamm, ctx.me);
    return m ? rolle(ctx.stamm, m.rolle).p : { bsp: 'teilgenommen', aufgEdit: 'eigene', anlegen: 'nein', tlrunde: 'nein' };
  }
  function darf(ctx, k) { return rechte(ctx)[k] === 'ja'; }
  // Leitung = wer Besprechungen leiten darf (GF, Prokurist).
  function istLeitung(stamm, id) {
    var m = ma(stamm, id);
    return !!(m && rolle(stamm, m.rolle).p.anlegen === 'ja');
  }
  function meineAbt(ctx) { var m = ma(ctx.stamm, ctx.me); return m ? m.abt : null; }

  // ---------- Namen und Daten ----------

  // „Max Beispiel“ -> „M. Beispiel“; Namen mit Kürzel bleiben, wie sie sind.
  function kz(n) {
    if (!n) return '';
    var p = String(n).trim().split(/\s+/);
    if (p.length < 2 || /\.$/.test(p[0])) return String(n).trim();
    return p[0].charAt(0) + '. ' + p.slice(1).join(' ');
  }
  function name(stamm, id) { var m = ma(stamm, id); return m ? m.name : (id ? 'ehemalig' : ''); }
  function de(d) { if (!d) return ''; var p = String(d).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : ''; }
  function isoTag(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function stLabel(s) {
    return { offen: 'offen', inarbeit: 'in Arbeit', erledigt: 'erledigt', geplant: 'geplant', laeuft: 'läuft', abgeschlossen: 'abgeschlossen' }[s] || s;
  }

  // ---------- Sichtbarkeit ----------

  function nimmtTeil(b, id) { return Object.prototype.hasOwnProperty.call(b.teilnehmer || {}, id); }

  function kannSehen(b, ctx) {
    if (ctx.admin) return true;
    if (b.vertraulich) return false; // liegt ohnehin nur für Bearbeiter lesbar in der Datenbank
    if (b.ersteller === ctx.me || nimmtTeil(b, ctx.me)) return true;
    // Besprechungen der Leitung sieht nur, wer dabei war.
    if (b.ersteller && istLeitung(ctx.stamm, b.ersteller)) return false;
    var sc = rechte(ctx).bsp;
    if (sc === 'alle') return true;
    if (sc === 'abteilung') {
      var abt = meineAbt(ctx);
      if (!abt) return false;
      if (b.abteilung) return b.abteilung === abt;
      return Object.keys(b.teilnehmer || {}).some(function (id) {
        var m = ma(ctx.stamm, id);
        return m && m.abt === abt && !istLeitung(ctx.stamm, id);
      });
    }
    return false;
  }

  function beteiligt(a, id) { return a.wer === id || a.von === id || (a.mit || []).indexOf(id) >= 0; }
  function aufgabeSichtbar(a, ctx) { return ctx.admin || beteiligt(a, ctx.me); }
  function kannStatusAendern(a, ctx) { return ctx.admin || beteiligt(a, ctx.me); }

  // An wen darf ich Aufgaben vergeben?
  function vergebbarAn(ctx) {
    var sc = ctx.admin || darf(ctx, 'anlegen') ? 'alle' : rechte(ctx).aufgEdit;
    var abt = meineAbt(ctx);
    return (ctx.stamm.mitarbeiter || []).filter(function (m) {
      if (m.id === ctx.me) return true;
      if (!ctx.admin && !darf(ctx, 'anlegen') && istLeitung(ctx.stamm, m.id)) return false;
      if (sc === 'alle') return true;
      if (sc === 'abteilung') return !!abt && m.abt === abt;
      return false;
    }).map(function (m) { return m.id; });
  }

  // ---------- Besprechungen ----------

  function autoTeilnehmer(stamm, artName, abt, person, me) {
    var d = artDef(stamm, artName), r = [me];
    if (d.tn === 'teamleiter') {
      r = r.concat(stamm.mitarbeiter.filter(function (m) { return rolle(stamm, m.rolle).p.tlrunde === 'ja'; }).map(function (m) { return m.id; }));
    } else if (d.tn === 'abteilung') {
      r = r.concat(stamm.mitarbeiter.filter(function (m) { return m.abt === abt; }).map(function (m) { return m.id; }));
    } else if (d.tn === 'fest') {
      r = r.concat(d.fest || []);
    } else if (d.tn === 'person') {
      r.push(person);
    }
    var o = {};
    r.forEach(function (id) { if (id && ma(stamm, id)) o[id] = ''; });
    return o;
  }

  function artDef(stamm, n) {
    return (stamm.arten || []).find(function (a) { return a.name === n; }) || { name: n, tn: 'frei', themen: [] };
  }

  function neueBesprechung(o) {
    // o: { id, stamm, art, abteilung, person, titel, datum, vertraulich, me, neueId }
    var d = artDef(o.stamm, o.art);
    var b = {
      id: o.id, ersteller: o.me, art: d.name, abteilung: d.tn === 'abteilung' ? (o.abteilung || '') : '',
      titel: o.titel || (d.tn === 'person' && o.person ? name(o.stamm, o.person) : ''),
      datum: o.datum, ort: '', status: 'geplant', vertraulich: !!o.vertraulich,
      teilnehmer: autoTeilnehmer(o.stamm, d.name, o.abteilung, o.person, o.me),
      themen: [], folgetermin: ''
    };
    (d.themen || []).forEach(function (t) { b.themen.push(neuesThema(o.neueId(), t)); });
    if (!b.themen.length) b.themen.push(neuesThema(o.neueId(), ''));
    return b;
  }
  function neuesThema(id, titel) { return { id: id, titel: titel || '', notiz: '', beschluesse: [] }; }

  // Folgetermin: gleiche Art, Abteilung, Teilnehmer und Vertraulichkeit, Datum = Folgetermin.
  function folgeBesprechung(b, o) {
    var n = neueBesprechung({ id: o.id, stamm: o.stamm, art: b.art, abteilung: b.abteilung, person: null,
      titel: b.titel, datum: b.folgetermin || o.heute, vertraulich: b.vertraulich, me: o.me, neueId: o.neueId });
    n.teilnehmer = {};
    Object.keys(b.teilnehmer || {}).forEach(function (id) { if (ma(o.stamm, id)) n.teilnehmer[id] = ''; });
    n.vorgaenger = b.id;
    return n;
  }

  function aufgabenDer(b, aufgaben) {
    return aufgaben.filter(function (a) { return a.besprechung === b.id && !a.archiv; });
  }

  // Offene Aufgaben aus früheren Besprechungen derselben Art (und Abteilung).
  function offeneAusFrueheren(b, besprechungen, aufgaben) {
    var frueher = {};
    besprechungen.forEach(function (x) {
      if (x.id !== b.id && x.art === b.art && (x.abteilung || '') === (b.abteilung || '') && x.datum <= b.datum) frueher[x.id] = x;
    });
    return aufgaben.filter(function (a) {
      return frueher[a.besprechung] && a.text && !a.archiv && a.status !== 'erledigt';
    });
  }

  // Was verhindert den Abschluss? fehler blockieren, hinweise nicht.
  function abschlussPruefen(b, aufgaben) {
    var fehler = [], hinweise = [];
    aufgabenDer(b, aufgaben).forEach(function (a) {
      if (!a.text) return;
      if (!a.wer) fehler.push('„' + a.text + '“ hat niemanden, der verantwortlich ist');
      if (!a.faellig) fehler.push('„' + a.text + '“ hat kein Fälligkeitsdatum');
    });
    var tn = Object.keys(b.teilnehmer || {});
    if (tn.length > 1 && !tn.some(function (k) { return b.teilnehmer[k] === 'a'; })) hinweise.push('Niemand ist als anwesend markiert');
    if (!b.themen.some(function (t) { return (t.notiz || '').trim() || t.beschluesse.some(function (d) { return d.text; }); }) && !aufgabenDer(b, aufgaben).some(function (a) { return a.text; })) hinweise.push('Es steht noch nichts im Protokoll');
    return { fehler: fehler, hinweise: hinweise };
  }

  // Protokoll als Text. Hängt nicht davon ab, wer es erzeugt.
  function protokoll(b, aufgaben, stamm) {
    var L = [], n = function (id) { return name(stamm, id); };
    L.push('PROTOKOLL ' + b.art.toUpperCase() + (b.abteilung ? ' ' + b.abteilung.toUpperCase() : ''));
    L.push((b.titel ? b.titel + ' · ' : '') + de(b.datum) + (b.ort ? ' · ' + b.ort : ''));
    var an = [], ent = [];
    Object.keys(b.teilnehmer || {}).forEach(function (id) {
      if (b.teilnehmer[id] === 'a') an.push(n(id));
      if (b.teilnehmer[id] === 'e') ent.push(n(id));
    });
    L.push('Anwesend: ' + (an.join(', ') || '–'));
    if (ent.length) L.push('Entschuldigt: ' + ent.join(', '));
    L.push('');
    var eigene = aufgabenDer(b, aufgaben).filter(function (a) { return a.text; });
    b.themen.forEach(function (t, i) {
      L.push((i + 1) + '. ' + (t.titel || '(ohne Titel)'));
      if (t.notiz) t.notiz.split('\n').forEach(function (z) { L.push('   ' + z); });
      t.beschluesse.filter(function (d) { return d.text; }).forEach(function (d) { L.push('   Beschluss: ' + d.text); });
      eigene.filter(function (a) { return a.thema === t.id; }).forEach(function (a) {
        L.push('   Aufgabe: ' + a.text + ' | ' + (a.wer ? n(a.wer) : 'NIEMAND ZUGEORDNET') + ' | bis ' + (a.faellig ? de(a.faellig) : 'OHNE DATUM'));
      });
      L.push('');
    });
    if (eigene.length) {
      L.push('AUFGABENLISTE');
      eigene.slice().sort(function (x, y) { return n(x.wer).localeCompare(n(y.wer)) || (x.faellig || '').localeCompare(y.faellig || ''); })
        .forEach(function (a) { L.push('- ' + (a.wer ? n(a.wer) : '?') + ': ' + a.text + ' (bis ' + (a.faellig ? de(a.faellig) : '?') + ')'); });
    }
    if (b.folgetermin) L.push('', 'Nächste Besprechung: ' + de(b.folgetermin));
    return L.join('\n');
  }

  // ---------- Aufgaben ----------

  function ueberfaellig(a, heute) { return a.status !== 'erledigt' && !a.archiv && !!a.faellig && a.faellig < heute; }

  // Filter: aktiv (offen + in Arbeit), offen, inarbeit, erledigt, archiv, alle
  function passtFilter(a, f) {
    if (a.archiv) return f === 'archiv';
    if (f === 'archiv') return false;
    if (f === 'alle') return true;
    if (f === 'aktiv') return a.status !== 'erledigt';
    return a.status === f;
  }

  function statusSetzen(a, neu, me, zeit) {
    var x = kopie(a);
    x.status = neu;
    x.erledigtAm = neu === 'erledigt' ? zeit.slice(0, 10) : '';
    x.verlauf = (x.verlauf || []).concat([{ id: 's' + zeit.replace(/\D/g, '') + Math.random().toString(36).slice(2, 5), von: me, zeit: zeit, text: 'Status: ' + stLabel(neu), sys: true }]);
    return x;
  }

  // Sortiert: überfällige zuerst, dann nach Fälligkeit, ohne Datum zuletzt.
  function sortiereAufgaben(list, heute) {
    return list.slice().sort(function (x, y) {
      var ox = ueberfaellig(x, heute) ? 0 : 1, oy = ueberfaellig(y, heute) ? 0 : 1;
      if (ox !== oy) return ox - oy;
      return (x.faellig || '9999').localeCompare(y.faellig || '9999');
    });
  }

  function zaehler(aufgaben, me, heute) {
    var mine = aufgaben.filter(function (a) { return a.text && !a.archiv && a.status !== 'erledigt' && (a.wer === me || (a.mit || []).indexOf(me) >= 0); });
    return { offen: mine.length, ueberfaellig: mine.filter(function (a) { return ueberfaellig(a, heute); }).length };
  }

  // ---------- Stammdaten ändern ----------

  // Mitarbeiter darf nur entfernt werden, wenn keine offene Aufgabe an ihm hängt.
  function entfernenBlockiert(id, aufgaben) {
    return aufgaben.filter(function (a) { return a.wer === id && a.text && !a.archiv && a.status !== 'erledigt'; }).length;
  }

  // Wer ist mit welchem Konto verknüpft? Liefert { maId: uid } und Doppelbelegungen.
  function kontenUebersicht(konten) {
    var proMa = {}, doppelt = [];
    Object.keys(konten || {}).forEach(function (uid) {
      var m = konten[uid] && konten[uid].ma;
      if (!m) return;
      if (proMa[m]) doppelt.push(m); else proMa[m] = uid;
    });
    return { proMa: proMa, doppelt: doppelt };
  }

  // Liste aus dem Einrichten-Feld: „Name; Abteilung; Rolle“ pro Zeile.
  // Doppelte Namen und leere Zeilen fallen weg, unbekannte Rollen werden „ma“.
  function mitarbeiterAusText(text, abteilungen) {
    var gesehen = {}, rollen = ['gf', 'pk', 'tl', 'ma'];
    return String(text || '').split(/\r?\n/).map(function (z) {
      var p = z.split(';').map(function (s) { return s.trim(); });
      if (!p[0] || gesehen[p[0]]) return null;
      gesehen[p[0]] = 1;
      var r = (p[2] || 'ma').toLowerCase();
      return { name: p[0], abt: p[1] || (abteilungen && abteilungen[0]) || '', rolle: rollen.indexOf(r) >= 0 ? r : 'ma' };
    }).filter(Boolean);
  }

  var L = {
    mitarbeiterAusText: mitarbeiterAusText,
    PERMS: PERMS, POPT: POPT, DEFAULT_ROLLEN: DEFAULT_ROLLEN, DEFAULT_ARTEN: DEFAULT_ARTEN,
    defaultStamm: defaultStamm, kopie: kopie, ma: ma, rolle: rolle, rechte: rechte, darf: darf,
    istLeitung: istLeitung, kz: kz, name: name, de: de, isoTag: isoTag, stLabel: stLabel,
    nimmtTeil: nimmtTeil, kannSehen: kannSehen, beteiligt: beteiligt, aufgabeSichtbar: aufgabeSichtbar,
    kannStatusAendern: kannStatusAendern, vergebbarAn: vergebbarAn, autoTeilnehmer: autoTeilnehmer,
    artDef: artDef, vertraulichVorbelegt: vertraulichVorbelegt, neueBesprechung: neueBesprechung,
    neuesThema: neuesThema, folgeBesprechung: folgeBesprechung, aufgabenDer: aufgabenDer,
    offeneAusFrueheren: offeneAusFrueheren, abschlussPruefen: abschlussPruefen, protokoll: protokoll,
    ueberfaellig: ueberfaellig, passtFilter: passtFilter, statusSetzen: statusSetzen,
    sortiereAufgaben: sortiereAufgaben, zaehler: zaehler, entfernenBlockiert: entfernenBlockiert,
    kontenUebersicht: kontenUebersicht
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else root.HermesLogik = L;
})(this);
