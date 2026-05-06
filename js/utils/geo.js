// Geometric and geographic utility functions (no external dependencies)

const Geo = (() => {

  function rad(d) { return d * Math.PI / 180; }

  // Haversine great-circle distance between two {lat, lon} points (km)
  function haversine(a, b) {
    const R = 6371;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const sl = Math.sin(dLat / 2), sn = Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(sl * sl + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * sn * sn));
  }

  // Cumulative distance array (km) for an array of {lat, lon} points
  function computeDistances(pts) {
    const dists = [0];
    for (let i = 1; i < pts.length; i++) dists.push(dists[i - 1] + haversine(pts[i - 1], pts[i]));
    return dists;
  }

  // Closest point on segment a→b to point p (all L.Point / {x,y} objects)
  // Returns { dist, t } where t ∈ [0,1] is the parameter along the segment
  function pointToSegDist(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const ab2 = abx * abx + aby * aby;
    let t = ab2 === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * t, cy = a.y + aby * t;
    return { dist: Math.hypot(p.x - cx, p.y - cy), t };
  }

  return { haversine, computeDistances, pointToSegDist };
})();
