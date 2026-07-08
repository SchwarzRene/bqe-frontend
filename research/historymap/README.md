# 🗺️ HistoryMap – Interaktiver Geschichtsatlas

**Weltgeschichte zum Durchscrollen:** Eine interaktive Weltkarte mit Zeitregler von **3000 v. Chr. bis 2010** – mit historischen Grenzen, kuratierten Epochen-Berichten, klickbaren Reichen und Ereignis-Markern am historischen Ort.

> Schiebe den Regler ins Jahr 1715 und sieh Europa im Zeitalter des Absolutismus. Klicke auf Frankreich und lies, wie Ludwig XIV. regierte, welche Kriege er führte – und warum das System 1789 explodierte.

<!-- Screenshot: Karte im Jahr 1715 mit geöffnetem Frankreich-Bericht -->
<!-- ![HistoryMap Screenshot](docs/screenshot.png) -->

## ✨ Features

- **48 Karten-Snapshots** historischer Grenzen (3000 v. Chr. – 2010), besonders dicht in den Umbruchphasen (1492, 1600, 1650, 1715, 1783, 1815, 1914, 1938, 1945 …)
- **Zeitregler** mit Tastatursteuerung (`←` / `→`) und **Abspielmodus** – die Weltgeschichte als Zeitraffer
- **21 kuratierte Epochen-Berichte** (deutsch): Wer hatte die Vorherrschaft und warum ging sie verloren? Welche Denkweisen und Ideen prägten die Zeit? Welche Konflikte formten die Welt?
- **~60 Länder-Berichte**: Klick auf ein Reich öffnet einen Detailbericht – Regentschaften, Kriege, Strömungen, Aufstieg und Fall (z. B. Frankreich mit vier eigenen Berichten von den Religionskriegen bis zur Dritten Republik)
- **~80 Ereignis-Marker** am historischen Ort: Schlachten ⚔️, Ideen & Erfindungen 💡, Religion ⛪, Umbrüche 🔥 – per Knopf (📍) ein-/ausblendbar
- **Wikipedia-Anbindung**: Zu jedem angeklickten Reich lädt automatisch eine Zusammenfassung (de, Fallback en) mit Bild und Link; jeder Bericht verlinkt vertiefende Artikel
- **Offline-fähig**: Alle Grenzdaten liegen lokal – nur die Wikipedia-Zusammenfassungen brauchen Internet

## 🚀 Schnellstart

**Voraussetzung:** [Node.js](https://nodejs.org) (für den lokalen Webserver).

```bash
git clone https://github.com/<dein-benutzername>/HistoryMap.git
cd HistoryMap
npx -y http-server -p 8173 -c-1 .
```

Dann im Browser öffnen: **http://localhost:8173**

**Windows:** Alternativ einfach Doppelklick auf **`Start-HistoryMap.bat`** – startet den Server und öffnet den Browser automatisch. Zum Beenden das Konsolenfenster schließen.

> **Warum ein Server?** Die Karte lädt die GeoJSON-Grenzdaten per `fetch()` nach – das blockieren Browser bei lokalen Dateien (`file://`) aus Sicherheitsgründen. Jeder simple statische Server funktioniert (auch `python -m http.server 8173`).

## 🕹️ Bedienung

| Element | Funktion |
|---|---|
| **Schieberegler** unten | Jahr wählen (auch mit `←` / `→`) |
| **▶︎▶︎** | Abspielmodus: alle 2 Sekunden ein Zeitschritt |
| **📍** | Ereignis-Marker ein-/ausblenden |
| **Panel links** | Epochen-Überblick: Vorherrschaft, Denkweisen, Konflikte, Schlaglichter |
| **Klick auf ein Reich** | Detailbericht + Wikipedia-Zusammenfassung (rechts) |
| **Klick auf einen Marker** | Ereignis-Popup mit Erklärung und Wikipedia-Link |

## 📁 Projektstruktur

```
HistoryMap/
├── index.html              # Einstiegspunkt
├── css/style.css           # Gesamtes Styling (Dark Theme)
├── js/
│   ├── app.js              # Karte, Zeitregler, Sidebar, Wikipedia-Anbindung
│   ├── eras.js             # 21 Epochen-Berichte (kuratiert, deutsch)
│   ├── reports.js          # Länder-Berichte + Namensübersetzungen
│   └── events.js           # Ereignis-Marker (Koordinaten, Texte, Links)
├── data/                   # 48× world_<jahr>.geojson (historische Grenzen)
└── Start-HistoryMap.bat    # Ein-Klick-Start für Windows
```

Keine Build-Tools, kein Framework, keine Abhängigkeiten außer [Leaflet](https://leafletjs.com) (per CDN) – reines HTML/CSS/JavaScript.

## 🔧 Selbst erweitern

Alle Inhalte sind einfache, kommentierte JavaScript-Datenstrukturen:

- **Epoche ergänzen/ändern** → [`js/eras.js`](js/eras.js): Objekt mit `from`/`to`-Jahren, Hegemonie-Text, Denkweisen, Konflikten
- **Länder-Bericht ergänzen** → [`js/reports.js`](js/reports.js): Regex auf den Reichsnamen + Jahresbereich + HTML-Text + Wikipedia-Links. Speziellere Einträge müssen vor allgemeineren stehen (der erste Treffer gewinnt; der Regionsname hat Vorrang vor der Oberherrschaft)
- **Ereignis-Marker ergänzen** → [`js/events.js`](js/events.js): Koordinaten, Sichtbarkeits-Zeitraum, Icon, Text
- **Karten-Jahr ergänzen** → GeoJSON von [historical-basemaps](https://github.com/aourednik/historical-basemaps) nach `data/` legen und das Jahr in `YEARS` ([`js/app.js`](js/app.js)) eintragen

## 📊 Daten & Genauigkeit

Die Grenzdaten stammen aus dem Projekt [**historical-basemaps**](https://github.com/aourednik/historical-basemaps) von Andrei Ourednik.

⚠️ **Wichtiger Hinweis:** Historische Grenzen sind wissenschaftlich umstrittene **Näherungen**. Vormoderne „Grenzen“ waren oft Einflusszonen, keine Linien; Datierungen und Zuordnungen sind vereinfacht. Die Karte eignet sich zum Lernen der großen Linien – nicht als Beleg für einzelne Grenzverläufe. Die kuratierten Texte fassen den allgemeinen Forschungsstand populär zusammen; für Tiefe sind überall Wikipedia-Links eingebaut.

## 📜 Lizenzen & Danksagung

- **Grenzdaten:** [historical-basemaps](https://github.com/aourednik/historical-basemaps) – [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (nicht-kommerzielle Nutzung)
- **Kartenbibliothek:** [Leaflet](https://leafletjs.com) – BSD-2-Clause
- **Artikel-Zusammenfassungen:** [Wikipedia](https://de.wikipedia.org) – CC BY-SA
- **Kuratierte Texte** (`eras.js`, `reports.js`, `events.js`): frei nutzbar unter CC BY-SA 4.0

*Erstellt mit [Claude Code](https://claude.com/claude-code).*
