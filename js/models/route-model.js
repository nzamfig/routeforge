// Pure route data model: points + cumulative distances.
// No Leaflet, no DOM. Depends only on Geo.

const RouteModel = (() => {

  let _points   = [];   // [{lat, lon, ele?}]
  let _cumDists = [];   // cumulative km from start, parallel to _points

  // ── Accessors ─────────────────────────────────────────────────────────
  function getPoints()    { return _points; }
  function getPoint(i)    { return _points[i]; }
  function getLength()    { return _points.length; }
  function getCumDists()  { return _cumDists; }
  function getCumDist(i)  { return _cumDists[i] ?? 0; }

  // Distance (km) at a fractional position t along segment afterIdx → afterIdx+1
  function distAtSegPos(afterIdx, t) {
    const base = _cumDists[afterIdx] ?? 0;
    const next = _cumDists[afterIdx + 1];
    return next != null ? base + (next - base) * t : base;
  }

  // ── Mutations ─────────────────────────────────────────────────────────
  function setPoints(pts) {
    _points = pts.map(p => ({ ...p }));
    _recompute();
  }

  function addPoint(pt) {
    _points.push({ ...pt });
    const i = _points.length - 1;
    _cumDists.push(i === 0 ? 0 : _cumDists[i - 1] + Geo.haversine(_points[i - 1], _points[i]));
  }

  function removePoint(idx) {
    _points.splice(idx, 1);
    _recompute();
  }

  function insertPoint(afterIdx, pt) {
    _points.splice(afterIdx + 1, 0, { ...pt });
    _recompute();
  }

  // Update lat/lon in place during drag; caller must call recomputeCumDists() after drag ends
  function updatePoint(idx, lat, lon) {
    _points[idx].lat = lat;
    _points[idx].lon = lon;
  }

  function recomputeCumDists() { _recompute(); }

  function clear() { _points = []; _cumDists = []; }

  // ── Snapshot (for undo/redo) ───────────────────────────────────────────
  function snapshot()          { return _points.map(p => ({ ...p })); }
  function restoreSnapshot(pts){ setPoints(pts); }

  // ── Internal ──────────────────────────────────────────────────────────
  function _recompute() {
    _cumDists = [0];
    for (let i = 1; i < _points.length; i++) {
      _cumDists.push(_cumDists[i - 1] + Geo.haversine(_points[i - 1], _points[i]));
    }
  }

  return {
    getPoints, getPoint, getLength,
    getCumDists, getCumDist, distAtSegPos,
    setPoints, addPoint, removePoint, insertPoint, updatePoint,
    recomputeCumDists, clear,
    snapshot, restoreSnapshot,
  };
})();
