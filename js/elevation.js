// Elevation fetching via Open-Meteo API and chart rendering.
// Depends on: Geo (utils/geo.js), Stats (utils/stats.js)

const Elevation = (() => {
  const API = 'https://api.open-meteo.com/v1/elevation';
  const MAX_POINTS = 100;

  async function fetchForPoints(latLons) {
    if (!latLons.length) return [];
    const sampled = _subsample(latLons, MAX_POINTS);
    const lats = sampled.map(p => p.lat).join(',');
    const lons = sampled.map(p => p.lon).join(',');

    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`${API}?latitude=${lats}&longitude=${lons}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Elevation API error: ${res.status}`);
      const data = await res.json();
      return sampled.map((p, i) => ({ ...p, ele: data.elevation[i] }));
    } finally {
      clearTimeout(tid);
    }
  }

  function _subsample(pts, max) {
    if (pts.length <= max) return pts;
    const result = [];
    const step = (pts.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) result.push(pts[Math.round(i * step)]);
    return result;
  }

  // Draw elevation profile chart. Returns { setExternalHover, clearExternalHover }.
  // onHover(info|null) — called on canvas mousemove → show pin on map
  // onClick(info)      — called on canvas click → pan map to location
  function drawChart(canvas, pts, onHover, onClick) {
    const dists     = Geo.computeDistances(pts);
    const totalDist = dists[dists.length - 1] || 1;
    const eles      = pts.map(p => p.ele ?? 0);
    const minEle    = Math.min(...eles);
    const maxEle    = Math.max(...eles);
    const eleRange  = (maxEle - minEle) || 1;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    const PAD = { top: 28, right: 24, bottom: 20, left: 48 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top  - PAD.bottom;

    function toX(dist) { return PAD.left + (dist / totalDist) * chartW; }
    function toY(ele)  { return PAD.top  + chartH - ((ele - minEle) / eleRange) * chartH; }

    function distToIdx(d) {
      let best = 0, bestDiff = Infinity;
      dists.forEach((v, i) => { const diff = Math.abs(v - d); if (diff < bestDiff) { bestDiff = diff; best = i; } });
      return best;
    }

    let chartHoverIdx    = null;
    let externalHoverDist = null;

    function drawPin(x, y, color, label) {
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + chartH);
      ctx.strokeStyle = color + '66'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();

      if (label) {
        ctx.font = '11px Inter, sans-serif';
        const tw = ctx.measureText(label).width;
        let tx = x + 8;
        if (tx + tw + 8 > W) tx = x - tw - 16;
        ctx.fillStyle = 'rgba(17,24,39,0.85)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(tx - 4, y - 18, tw + 8, 20, 4);
        else ctx.rect(tx - 4, y - 18, tw + 8, 20);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.fillText(label, tx, y - 3);
      }
    }

    function redraw() {
      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = '#f3f4f6'; ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = PAD.top + (chartH / 4) * i;
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      }

      // Y labels
      ctx.fillStyle = '#9ca3af'; ctx.font = '10px Inter, sans-serif'; ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i++) {
        const ele = maxEle - (eleRange / 4) * i;
        const y   = PAD.top + (chartH / 4) * i;
        ctx.fillText(Math.round(ele) + 'm', PAD.left - 4, y + 3);
      }

      // X labels
      ctx.textAlign = 'center';
      const xSteps = Math.min(5, Math.floor(totalDist));
      for (let i = 0; i <= xSteps; i++) {
        const d = (totalDist / xSteps) * i;
        ctx.fillText(d.toFixed(1) + 'km', toX(d), H - 4);
      }

      // Gradient fill
      const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH);
      grad.addColorStop(0, 'rgba(59,130,246,0.3)');
      grad.addColorStop(1, 'rgba(59,130,246,0.02)');
      ctx.beginPath();
      ctx.moveTo(toX(dists[0]), toY(eles[0]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(dists[i]), toY(eles[i]));
      ctx.lineTo(toX(dists[pts.length - 1]), PAD.top + chartH);
      ctx.lineTo(toX(dists[0]),              PAD.top + chartH);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();

      // Line
      ctx.beginPath();
      ctx.moveTo(toX(dists[0]), toY(eles[0]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(dists[i]), toY(eles[i]));
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

      // External hover pin (map → chart): orange
      if (externalHoverDist != null) {
        const idx = distToIdx(externalHoverDist);
        drawPin(toX(externalHoverDist), toY(eles[idx]), '#f97316',
          `${eles[idx].toFixed(0)}m @ ${externalHoverDist.toFixed(2)}km`);
      }

      // Chart hover pin (chart → map): blue
      if (chartHoverIdx != null) {
        const x = toX(dists[chartHoverIdx]), y = toY(eles[chartHoverIdx]);
        const label = externalHoverDist == null
          ? `${eles[chartHoverIdx].toFixed(0)}m @ ${dists[chartHoverIdx].toFixed(2)}km`
          : null;
        drawPin(x, y, '#3b82f6', label);
      }
    }

    redraw();

    canvas.onmousemove = (e) => {
      const r  = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      if (mx < PAD.left || mx > W - PAD.right) {
        chartHoverIdx = null; redraw(); onHover(null);
        canvas.style.cursor = 'default';
        return;
      }
      const dist = ((mx - PAD.left) / chartW) * totalDist;
      chartHoverIdx = distToIdx(dist);
      redraw();
      canvas.style.cursor = 'pointer';
      onHover({ lat: pts[chartHoverIdx].lat, lon: pts[chartHoverIdx].lon,
                dist: dists[chartHoverIdx], ele: eles[chartHoverIdx] });
    };

    canvas.onmouseleave = () => {
      chartHoverIdx = null; redraw(); onHover(null);
      canvas.style.cursor = 'default';
    };

    canvas.onclick = (e) => {
      if (!onClick) return;
      const r  = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      if (mx < PAD.left || mx > W - PAD.right) return;
      const dist = ((mx - PAD.left) / chartW) * totalDist;
      const idx  = distToIdx(dist);
      onClick({ lat: pts[idx].lat, lon: pts[idx].lon, dist: dists[idx], ele: eles[idx] });
    };

    return {
      setExternalHover:   (distKm) => { externalHoverDist = distKm; redraw(); },
      clearExternalHover: ()       => { externalHoverDist = null;   redraw(); },
    };
  }

  return { fetchForPoints, drawChart };
})();
