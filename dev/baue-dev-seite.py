# Baut dev.html: index.html plus nachgebaute Datenbank, zum Testen ohne Supabase.
# Aufruf im Ordner hermes:  python3 dev/baue-dev-seite.py && python3 -m http.server 8765
s = open('index.html', encoding='utf-8').read()
s = s.replace('<script src="speicher.js" charset="utf-8"></script>',
              '<script src="speicher.js" charset="utf-8"></script>\n<script src="dev/mock-supabase.js" charset="utf-8"></script>', 1)
open('dev.html', 'w', encoding='utf-8').write(s)
print('dev.html gebaut: http://localhost:8765/dev.html?als=admin')
