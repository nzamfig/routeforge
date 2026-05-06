// Route statistics calculations (no external dependencies)

const Stats = (() => {

  // Compute elevation gain, loss, max/min from an array of {ele?} points
  function calcStats(pts) {
    const hasEle = pts.some(p => p.ele != null);
    let gain = 0, loss = 0, maxEle = -Infinity, minEle = Infinity;
    if (hasEle) {
      pts.forEach(p => {
        if (p.ele == null) return;
        if (p.ele > maxEle) maxEle = p.ele;
        if (p.ele < minEle) minEle = p.ele;
      });
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].ele == null || pts[i - 1].ele == null) continue;
        const diff = pts[i].ele - pts[i - 1].ele;
        if (diff > 0) gain += diff; else loss += Math.abs(diff);
      }
    }
    return {
      hasEle,
      gain:   hasEle ? gain   : null,
      loss:   hasEle ? loss   : null,
      maxEle: hasEle && isFinite(maxEle) ? maxEle : null,
      minEle: hasEle && isFinite(minEle) ? minEle : null,
    };
  }

  return { calcStats };
})();
