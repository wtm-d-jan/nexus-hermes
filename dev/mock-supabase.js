// Nur für lokale Tests (dev.html): ersetzt Supabase durch einen Speicher im Browser.
// ?als=admin  -> Admin, ?als=ma -> Mitarbeiter, ?als=neu -> noch nicht freigegeben, ?als=aus -> abgemeldet, ?leer=1 -> leere Datenbank
(function () {
  var q = new URLSearchParams(location.search), als = q.get('als') || 'admin';
  var KEY = 'hermes-mock-sb';
  var store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  if (q.get('leer')) store = {};
  if (!store['konten/u-admin']) store['konten/u-admin'] = { ma: null, email: 'chef@test.local', freigegeben: true, admin: true };
  if (!store['konten/u-ma']) store['konten/u-ma'] = { ma: null, email: 'monteur@test.local', freigegeben: true, admin: false };
  if (!store['konten/u-neu']) store['konten/u-neu'] = { ma: null, email: 'neu@test.local', freigegeben: false, admin: false };
  var subs = [];
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  function sichtbar(p) { return als === 'admin' || !/^geheim\//.test(p); }
  function snapDoc(p) { var d = store[p]; return { id: p.split('/').pop(), exists: !!d && sichtbar(p), data: function () { return d && JSON.parse(JSON.stringify(d)); }, metadata: { fromCache: false } }; }
  function collSnap(c) {
    var docs = Object.keys(store).filter(function (p) { return p.slice(0, p.lastIndexOf('/')) === c && sichtbar(p); }).map(snapDoc);
    return { docs: docs, metadata: { fromCache: false } };
  }
  function notify() { subs.forEach(function (s) { setTimeout(function () { s.fn(s.doc ? snapDoc(s.path) : collSnap(s.path)); }, 30); }); }
  var speicher = {
    doc: function (p) {
      return {
        set: function (d) { store[p] = Object.assign({}, /^konten\//.test(p) ? store[p] : {}, JSON.parse(JSON.stringify(d))); save(); notify(); return new Promise(function (r) { setTimeout(r, 40); }); },
        delete: function () { delete store[p]; save(); notify(); return Promise.resolve(); },
        onSnapshot: function (fn) { subs.push({ doc: true, path: p, fn: fn }); setTimeout(function () { fn(snapDoc(p)); }, 50); return function () {}; }
      };
    },
    collection: function (c) {
      return { onSnapshot: function (fn) { subs.push({ doc: false, path: c, fn: fn }); setTimeout(function () { fn(collSnap(c)); }, 50); return function () {}; } };
    }
  };
  window.HermesSpeicher.Speicher = function () { return speicher; };
  window.HermesSpeicher.Fotos = function () { return null; };
  var uid = 'u-' + als;
  var fake = {
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: als === 'aus' ? null : { user: { id: uid, email: (store['konten/' + uid] || {}).email || als + '@test.local' } } } }); },
      onAuthStateChange: function () {},
      signOut: function () { return Promise.resolve(); },
      signInWithPassword: function () { return Promise.resolve({ error: { message: 'Invalid login credentials' } }); },
      signUp: function () { return Promise.resolve({ data: { session: null }, error: null }); }
    },
    from: function () {
      var k = {};
      k.select = function () { return k; }; k.eq = function () { return k; }; k.insert = function () { return k; };
      k.maybeSingle = k.single = function () { var r = store['konten/' + uid]; return Promise.resolve({ data: r ? Object.assign({ uid: uid }, r) : null, error: null }); };
      return k;
    }
  };
  window.supabase = { createClient: function () { return fake; } };
  window.__mockStore = function () { return store; };
})();
