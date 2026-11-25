/* NEXUS HERMES · Speicher
 * Verbindet die Seite mit Supabase. Die Seite arbeitet mit Pfaden wie
 * „besprechungen/b1“; hier wird daraus eine Zeile in der Tabelle docs
 * (coll, id, daten) bzw. in der Tabelle konten.
 *   konten/<uid>            -> Tabelle konten
 *   data/users/<uid>/<k>    -> docs, coll = „privat:<uid>“ (nur die Person selbst)
 *   <coll>/<id>             -> docs
 * Neue Daten kommen live über Supabase Realtime; alle 30 Sekunden und beim
 * Zurückkehren in den Tab wird zusätzlich nachgeladen.
 */
(function (root) {
  'use strict';

  function zielDoc(pfad) {
    var t = pfad.split('/');
    if (t[0] === 'data' && t[1] === 'users') return { tab: 'docs', coll: 'privat:' + t[2], id: t[3] };
    if (t[0] === 'konten') return { tab: 'konten', id: t[1] };
    return { tab: 'docs', coll: t[0], id: t[1] };
  }
  function zielColl(pfad) {
    var t = pfad.split('/');
    if (t[0] === 'data' && t[1] === 'users') return { tab: 'docs', coll: 'privat:' + t[2] };
    if (pfad === 'konten') return { tab: 'konten' };
    return { tab: 'docs', coll: pfad };
  }
  function fehlerCode(e) {
    var c = e && (e.code || '');
    if (c === '42501' || /row-level security|permission/i.test((e && e.message) || '')) return 'invalid_argument';
    return 'unavailable';
  }

  function Speicher(sb) {
    var hoerer = [];

    function holen(z) {
      if (z.tab === 'konten') {
        return sb.from('konten').select('uid,email,ma,freigegeben,admin').then(function (r) {
          if (r.error) throw r.error;
          return r.data.map(function (x) { return { id: x.uid, data: { ma: x.ma, email: x.email, freigegeben: x.freigegeben, admin: x.admin } }; });
        });
      }
      return sb.from('docs').select('id,daten').eq('coll', z.coll).then(function (r) {
        if (r.error) throw r.error;
        return r.data.map(function (x) { return { id: x.id, data: x.daten }; });
      });
    }
    function snapDoc(id, row) { return { id: id, exists: !!row, data: function () { return row ? row.data : undefined; }, metadata: { fromCache: false } }; }
    function laden(h) {
      holen(h.z).then(function (rows) {
        if (h.id) h.fn(snapDoc(h.id, rows.find(function (r) { return r.id === h.id; })));
        else h.fn({ docs: rows.map(function (r) { return snapDoc(r.id, r); }), metadata: { fromCache: false } });
      }, function (e) { if (h.err) h.err({ code: fehlerCode(e), message: e.message }); });
    }
    function bald(liste) {
      liste.forEach(function (h) { clearTimeout(h.t); h.t = setTimeout(function () { laden(h); }, 150); });
    }
    function abonnieren(z, id, fn, err) {
      var h = { z: z, id: id, fn: fn, err: err };
      hoerer.push(h); laden(h);
      return function () { hoerer = hoerer.filter(function (x) { return x !== h; }); };
    }

    sb.channel('hermes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, function (p) {
        var c = (p.new && p.new.coll) || (p.old && p.old.coll);
        bald(hoerer.filter(function (h) { return h.z.tab === 'docs' && (!c || h.z.coll === c); }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'konten' }, function () {
        bald(hoerer.filter(function (h) { return h.z.tab === 'konten'; }));
      })
      .subscribe();
    setInterval(function () { bald(hoerer); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) bald(hoerer); });

    function ergebnis(r) { if (r.error) throw { code: fehlerCode(r.error), message: r.error.message }; }

    return {
      doc: function (pfad) {
        var z = zielDoc(pfad);
        return {
          set: function (d) {
            if (z.tab === 'konten') {
              var felder = {};
              ['ma', 'freigegeben', 'admin'].forEach(function (k) { if (k in d) felder[k] = d[k]; });
              return sb.from('konten').update(felder).eq('uid', z.id).then(ergebnis);
            }
            return sb.from('docs').upsert({ coll: z.coll, id: z.id, daten: d }).then(ergebnis);
          },
          delete: function () {
            if (z.tab === 'konten') return sb.from('konten').delete().eq('uid', z.id).then(ergebnis);
            return sb.from('docs').delete().eq('coll', z.coll).eq('id', z.id).then(ergebnis);
          },
          onSnapshot: function (fn, err) { return abonnieren(z, z.id, fn, err); }
        };
      },
      collection: function (pfad) {
        var z = zielColl(pfad);
        return { onSnapshot: function (fn, err) { return abonnieren(z, null, fn, err); } };
      }
    };
  }

  // Fotos in den Speicher-Bereich „fotos“ hochladen.
  function Fotos(sb, uid) {
    return {
      upload: function (blob) {
        var pfad = uid + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.jpg';
        return sb.storage.from('fotos').upload(pfad, blob, { contentType: blob.type || 'image/jpeg' }).then(function (r) {
          if (r.error) throw r.error;
          return { url: sb.storage.from('fotos').getPublicUrl(pfad).data.publicUrl };
        });
      }
    };
  }

  var api = { Speicher: Speicher, Fotos: Fotos, zielDoc: zielDoc, zielColl: zielColl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HermesSpeicher = api;
})(this);
