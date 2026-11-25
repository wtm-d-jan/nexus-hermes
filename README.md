# NEXUS HERMES

Besprechungen und Aufgaben für KATEC: Protokolle, Beschlüsse, Aufgaben mit Verlauf und Fotos. Eine einfache HTML-Seite auf GitHub Pages, die Daten liegen in Supabase. Beides kostet im Gratis-Tarif nichts.

## Erste Schritte

1. Seite öffnen und **„Konto anlegen“**. Das allererste Konto wird automatisch Admin, das sollte also die Geschäftsführung sein.
2. Als Admin erscheint „Einrichten“: Abteilungen prüfen, die Mitarbeiterliste einfügen (`Name; Abteilung; Rolle`, Rolle = gf, pk, tl oder ma) und auf „Einrichten“ klicken.
3. Bei „Wer bist du?“ den eigenen Namen wählen.
4. Den Link an die Mitarbeiter schicken. Wer ein Konto anlegt, sieht erst etwas, wenn ein Admin ihn unter **Team → Konten** freigibt. Dort ordnet man auch gleich den Namen zu.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Die Seite: Oberfläche und Bedienung |
| `logik.js` | Fachlogik ohne Oberfläche: wer sieht was, Teilnehmer, Abschluss, Protokoll, Folgetermin |
| `speicher.js` | Anbindung an Supabase (Laden, Speichern, Live-Aktualisierung, Fotos) |
| `config.js` | Adresse und öffentlicher Schlüssel des Supabase-Projekts |
| `supabase/schema.sql` | Tabellen und Zugriffsregeln |
| `supabase/test_rechte.sql` | Test der Zugriffsregeln (läuft in einer Transaktion, ändert nichts) |
| `test/` | Automatische Tests für Logik und Speicher |
| `dev/` | Testseite mit nachgebauter Datenbank |

Der Schlüssel in `config.js` ist absichtlich öffentlich. Was jemand lesen oder schreiben darf, prüft die Datenbank selbst:

- Nur freigegebene Konten sehen überhaupt etwas.
- Vertrauliche Besprechungen sehen nur Admins.
- „Meine Notiz“ sieht nur die Person selbst.
- Mitarbeiter, Rollen und Vorlagen ändern nur Admins.

## Tests

```bash
node --test
```

Prüft die Fachlogik und die Supabase-Anbindung. Die Zugriffsregeln testet `supabase/test_rechte.sql` im SQL-Editor von Supabase (nur auf einer leeren Datenbank).

Lokal durchklicken ohne echte Datenbank:

```bash
python3 dev/baue-dev-seite.py && python3 -m http.server 8765
```

Dann `http://localhost:8765/dev.html?als=admin` öffnen. Andere Rollen: `?als=ma`, `?als=neu` (nicht freigegeben), `?als=aus` (abgemeldet).

## Gut zu wissen

- **Gratis-Tarif:** Supabase pausiert ein Projekt nach etwa einer Woche ohne Nutzung. Im Dashboard ist es mit einem Klick wieder an, die Daten bleiben erhalten.
- **Passwort vergessen:** Ein Admin setzt es im Supabase-Dashboard unter Authentication → Users zurück.
- Normale Besprechungen und Aufgaben können alle freigegebenen Mitarbeiter technisch lesen. Die App zeigt nur, was zur Rolle passt.
