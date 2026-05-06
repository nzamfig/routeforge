# RouteForge

A lightweight, browser-based GPX route editor for planning cycling and running routes. No installation required — open `index.html` and start drawing.

![RouteForge](https://img.shields.io/badge/version-1.0-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### Route Editing
- **Click to add points** — click anywhere on the map to build a route step by step
- **Drag to move** — grab any existing point and drag it to a new position
- **Insert mid-route** — hover over a line segment to reveal an insert handle; click to add a point between two existing ones
- **Delete points** — hover a point and use the floating overlay to remove it
- **Undo / Redo** — full undo/redo history for all route edits (`Ctrl+Z` / `Ctrl+Y`)
- **Edit / View modes** — switch between interactive editing and a clean read-only view

### Activity Types
- **Cycling** — route line rendered in blue; estimated time based on 20 km/h average
- **Running** — route line rendered in orange; estimated time based on 10 km/h average
- Route color and stats update instantly when switching activity

### Map Layers
| Layer | Source |
|-------|--------|
| Carto Grey *(default)* | CartoCDN Light |
| Standard | OpenStreetMap |
| Cycle Map | Waymarked Trails overlay |
| Terrain | OpenTopoMap |
| Satellite | Esri World Imagery |

### Elevation Analysis
- **Fetch elevation** — click **Analyze Elevation** to retrieve altitude data for all route points via the [Open-Meteo Elevation API](https://open-meteo.com/)
- **Elevation chart** — interactive canvas chart showing the altitude profile
- **Hover sync** — hovering the chart moves a pin on the map; hovering the map highlights the corresponding chart position
- **Click to navigate** — click any point on the chart to pan the map to that location
- **Stats** — total ascent (↑), total descent (↓), and maximum elevation displayed in the stats panel

### Waypoints / Markers
- Place named markers anywhere on the map with custom types: **Start**, **Finish**, **Checkpoint**, **Water**, **Warning**
- Add a name and optional note to each marker
- Edit or delete existing markers by clicking them
- Waypoints are exported to GPX as `<wpt>` elements with appropriate symbols

### Route Labels
- **Distance labels** — display cumulative distance at each point along the route
- **Bearing labels** — display the heading angle at each point

### File I/O
- **Open GPX** — load any GPX 1.1 file via the file picker or drag-and-drop onto the map
- **Save GPX** — export the current route as a standards-compliant GPX 1.1 file
- Preserves elevation data, waypoints, route name, and activity type on round-trip

### Session & Sharing
- **Auto-save** — the current route is saved to `localStorage` every 5 minutes; a restore prompt appears on next visit
- **URL sharing** — encode the full route into a shareable URL hash (`#route=...`); recipients open the link to instantly load the route
- **Address search** — search for any location via the Nominatim geocoder and jump to it on the map
- **My Location** — center the map on your current GPS position

### UI
- Toast notifications for all user actions (success, warning, error)
- Collapsible elevation panel
- Zoom in/out buttons
- Keyboard shortcuts: `E` = Edit mode, `V` = View mode, `Escape` = cancel marker placement

---

## Getting Started

RouteForge is a fully static web app — no build step or server required for basic use.

```bash
# Option 1: open directly
open index.html   # macOS
start index.html  # Windows

# Option 2: serve locally (recommended, avoids some browser restrictions)
python -m http.server 8080
# then open http://localhost:8080
```

---

## Project Structure

```
gpxeditor/
├── index.html                        # App shell and UI markup
├── css/
│   └── main.css                      # All styles
└── js/
    ├── gpx.js                        # GPX 1.1 parser and exporter
    ├── elevation.js                  # Elevation API + canvas chart
    ├── map.js                        # Map interactions, modes, undo/redo
    ├── ui.js                         # Toast, stats, search, layer switcher
    ├── app.js                        # Bootstrap — wires all modules together
    ├── utils/
    │   ├── geo.js                    # Haversine distance, point-to-segment geometry
    │   └── stats.js                  # Elevation gain/loss/max calculations
    ├── models/
    │   └── route-model.js            # Pure route data (no Leaflet dependency)
    ├── renderers/
    │   └── route-renderer.js         # All Leaflet layer management
    └── controllers/
        ├── file-controller.js        # GPX open/save, drag-and-drop
        └── session-controller.js     # localStorage session, URL hash sharing
```

---

## Dependencies

All loaded from CDN — no `npm install` needed.

| Library | Version | Purpose |
|---------|---------|---------|
| [Leaflet](https://leafletjs.com/) | 1.9.4 | Interactive map |
| [Inter](https://fonts.google.com/specimen/Inter) | — | UI font (Google Fonts) |

External APIs used at runtime:

| API | Usage |
|-----|-------|
| [Open-Meteo Elevation](https://open-meteo.com/en/docs/elevation-api) | Fetch elevation for route points |
| [Nominatim](https://nominatim.openstreetmap.org/) | Address / place search |
| [CartoCDN](https://carto.com/basemaps/) | Default map tiles |
| [OpenStreetMap](https://www.openstreetmap.org/) | Standard / Cycle map tiles |
| [OpenTopoMap](https://opentopomap.org/) | Terrain tiles |
| [Esri](https://www.esri.com/) | Satellite imagery tiles |

---

## Browser Support

Any modern browser with ES2020 support. Tested on Chrome 120+.
