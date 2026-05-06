// GPX file loading, saving, and drag-and-drop handling.
// Depends on: GPX, UI

const FileController = (() => {

  let _onLoad = null;

  function init({ onLoad }) {
    _onLoad = onLoad;
    _bindButtons();
    _bindDragDrop();
  }

  function _bindButtons() {
    document.getElementById('btn-open').addEventListener('click', () =>
      document.getElementById('file-input').click()
    );
    document.getElementById('file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) _loadGPXFile(file);
      e.target.value = '';
    });
  }

  function _bindDragDrop() {
    const container = document.getElementById('map-container');
    container.addEventListener('dragover',  (e) => { e.preventDefault(); container.classList.add('drag-over'); });
    container.addEventListener('dragleave', ()  => container.classList.remove('drag-over'));
    container.addEventListener('drop',      (e) => {
      e.preventDefault();
      container.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.name.toLowerCase().endsWith('.gpx')) _loadGPXFile(file);
    });
  }

  function _loadGPXFile(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = GPX.parse(ev.target.result);
        if (!parsed.trackPoints.length) { UI.toast('No track data found in this GPX file', 'warning'); return; }
        if (_onLoad) _onLoad(parsed, file.name);
      } catch {
        UI.toast('Failed to parse GPX file', 'error');
      }
    };
    reader.readAsText(file);
  }

  function saveGPX({ name, activityType, segments, waypoints }) {
    if (!segments.flat().length) { UI.toast('No route to save', 'warning'); return; }
    const gpxText = GPX.export(name, activityType, segments, waypoints);
    const blob = new Blob([gpxText], { type: 'application/gpx+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(name || 'route').replace(/[^a-z0-9]/gi, '_')}.gpx`;
    a.click();
    URL.revokeObjectURL(a.href);
    UI.toast('GPX saved!', 'success');
  }

  return { init, saveGPX };
})();
