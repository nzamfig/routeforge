// All Leaflet rendering for the route: polylines, point markers,
// elevation gradient, segment labels, and drag support.
// Depends on: Geo (utils/geo.js)

const RouteRenderer = (() => {

  const OUTLINE_COLOR = '#FFD700';
  const NUM_BANDS     = 24;

  let _map           = null;
  let _routePolyline = null;
  let _routeOutline  = null;
  let _elevationSegs = [];
  let _pointMarkers  = [];
  let _segmentLabels = [];
  let _dragPolyline  = null;

  // ── Init ──────────────────────────────────────────────────────────────
  function init(mapInstance) { _map = mapInstance; }

  // ── Elevation color (pale→deep blue) ─────────────────────────────────
  function eleToColor(t) {
    t = Math.max(0, Math.min(1, t));
    return `rgb(${Math.round(147 - 117*t)},${Math.round(197 - 133*t)},${Math.round(253 - 78*t)})`;
  }

  // ── Draw full route ───────────────────────────────────────────────────
  function draw(points, color) {
    clearRouteLayers();
    if (!points.length) return;

    const hasEle  = points.every(p => p.ele != null);
    const minEle  = hasEle ? points.reduce((m, p) => Math.min(m, p.ele),  Infinity) : 0;
    const maxEle  = hasEle ? points.reduce((m, p) => Math.max(m, p.ele), -Infinity) : 0;
    const eleRange = maxEle - minEle;
    const useGradient = hasEle && eleRange > 0;

    if (points.length >= 2) {
      _routeOutline = L.polyline(
        points.map(p => [p.lat, p.lon]),
        { color: OUTLINE_COLOR, weight: 8, opacity: 0.75, lineJoin: 'round', lineCap: 'round', interactive: false }
      ).addTo(_map);

      if (useGradient) {
        _drawElevationSegments(points, minEle, eleRange);
      } else {
        _routePolyline = L.polyline(
          points.map(p => [p.lat, p.lon]),
          { color, weight: 4, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }
        ).addTo(_map);
      }
    }

    points.forEach(pt => {
      const c = useGradient ? eleToColor((pt.ele - minEle) / eleRange) : color;
      _pointMarkers.push(L.circleMarker([pt.lat, pt.lon], {
        radius: 4, color: c, weight: 2, fillColor: 'white', fillOpacity: 1, interactive: false,
      }).addTo(_map));
    });
  }

  function _drawElevationSegments(points, minEle, eleRange) {
    let curBand = -1, curLatLngs = null;
    for (let i = 0; i < points.length - 1; i++) {
      const avgEle = (points[i].ele + points[i + 1].ele) / 2;
      const band   = Math.min(Math.floor((avgEle - minEle) / eleRange * NUM_BANDS), NUM_BANDS - 1);
      if (band !== curBand) {
        if (curLatLngs && curLatLngs.length >= 2) {
          _elevationSegs.push(L.polyline(curLatLngs, {
            color: eleToColor(curBand / (NUM_BANDS - 1)),
            weight: 5, opacity: 0.9, lineJoin: 'round', lineCap: 'round',
          }).addTo(_map));
        }
        curBand = band;
        curLatLngs = [[points[i].lat, points[i].lon]];
      }
      curLatLngs.push([points[i + 1].lat, points[i + 1].lon]);
    }
    if (curLatLngs && curLatLngs.length >= 2) {
      _elevationSegs.push(L.polyline(curLatLngs, {
        color: eleToColor(curBand / (NUM_BANDS - 1)),
        weight: 5, opacity: 0.9, lineJoin: 'round', lineCap: 'round',
      }).addTo(_map));
    }
  }

  // ── Segment labels (distance / climb angle) ───────────────────────────
  function drawLabels(points, mode) {
    clearLabels();
    if (!mode || points.length < 2) return;
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i], p2 = points[i + 1];
      let text;
      if (mode === 'distance') {
        const d = Geo.haversine(p1, p2);
        text = d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(2)} km`;
      } else {
        if (p1.ele == null || p2.ele == null) {
          text = '—';
        } else {
          const eleDiff = p2.ele - p1.ele;
          const horizM  = Geo.haversine(p1, p2) * 1000;
          text = horizM < 0.5 ? '—'
            : (eleDiff >= 0 ? '+' : '') + (Math.atan2(eleDiff, horizM) * 180 / Math.PI).toFixed(1) + '°';
        }
      }
      _segmentLabels.push(L.marker([(p1.lat + p2.lat) / 2, (p1.lon + p2.lon) / 2], {
        icon: L.divIcon({ className: '', html: `<div class="seg-label">${text}</div>`, iconSize: [0, 0], iconAnchor: [0, 0] }),
        interactive: false,
      }).addTo(_map));
    }
  }

  function clearLabels() {
    _segmentLabels.forEach(m => _map.removeLayer(m));
    _segmentLabels = [];
  }

  // ── Activity color update (no full redraw) ───────────────────────────
  function setActivityColor(color) {
    if (_routePolyline) _routePolyline.setStyle({ color });
    _pointMarkers.forEach(m => m.setStyle({ color }));
  }

  // ── Drag support ─────────────────────────────────────────────────────
  function startDrag(points, color) {
    if (_routePolyline || _elevationSegs.length === 0) return;
    _dragPolyline = L.polyline(
      points.map(p => [p.lat, p.lon]),
      { color, weight: 5, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }
    ).addTo(_map);
    _elevationSegs.forEach(s => _map.removeLayer(s));
    _elevationSegs = [];
  }

  function updateDrag(points, dragIdx) {
    const lls = points.map(p => [p.lat, p.lon]);
    if (_routePolyline) _routePolyline.setLatLngs(lls);
    if (_routeOutline)  _routeOutline.setLatLngs(lls);
    if (_dragPolyline)  _dragPolyline.setLatLngs(lls);
    if (_pointMarkers[dragIdx]) _pointMarkers[dragIdx].setLatLng(lls[dragIdx]);
  }

  function endDrag(points, color) {
    if (_dragPolyline) { _map.removeLayer(_dragPolyline); _dragPolyline = null; }
    draw(points, color);
  }

  function isInElevationMode() { return _elevationSegs.length > 0; }

  // ── Clear helpers ─────────────────────────────────────────────────────
  function clearRouteLayers() {
    if (_routePolyline) { _map.removeLayer(_routePolyline); _routePolyline = null; }
    if (_routeOutline)  { _map.removeLayer(_routeOutline);  _routeOutline  = null; }
    _elevationSegs.forEach(s => _map.removeLayer(s));  _elevationSegs = [];
    _pointMarkers.forEach(m => _map.removeLayer(m));   _pointMarkers  = [];
  }

  function clearAll() {
    clearRouteLayers();
    clearLabels();
    if (_dragPolyline) { _map.removeLayer(_dragPolyline); _dragPolyline = null; }
  }

  return {
    init,
    draw, eleToColor,
    drawLabels, clearLabels,
    setActivityColor,
    startDrag, updateDrag, endDrag, isInElevationMode,
    clearRouteLayers, clearAll,
  };
})();
