// UI helpers: toast, activity toggle, layer switcher, stats, search

const UI = (() => {

  // ── Toast ────────────────────────────────────────────────────────────

  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = {
      info:    '<circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01"/>',
      success: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
      warning: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',
      error:   '<path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    };
    const el = document.createElement('div');
    el.className = `toast toast-${type in icons ? type : 'info'}`;
    el.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${icons[type] || icons.info}</svg>${message}`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // ── Stats Panel ──────────────────────────────────────────────────────

  function updateStats(trackPoints, activityType, elevationPts) {
    const pts = trackPoints.length ? trackPoints : [];
    const dists = Geo.computeDistances(pts);
    const totalKm = dists.length ? dists[dists.length - 1] : 0;

    document.getElementById('stat-distance').textContent = totalKm.toFixed(2) + ' km';

    const speed = activityType === 'running' ? 10 : 20;
    if (totalKm > 0) {
      const hrs = totalKm / speed;
      const h = Math.floor(hrs);
      const m = Math.round((hrs - h) * 60);
      document.getElementById('stat-time').textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
    } else {
      document.getElementById('stat-time').textContent = '—';
    }

    const src = elevationPts && elevationPts.length ? elevationPts : pts;
    const stats = Stats.calcStats(src);
    document.getElementById('stat-gain').textContent = stats.gain != null ? `↑ ${Math.round(stats.gain)} m` : '—';
    document.getElementById('stat-loss').textContent = stats.loss != null ? `↓ ${Math.round(stats.loss)} m` : '—';
    document.getElementById('stat-max-ele').textContent = stats.maxEle != null ? Math.round(stats.maxEle) + ' m' : '—';
  }

  // ── Activity Toggle ──────────────────────────────────────────────────

  function setActivityUI(type) {
    document.querySelectorAll('.activity-btn').forEach(btn => {
      btn.classList.toggle('act-active', btn.dataset.activity === type);
    });
    document.body.classList.toggle('activity-running', type === 'running');
  }

  // ── Layer Switcher ───────────────────────────────────────────────────

  function initLayerSwitcher(onLayerChange) {
    const btn = document.getElementById('layer-toggle-btn');
    const dropdown = document.getElementById('layer-dropdown');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', () => dropdown.classList.add('hidden'));
    document.querySelectorAll('.layer-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        const key = opt.dataset.layer;
        onLayerChange(key);
        dropdown.classList.add('hidden');
        setActiveLayerUI(key);
      });
    });
    setActiveLayerUI('carto');
  }

  function setActiveLayerUI(key) {
    document.querySelectorAll('.layer-opt').forEach(opt => {
      const dot = opt.querySelector('.layer-dot');
      const isActive = opt.dataset.layer === key;
      opt.classList.toggle('lyr-active', isActive);
      if (dot) dot.classList.toggle('hidden', !isActive);
    });
  }

  // ── Elevation Panel toggle ───────────────────────────────────────────

  function initPanelToggle() {
    const chartArea = document.getElementById('elevation-chart-area');
    document.getElementById('btn-panel-toggle').addEventListener('click', () => {
      chartArea.classList.add('hidden');
    });
  }

  function openElevationPanel() {
    document.getElementById('elevation-chart-area').classList.remove('hidden');
  }

  // ── Address Search (Nominatim) ───────────────────────────────────────

  function initSearch(onSelect) {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    let timer = null;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3) { results.classList.remove('visible'); return; }
      timer = setTimeout(() => fetchSearch(q, results, onSelect), 1000);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { results.classList.remove('visible'); input.blur(); }
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !results.contains(e.target)) results.classList.remove('visible');
    });
  }

  async function fetchSearch(q, resultsEl, onSelect) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      if (!data.length) {
        resultsEl.innerHTML = '<div class="sr-item" style="color:var(--subtle);cursor:default">No results found</div>';
        resultsEl.classList.add('visible');
        return;
      }
      resultsEl.innerHTML = '';
      data.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'sr-item';
        btn.textContent = item.display_name;
        btn.addEventListener('click', () => {
          onSelect({ lat: parseFloat(item.lat), lon: parseFloat(item.lon), name: item.display_name });
          resultsEl.classList.remove('visible');
          document.getElementById('search-input').value = item.display_name.split(',')[0];
        });
        resultsEl.appendChild(btn);
      });
      resultsEl.classList.add('visible');
    } catch {
      toast('Search failed — check your connection', 'error');
    }
  }

  // ── Session persistence ──────────────────────────────────────────────

  const SESSION_KEY = 'routeforge_session';

  function saveSession(data) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch {}
  }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // ── URL sharing ──────────────────────────────────────────────────────

  function encodeRouteToHash(data) {
    const json = JSON.stringify(data);
    const b64 = btoa(encodeURIComponent(json));
    return b64;
  }

  function decodeRouteFromHash(hash) {
    try {
      const json = decodeURIComponent(atob(hash));
      return JSON.parse(json);
    } catch { return null; }
  }

  function copyShareLink(data) {
    const encoded = encodeRouteToHash(data);
    if (encoded.length > 8000) {
      toast('Route is too long for URL sharing. Please use GPX export.', 'warning');
      return;
    }
    const url = `${location.origin}${location.pathname}#route=${encoded}`;
    navigator.clipboard.writeText(url).then(
      () => toast('Link copied to clipboard!', 'success'),
      () => toast('Copy failed — try GPX export instead', 'error')
    );
  }

  return {
    toast,
    updateStats,
    setActivityUI,
    initLayerSwitcher,
    initPanelToggle,
    openElevationPanel,
    initSearch,
    saveSession,
    loadSession,
    clearSession,
    copyShareLink,
    decodeRouteFromHash,
  };
})();
