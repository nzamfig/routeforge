// Application bootstrap: wires all modules together.
// File I/O → FileController, Session → SessionController.
// Depends on: MapEditor, UI, Elevation, FileController, SessionController

(function () {
  let elevationPts = null;
  let chartCtrl    = null;   // { setExternalHover, clearExternalHover }
  let activityType = 'cycling';

  // ── Init ─────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    MapEditor.init('map');
    MapEditor.onRouteChange(onRouteChange);

    MapEditor.onElevationHover((distKm) => {
      if (!chartCtrl) return;
      if (distKm != null) chartCtrl.setExternalHover(distKm);
      else                chartCtrl.clearExternalHover();
    });

    UI.initLayerSwitcher((key) => MapEditor.setLayer(key));
    UI.initPanelToggle();
    UI.initSearch(({ lat, lon }) => MapEditor.getMap().setView([lat, lon], 14));
    UI.setActivityUI('cycling');

    bindModeButtons();
    bindActivityButtons();
    bindFileButtons();
    bindZoomButtons();
    bindAnalyzeButton();
    bindUndoRedo();
    bindMarkerModal();
    bindPointInfoModal();
    bindMyLocation();
    bindLabelToggleButtons();
    bindKeyboard();

    setModeUI('edit');

    SessionController.init({ onRestore: restoreSession });
    SessionController.checkURLHash();
    SessionController.checkSessionRestore();
  });

  // ── Mode Buttons ──────────────────────────────────────────────────────

  function bindModeButtons() {
    document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        MapEditor.setMode(mode);
        setModeUI(mode);
      });
    });

    document.getElementById('btn-add-marker').addEventListener('click', () => {
      const btn = document.getElementById('btn-add-marker');
      const nowActive = !btn.classList.contains('active');
      MapEditor.setAddingMarker(nowActive);
      btn.classList.toggle('active', nowActive);
    });
  }

  function setModeUI(mode) {
    document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    document.getElementById('btn-add-marker').classList.remove('active');
    const isView = mode === 'view';
    document.getElementById('btn-add-marker').disabled = isView;
    document.getElementById('btn-clear').disabled = isView;
    if (isView) {
      document.getElementById('btn-undo').disabled = true;
      document.getElementById('btn-redo').disabled = true;
    } else {
      MapEditor.refreshUndoUI();
    }
  }

  // ── Activity Buttons ──────────────────────────────────────────────────

  function bindActivityButtons() {
    document.querySelectorAll('.activity-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activityType = btn.dataset.activity;
        MapEditor.setActivity(activityType);
        UI.setActivityUI(activityType);
        onRouteChange();
      });
    });
  }

  // ── File Buttons ──────────────────────────────────────────────────────

  function bindFileButtons() {
    FileController.init({
      onLoad: (parsed, fileName) => {
        if (!parsed.trackPoints.length) return;
        MapEditor.loadFromGPX(parsed);

        if (parsed.type === 'cycling' || parsed.type === 'running') {
          activityType = parsed.type;
          MapEditor.setActivity(activityType);
          UI.setActivityUI(activityType);
        }

        if (parsed.trackPoints.some(p => p.ele != null)) {
          elevationPts = parsed.trackPoints;
          renderElevationChart();
        } else {
          elevationPts = null;
          clearChart();
        }

        if (parsed.name) document.getElementById('route-name').value = parsed.name;
        onRouteChange();
        UI.toast(`Loaded "${parsed.name || fileName}" — ${parsed.trackPoints.length} points`, 'success');
      },
    });

    document.getElementById('btn-save').addEventListener('click', () => {
      FileController.saveGPX({
        name:        document.getElementById('route-name').value,
        activityType,
        segments:    MapEditor.getSegments(),
        waypoints:   MapEditor.getWaypoints(),
      });
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
      if (!MapEditor.getAllTrackPoints().length && !MapEditor.getWaypoints().length) return;
      if (!confirm('Clear all route data?')) return;
      MapEditor.clearAll(true);
      elevationPts = null;
      chartCtrl    = null;
      clearChart();
      onRouteChange();
    });
  }

  // ── Elevation Analysis ────────────────────────────────────────────────

  function bindAnalyzeButton() {
    document.getElementById('btn-analyze').addEventListener('click', async () => {
      const pts = MapEditor.getAllTrackPoints();
      if (!pts.length) { UI.toast('Draw a route first', 'warning'); return; }

      const btn = document.getElementById('btn-analyze');
      btn.textContent = 'Fetching…';
      btn.disabled = true;

      try {
        elevationPts = await Elevation.fetchForPoints(pts);
        MapEditor.setElevationData(elevationPts);
        renderElevationChart();
        UI.openElevationPanel();
        onRouteChange();
        UI.toast('Elevation data loaded', 'success');
      } catch {
        UI.toast('Elevation fetch failed — try again later', 'error');
      } finally {
        btn.innerHTML = `<svg style="width:13px;height:13px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> Analyze Elevation`;
        btn.disabled = false;
      }
    });
  }

  function renderElevationChart() {
    if (!elevationPts?.length) return;
    const chartArea = document.getElementById('elevation-chart-area');
    const canvas    = document.getElementById('elevation-chart-canvas');
    chartArea.classList.remove('hidden');
    document.getElementById('elevation-empty').style.display = 'none';
    requestAnimationFrame(() => {
      chartCtrl = Elevation.drawChart(canvas, elevationPts, (info) => {
        MapEditor.showHoverPin(info);
      }, (info) => {
        MapEditor.getMap().panTo([info.lat, info.lon]);
      });
    });
  }

  function clearChart() {
    chartCtrl = null;
    const canvas = document.getElementById('elevation-chart-canvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('elevation-empty').style.display = '';
    document.getElementById('elevation-chart-area').classList.add('hidden');
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  function onRouteChange() {
    UI.updateStats(MapEditor.getAllTrackPoints(), activityType, elevationPts);
    SessionController.scheduleSessionSave(() => {
      const pts = MapEditor.getAllTrackPoints();
      if (!pts.length) return null;
      return {
        name:      document.getElementById('route-name').value,
        type:      activityType,
        segments:  MapEditor.getSegments(),
        waypoints: MapEditor.getWaypoints(),
      };
    });
  }

  // ── Undo/Redo ─────────────────────────────────────────────────────────

  function bindUndoRedo() {
    document.getElementById('btn-undo').addEventListener('click', () => { MapEditor.undo(); onRouteChange(); });
    document.getElementById('btn-redo').addEventListener('click', () => { MapEditor.redo(); onRouteChange(); });
  }

  // ── Marker Modal ──────────────────────────────────────────────────────

  function bindMarkerModal() {
    document.getElementById('marker-save').addEventListener('click',   () => MapEditor.saveMarkerDialog());
    document.getElementById('marker-cancel').addEventListener('click', () => MapEditor.closeMarkerDialog());
    document.getElementById('marker-delete').addEventListener('click', () => MapEditor.deleteMarker());
    document.getElementById('marker-modal-backdrop').addEventListener('click', () => MapEditor.closeMarkerDialog());
  }

  // ── Point Info Modal ──────────────────────────────────────────────────

  function bindPointInfoModal() {
    const close = () => document.getElementById('point-info-modal').classList.add('hidden');
    document.getElementById('point-info-close').addEventListener('click',    close);
    document.getElementById('point-info-backdrop').addEventListener('click', close);
  }

  // ── Label Toggle Buttons ──────────────────────────────────────────────

  function bindLabelToggleButtons() {
    const btnDist  = document.getElementById('btn-label-dist');
    const btnAngle = document.getElementById('btn-label-angle');

    btnDist.addEventListener('click', () => {
      const nowActive = !btnDist.classList.contains('active');
      btnDist.classList.toggle('active', nowActive);
      btnAngle.classList.remove('active');
      MapEditor.setLabelMode(nowActive ? 'distance' : null);
    });

    btnAngle.addEventListener('click', () => {
      const nowActive = !btnAngle.classList.contains('active');
      btnAngle.classList.toggle('active', nowActive);
      btnDist.classList.remove('active');
      MapEditor.setLabelMode(nowActive ? 'angle' : null);
    });
  }

  // ── Zoom Buttons ─────────────────────────────────────────────────────

  function bindZoomButtons() {
    document.getElementById('btn-zoom-in').addEventListener('click',  () => MapEditor.getMap().zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => MapEditor.getMap().zoomOut());
  }

  // ── My Location ───────────────────────────────────────────────────────

  function bindMyLocation() {
    document.getElementById('btn-my-location').addEventListener('click', () => {
      if (!navigator.geolocation) { UI.toast('Geolocation not supported', 'warning'); return; }
      navigator.geolocation.getCurrentPosition(
        pos => MapEditor.getMap().setView([pos.coords.latitude, pos.coords.longitude], 14),
        ()  => UI.toast('Could not get your location', 'error')
      );
    });
  }

  // ── Keyboard ──────────────────────────────────────────────────────────

  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      MapEditor.handleKey(e);
      setModeUI(MapEditor.getActiveMode());
      document.getElementById('btn-add-marker')
        .classList.toggle('active', MapEditor.getAddingMarker());
    });
  }

  // ── Session restore ───────────────────────────────────────────────────

  function restoreSession(data) {
    const parsed = {
      name:        data.name || '',
      type:        data.type || 'cycling',
      trackPoints: data.segments ? data.segments.flat() : [],
      waypoints:   data.waypoints || [],
    };
    if (parsed.name) document.getElementById('route-name').value = parsed.name;
    activityType = parsed.type;
    MapEditor.setActivity(activityType);
    UI.setActivityUI(activityType);
    MapEditor.loadFromGPX(parsed);
    onRouteChange();
    UI.toast('Session restored', 'success');
  }

})();
