// Map interactions: init, event handling, undo/redo, waypoints, overlay, keyboard.
// Rendering delegated to RouteRenderer; data delegated to RouteModel.
// Depends on: Geo, RouteModel, RouteRenderer, UI (for toast/modal DOM ids)

const MapEditor = (() => {

  // ── Constants ─────────────────────────────────────────────────────────
  const POINT_THRESHOLD_PX = 18;
  const LINE_THRESHOLD_PX  = 10;
  const COLOR = { cycling: '#3b82f6', running: '#f97316' };

  const TILE_LAYERS = {
    standard: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',           attr: '© OpenStreetMap contributors' },
    cycle:    { url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',      attr: '© OpenStreetMap, Waymarked Trails' },
    terrain:  { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',             attr: '© OpenTopoMap contributors' },
    satellite:{ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles © Esri' },
    carto:    { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attr: '© OpenStreetMap contributors © CARTO' },
  };

  // ── State ─────────────────────────────────────────────────────────────
  let map;
  let baseLayerTile = null, overlayLayerTile = null;
  let activityType  = 'cycling';
  let activeMode    = 'edit';     // 'edit' | 'view'
  let labelMode     = null;       // 'distance' | 'angle' | null
  let addingMarker  = false;

  // Waypoints
  let waypointMarkers = [];       // [{ marker: L.Marker, data: {lat,lon,type,name,note} }]

  // Hover / drag state
  let hoveredPoint   = null;      // { ptIdx, pt, containerPos }
  let hoveredSegment = null;      // { afterPtIdx, lat, lon, t, containerPos }
  let overlayHovered = false;
  let overlayPtIdx   = null;
  let isDragging     = false;
  let dragPtIdx      = null;
  let hasDragged     = false;

  // Undo / Redo stacks — each entry: { routePoints: [...], waypoints: [...] }
  let undoStack = [], redoStack = [];

  // Hover pin from elevation chart
  let hoverPin = null;

  // Callbacks
  let changeCallback      = null;
  let elevationHoverCb    = null;

  // ── Init ──────────────────────────────────────────────────────────────
  function init(mapId) {
    map = L.map(mapId, { zoomControl: false, doubleClickZoom: false })
           .setView([37.5665, 126.9780], 12);

    setLayer('carto');
    RouteRenderer.init(map);

    map.on('click',      onMapClick);
    map.on('mousemove',  onMapMouseMove);
    map.on('mouseleave', () => { hidePointOverlay(); clearElevationHoverNotify(); });

    const container = map.getContainer();
    container.addEventListener('mousedown', onContainerMouseDown, true);
    container.addEventListener('mousemove', onContainerMouseMove);
    container.addEventListener('mouseup',   onContainerMouseUp);

    bindOverlayEvents();
    updateUndoButtons();
    return map;
  }

  // ── Tile layers ───────────────────────────────────────────────────────
  function setLayer(key) {
    if (baseLayerTile)    map.removeLayer(baseLayerTile);
    if (overlayLayerTile) { map.removeLayer(overlayLayerTile); overlayLayerTile = null; }

    if (key === 'cycle') {
      baseLayerTile    = L.tileLayer(TILE_LAYERS.standard.url, { attribution: TILE_LAYERS.standard.attr, maxZoom: 19 }).addTo(map);
      overlayLayerTile = L.tileLayer(TILE_LAYERS.cycle.url,    { attribution: TILE_LAYERS.cycle.attr,    maxZoom: 19, opacity: 0.8 }).addTo(map);
    } else {
      const cfg = TILE_LAYERS[key] || TILE_LAYERS.standard;
      baseLayerTile = L.tileLayer(cfg.url, { attribution: cfg.attr, maxZoom: 19 }).addTo(map);
    }
  }

  // ── Activity ──────────────────────────────────────────────────────────
  function setActivity(type) {
    activityType = type;
    RouteRenderer.setActivityColor(COLOR[type]);
  }

  // ── Mode ──────────────────────────────────────────────────────────────
  function setMode(mode) {
    activeMode   = mode;
    addingMarker = false;
    hidePointOverlay();
    clearElevationHoverNotify();
    if (mode === 'view') { setMapCursor('default'); updateHint(''); }
    else                 { setMapCursor('add'); updateHint('Click to add points · Drag to move · Hover line to insert'); }
  }

  function setAddingMarker(val) {
    addingMarker = val;
    if (val) { setMapCursor('default'); updateHint('Click on the map to place a marker'); }
    else     { setMode(activeMode); }
  }

  // ── Map event handlers ────────────────────────────────────────────────
  function onMapMouseMove(e) {
    if (isDragging) return;

    if (activeMode === 'view' && !addingMarker) {
      updateElevationHoverFromLatLng(e.latlng);
      return;
    }

    const pts  = RouteModel.getPoints();
    const near = findNearestPoint(e.latlng, pts);
    if (near) {
      hoveredPoint   = near;
      hoveredSegment = null;
      showPointOverlay(near);
      setMapCursor('grab');
      notifyElevationHover(RouteModel.getCumDist(near.ptIdx));
      return;
    }

    if (!overlayHovered) hidePointOverlay();
    hoveredPoint = null;

    const nearSeg = findNearestOnSegment(e.latlng, pts);
    if (nearSeg) {
      hoveredSegment = nearSeg;
      setMapCursor(activeMode === 'edit' ? 'insert' : 'default');
      notifyElevationHover(RouteModel.distAtSegPos(nearSeg.afterPtIdx, nearSeg.t));
      return;
    }

    hoveredSegment = null;
    setMapCursor(activeMode === 'edit' ? 'add' : 'default');
    clearElevationHoverNotify();
  }

  function onMapClick(e) {
    if (isDragging || hasDragged) { hasDragged = false; return; }

    if (addingMarker) { openMarkerDialog(e.latlng); return; }

    if (activeMode === 'view') {
      const pts = RouteModel.getPoints();
      if (!pts.length) return;
      const cursorPx = map.latLngToContainerPoint(e.latlng);
      let bestIdx = null, bestDist = 40;
      pts.forEach((pt, i) => {
        const d = cursorPx.distanceTo(map.latLngToContainerPoint([pt.lat, pt.lon]));
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      });
      if (bestIdx !== null) showPointInfo(bestIdx);
      return;
    }

    if (activeMode !== 'edit') return;
    if (hoveredPoint) return;

    if (hoveredSegment) {
      saveUndo();
      RouteModel.insertPoint(hoveredSegment.afterPtIdx, { lat: hoveredSegment.lat, lon: hoveredSegment.lon });
      _redrawAndNotify();
      return;
    }

    saveUndo();
    RouteModel.addPoint({ lat: e.latlng.lat, lon: e.latlng.lng });
    _redrawAndNotify();
  }

  // ── Drag ──────────────────────────────────────────────────────────────
  function onContainerMouseDown(e) {
    if (activeMode !== 'edit' || addingMarker) return;
    const latlng = map.mouseEventToLatLng(e);
    const near   = findNearestPoint(latlng, RouteModel.getPoints());
    if (!near) return;

    e.preventDefault();
    e.stopPropagation();
    saveUndo();
    isDragging = true;
    dragPtIdx  = near.ptIdx;
    hasDragged = false;
    setMapCursor('grabbing');
    map.dragging.disable();
    RouteRenderer.startDrag(RouteModel.getPoints(), COLOR[activityType]);
  }

  function onContainerMouseMove(e) {
    if (!isDragging || dragPtIdx === null) return;
    const latlng = map.mouseEventToLatLng(e);
    RouteModel.updatePoint(dragPtIdx, latlng.lat, latlng.lng);
    RouteRenderer.updateDrag(RouteModel.getPoints(), dragPtIdx);
    hasDragged = true;
    positionOverlay(map.latLngToContainerPoint([latlng.lat, latlng.lng]));
  }

  function onContainerMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    map.dragging.enable();

    if (RouteRenderer.isInElevationMode() || hasDragged) {
      RouteModel.recomputeCumDists();
    }
    RouteRenderer.endDrag(RouteModel.getPoints(), COLOR[activityType]);
    if (labelMode) RouteRenderer.drawLabels(RouteModel.getPoints(), labelMode);

    if (hasDragged) {
      notifyChange();
    } else {
      undoStack.pop();
      updateUndoButtons();
    }
    dragPtIdx  = null;
    hasDragged = false;
    setMapCursor(activeMode === 'edit' ? 'grab' : 'default');
  }

  // ── Nearest point / segment detection ────────────────────────────────
  function findNearestPoint(latlng, pts) {
    const cursorPx = map.latLngToContainerPoint(latlng);
    let best = null, bestDist = POINT_THRESHOLD_PX;
    pts.forEach((pt, ptIdx) => {
      const d = cursorPx.distanceTo(map.latLngToContainerPoint([pt.lat, pt.lon]));
      if (d < bestDist) { bestDist = d; best = { ptIdx, pt, containerPos: map.latLngToContainerPoint([pt.lat, pt.lon]) }; }
    });
    return best;
  }

  function findNearestOnSegment(latlng, pts) {
    const cursorPx = map.latLngToContainerPoint(latlng);
    let best = null, bestDist = LINE_THRESHOLD_PX;
    for (let i = 0; i < pts.length - 1; i++) {
      const aPx = map.latLngToContainerPoint([pts[i].lat,   pts[i].lon]);
      const bPx = map.latLngToContainerPoint([pts[i+1].lat, pts[i+1].lon]);
      const { dist, t } = Geo.pointToSegDist(cursorPx, aPx, bPx);
      if (dist < bestDist) {
        bestDist = dist;
        const lat = pts[i].lat + (pts[i+1].lat - pts[i].lat) * t;
        const lon = pts[i].lon + (pts[i+1].lon - pts[i].lon) * t;
        best = { afterPtIdx: i, lat, lon, t, containerPos: map.latLngToContainerPoint([lat, lon]) };
      }
    }
    return best;
  }

  // ── Point overlay ─────────────────────────────────────────────────────
  function showPointOverlay(near) {
    overlayPtIdx = near.ptIdx;
    const el = document.getElementById('point-overlay');
    el.classList.remove('hidden');
    el.classList.add('visible');
    positionOverlay(near.containerPos);
  }

  function positionOverlay(containerPos) {
    const el = document.getElementById('point-overlay');
    el.style.left = containerPos.x + 'px';
    el.style.top  = containerPos.y + 'px';
  }

  function hidePointOverlay() {
    if (overlayHovered) return;
    const el = document.getElementById('point-overlay');
    el.classList.add('hidden');
    el.classList.remove('visible');
    overlayPtIdx = null;
    hoveredPoint = null;
  }

  function bindOverlayEvents() {
    const overlay = document.getElementById('point-overlay');
    overlay.addEventListener('mouseenter', () => { overlayHovered = true; });
    overlay.addEventListener('mouseleave', () => { overlayHovered = false; if (!hoveredPoint) hidePointOverlay(); });

    document.getElementById('point-delete-btn').addEventListener('click', () => {
      if (overlayPtIdx === null) return;
      saveUndo();
      RouteModel.removePoint(overlayPtIdx);
      overlayPtIdx   = null;
      overlayHovered = false;
      hidePointOverlay();
      _redrawAndNotify();
    });

    document.getElementById('point-info-btn').addEventListener('click', () => {
      if (overlayPtIdx === null) return;
      showPointInfo(overlayPtIdx);
    });
  }

  // ── Point info popup ──────────────────────────────────────────────────
  function showPointInfo(ptIdx) {
    const pt    = RouteModel.getPoint(ptIdx);
    const dist  = RouteModel.getCumDist(ptIdx);
    const total = RouteModel.getLength();
    const rows  = [
      ['Point',     `#${ptIdx + 1} / ${total}`],
      ['Latitude',  pt.lat.toFixed(6)],
      ['Longitude', pt.lon.toFixed(6)],
      ...(pt.ele != null ? [['Elevation', `${pt.ele.toFixed(1)} m`]] : []),
      ['Distance',  `${dist.toFixed(3)} km from start`],
    ];
    document.getElementById('point-info-content').innerHTML = rows.map(([k, v]) => `
      <div class="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
        <span class="text-xs text-gray-500">${k}</span>
        <span class="text-sm font-medium text-gray-800">${v}</span>
      </div>`).join('');
    document.getElementById('point-info-modal').classList.remove('hidden');
    overlayHovered = false;
    hidePointOverlay();
  }

  // ── Elevation hover ───────────────────────────────────────────────────
  function updateElevationHoverFromLatLng(latlng) {
    const pts  = RouteModel.getPoints();
    const near = findNearestPoint(latlng, pts);
    if (near) { notifyElevationHover(RouteModel.getCumDist(near.ptIdx)); return; }
    const seg  = findNearestOnSegment(latlng, pts);
    if (seg)  { notifyElevationHover(RouteModel.distAtSegPos(seg.afterPtIdx, seg.t)); return; }
    clearElevationHoverNotify();
  }

  function notifyElevationHover(distKm) { if (elevationHoverCb) elevationHoverCb(distKm); }
  function clearElevationHoverNotify()   { if (elevationHoverCb) elevationHoverCb(null); }

  // ── Hover pin (elevation chart → map) ────────────────────────────────
  function showHoverPin(info) {
    if (hoverPin) { map.removeLayer(hoverPin); hoverPin = null; }
    if (!info) return;
    const icon = L.divIcon({
      className: '',
      html: `<div style="background:#3b82f6;border:2px solid white;border-radius:50%;width:12px;height:12px;box-shadow:0 0 4px rgba(59,130,246,.6)"></div>`,
      iconSize: [12, 12], iconAnchor: [6, 6],
    });
    hoverPin = L.marker([info.lat, info.lon], { icon, interactive: false }).addTo(map);
  }

  // ── Cursor / hint helpers ─────────────────────────────────────────────
  function setMapCursor(type) {
    const el = document.getElementById('map');
    el.className = el.className.replace(/\bcursor-\S+/g, '').trim();
    if (type) el.classList.add(`cursor-${type}`);
  }

  function updateHint(text) {
    const hint = document.getElementById('map-hint');
    if (!hint) return;
    if (text) { hint.classList.remove('hidden'); hint.querySelector('div').textContent = text; }
    else      { hint.classList.add('hidden'); }
  }

  // ── Waypoint markers ──────────────────────────────────────────────────
  const MARKER_COLORS = { start:'#22c55e', finish:'#3b82f6', checkpoint:'#f97316', water:'#06b6d4', warning:'#eab308' };

  function makeMarkerIcon(type, name) {
    const color = MARKER_COLORS[type] || '#6b7280';
    const label = name || type;
    return L.divIcon({
      className: '',
      html: `<div style="width:80px;display:flex;flex-direction:column;align-items:center;pointer-events:none">
        <svg width="24" height="32" viewBox="0 0 24 32" fill="none" style="flex-shrink:0;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))">
          <path d="M12 1C7.31 1 3.5 4.81 3.5 9.5c0 6.75 8.5 21.5 8.5 21.5s8.5-14.75 8.5-21.5C20.5 4.81 16.69 1 12 1z" fill="${color}" stroke="white" stroke-width="1.5"/>
          <circle cx="12" cy="9.5" r="3.5" fill="white" opacity="0.9"/>
        </svg>
        <span style="font-size:10px;font-weight:700;color:#1B2430;white-space:nowrap;margin-top:2px;max-width:78px;overflow:hidden;text-overflow:ellipsis;display:block;text-align:center;text-shadow:0 0 3px #fff,0 0 6px #fff,0 1px 2px rgba(255,255,255,.9)">${label}</span>
      </div>`,
      iconSize: [80, 52], iconAnchor: [40, 32], popupAnchor: [0, -34],
    });
  }

  let markerDialogCallback = null;

  function openMarkerDialog(latlng, existingData, existingMarkerObj) {
    document.getElementById('marker-modal').classList.remove('hidden');
    document.getElementById('marker-type').value = existingData?.type || 'checkpoint';
    document.getElementById('marker-name').value = existingData?.name || '';
    document.getElementById('marker-note').value = existingData?.note || '';
    document.getElementById('marker-delete').style.display = existingMarkerObj ? '' : 'none';
    markerDialogCallback = { latlng, existingMarkerObj };
  }

  function closeMarkerDialog() {
    document.getElementById('marker-modal').classList.add('hidden');
    markerDialogCallback = null;
  }

  function saveMarkerDialog() {
    if (!markerDialogCallback) return;
    const { latlng, existingMarkerObj } = markerDialogCallback;
    const type = document.getElementById('marker-type').value;
    const name = document.getElementById('marker-name').value.trim();
    const note = document.getElementById('marker-note').value.trim();
    saveUndo();
    if (existingMarkerObj) {
      const idx = waypointMarkers.findIndex(w => w.marker === existingMarkerObj);
      if (idx >= 0) {
        map.removeLayer(existingMarkerObj);
        waypointMarkers[idx] = createWaypointMarker({ lat: latlng.lat, lon: latlng.lng, type, name, note });
      }
    } else {
      waypointMarkers.push(createWaypointMarker({ lat: latlng.lat, lon: latlng.lng, type, name, note }));
    }
    closeMarkerDialog();
    notifyChange();
  }

  function deleteMarker() {
    if (!markerDialogCallback?.existingMarkerObj) return;
    saveUndo();
    const idx = waypointMarkers.findIndex(w => w.marker === markerDialogCallback.existingMarkerObj);
    if (idx >= 0) { map.removeLayer(markerDialogCallback.existingMarkerObj); waypointMarkers.splice(idx, 1); }
    closeMarkerDialog();
    notifyChange();
  }

  function createWaypointMarker(wpt) {
    const icon = makeMarkerIcon(wpt.type, wpt.name || wpt.type);
    const m = L.marker([wpt.lat, wpt.lon], { icon }).addTo(map);
    m.on('click', e => {
      L.DomEvent.stopPropagation(e);
      openMarkerDialog({ lat: wpt.lat, lng: wpt.lon }, wpt, m);
    });
    return { marker: m, data: wpt };
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────
  function saveUndo() {
    undoStack.push(_snapshot());
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];
    updateUndoButtons();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(_snapshot());
    _restore(undoStack.pop());
    updateUndoButtons();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(_snapshot());
    _restore(redoStack.pop());
    updateUndoButtons();
  }

  function _snapshot() {
    return {
      routePoints: RouteModel.snapshot(),
      waypoints:   waypointMarkers.map(w => ({ ...w.data })),
    };
  }

  function _restore(snap) {
    _clearAllLayers(false);
    RouteModel.restoreSnapshot(snap.routePoints);
    RouteRenderer.draw(RouteModel.getPoints(), COLOR[activityType]);
    if (labelMode) RouteRenderer.drawLabels(RouteModel.getPoints(), labelMode);
    snap.waypoints.forEach(wpt => waypointMarkers.push(createWaypointMarker(wpt)));
    notifyChange();
  }

  function updateUndoButtons() {
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if (u) u.disabled = undoStack.length === 0;
    if (r) r.disabled = redoStack.length === 0;
  }

  // ── Clear ─────────────────────────────────────────────────────────────
  function clearAll(saveHistory = true) {
    if (saveHistory) saveUndo();
    _clearAllLayers(true);
    notifyChange();
  }

  function _clearAllLayers(clearWaypoints) {
    RouteModel.clear();
    RouteRenderer.clearAll();
    if (clearWaypoints) {
      waypointMarkers.forEach(w => map.removeLayer(w.marker));
      waypointMarkers = [];
    }
    overlayHovered = false;
    overlayPtIdx   = null;
    hidePointOverlay();
    clearElevationHoverNotify();
  }

  // ── Label mode ────────────────────────────────────────────────────────
  function setLabelMode(mode) {
    labelMode = mode;
    RouteRenderer.drawLabels(RouteModel.getPoints(), labelMode);
  }

  // ── Load from GPX ─────────────────────────────────────────────────────
  function loadFromGPX(parsed) {
    _clearAllLayers(true);
    undoStack = []; redoStack = [];

    RouteModel.setPoints(parsed.trackPoints);
    RouteRenderer.draw(RouteModel.getPoints(), COLOR[activityType]);
    if (labelMode) RouteRenderer.drawLabels(RouteModel.getPoints(), labelMode);

    if (RouteModel.getLength()) {
      map.fitBounds(L.latLngBounds(RouteModel.getPoints().map(p => [p.lat, p.lon])), { padding: [40, 40] });
    }

    parsed.waypoints.forEach(wpt => waypointMarkers.push(createWaypointMarker(wpt)));
    updateUndoButtons();
    notifyChange();
  }

  // ── Elevation data ────────────────────────────────────────────────────
  function setElevationData(elevPts) {
    const pts = RouteModel.getPoints();
    if (!elevPts.length || !pts.length) return;

    const ratio = (pts.length - 1) / Math.max(elevPts.length - 1, 1);
    elevPts.forEach((ep, i) => {
      const idx = Math.round(i * ratio);
      if (idx < pts.length) pts[idx].ele = ep.ele;
    });

    // Linearly interpolate elevation for unmapped points
    let first = -1, last = -1;
    pts.forEach((p, i) => { if (p.ele != null) { if (first < 0) first = i; last = i; } });
    if (first < 0) { RouteRenderer.draw(pts, COLOR[activityType]); return; }
    for (let i = 0;        i < first;      i++) pts[i].ele = pts[first].ele;
    for (let i = last + 1; i < pts.length; i++) pts[i].ele = pts[last].ele;
    let prev = first;
    for (let i = first + 1; i < pts.length; i++) {
      if (pts[i].ele != null) {
        for (let j = prev + 1; j < i; j++) {
          const t = (j - prev) / (i - prev);
          pts[j].ele = pts[prev].ele + (pts[i].ele - pts[prev].ele) * t;
        }
        prev = i;
      }
    }
    RouteRenderer.draw(pts, COLOR[activityType]);
  }

  // ── Fit to route ──────────────────────────────────────────────────────
  function fitToRoute() {
    if (!RouteModel.getLength()) return;
    map.fitBounds(L.latLngBounds(RouteModel.getPoints().map(p => [p.lat, p.lon])), { padding: [40, 40] });
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  function handleKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if      (k === 'e')                            setMode('edit');
    else if (k === 'v')                            setMode('view');
    else if (k === 'm')                            setAddingMarker(true);
    else if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
  }

  // ── Internal helpers ──────────────────────────────────────────────────
  function _redrawAndNotify() {
    RouteRenderer.draw(RouteModel.getPoints(), COLOR[activityType]);
    if (labelMode) RouteRenderer.drawLabels(RouteModel.getPoints(), labelMode);
    notifyChange();
  }

  // ── Change notification ───────────────────────────────────────────────
  function onRouteChange(cb) { changeCallback = cb; }
  function notifyChange()    { if (changeCallback) changeCallback(); }

  // ── Public API ────────────────────────────────────────────────────────
  return {
    init,
    setLayer,
    setActivity,
    getActivityType:  () => activityType,
    setMode,
    getActiveMode:    () => activeMode,
    setAddingMarker,
    getAddingMarker:  () => addingMarker,
    setLabelMode,
    clearAll,
    undo, redo,
    loadFromGPX,
    getAllTrackPoints: () => RouteModel.getPoints(),
    getWaypoints:     () => waypointMarkers.map(w => w.data),
    getSegments:      () => RouteModel.getLength() ? [RouteModel.getPoints()] : [],
    setElevationData,
    showHoverPin,
    fitToRoute,
    onRouteChange,
    onElevationHover: (cb) => { elevationHoverCb = cb; },
    refreshUndoUI:    updateUndoButtons,
    handleKey,
    saveMarkerDialog,
    deleteMarker,
    closeMarkerDialog,
    openMarkerDialog,
    getMap: () => map,
  };
})();
