# Asteroids Arcade (statische Website)

Ein kleines, sofort spielbares **Asteroids-Arcade-Spiel** in reinem **HTML, CSS und JavaScript**.
Keine Build-Tools, kein Backend, keine Datenbank.

## Lokal starten

1. Repository klonen oder Dateien herunterladen.
2. `index.html` direkt im Browser öffnen.

Optional mit einfachem Static Server (falls gewünscht):

```bash
python3 -m http.server 8080
```

Dann im Browser öffnen: `http://localhost:8080`

## Auf GitHub Pages hosten (statische Vorschau)

1. Repository zu GitHub pushen.
2. In GitHub: **Settings → Pages**.
3. Unter **Build and deployment** bei **Source** auswählen: **Deploy from a branch**.
4. Branch `main` (oder gewünschter Branch) und Ordner `/ (root)` wählen.
5. Speichern – nach kurzer Zeit ist das Spiel unter der angezeigten GitHub-Pages-URL erreichbar.

## Steuerung

- **Pfeil links / rechts**: Schiff rotieren
- **Pfeil hoch**: Schub
- **Leertaste**: Schießen
- **R**: Neustart (nach Game Over)

## Gameplay-Features

- 2D-Canvas mit klassischem Arcade-Look
- Träge Flugphysik fürs Schiff
- Wrap an allen Bildschirmrändern
- Asteroiden mit variabler Richtung/Geschwindigkeit
- Große Asteroiden zerbrechen in kleinere
- Kollision Schiff ↔ Asteroid kostet Leben
- Schüsse zerstören Asteroiden
- Score-System
- 3 Leben + Game-Over-Overlay mit Restart
- Sauberes Reset des Spielzustands beim Neustart

## Projektstruktur

```text
.
├── index.html   # Grundstruktur, HUD, Canvas
├── style.css    # Retro-UI, Layout, Farben
├── script.js    # Spiel-Logik (Loop, Input, Rendering, Kollisionen)
└── README.md    # Projektbeschreibung & Hosting-Hinweise
```
