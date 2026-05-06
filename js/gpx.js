// GPX 1.1 parser and exporter

const GPX = (() => {

  function parse(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid GPX file');

    const result = { name: '', type: '', trackPoints: [], waypoints: [] };

    const nameEl = doc.querySelector('metadata > name') || doc.querySelector('trk > name');
    if (nameEl) result.name = nameEl.textContent.trim();

    const typeEl = doc.querySelector('trk > type');
    if (typeEl) result.type = typeEl.textContent.trim().toLowerCase();

    // Track points
    doc.querySelectorAll('trkpt').forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      const eleEl = pt.querySelector('ele');
      const ele = eleEl ? parseFloat(eleEl.textContent) : null;
      if (!isNaN(lat) && !isNaN(lon)) {
        result.trackPoints.push({ lat, lon, ele });
      }
    });

    // Waypoints
    doc.querySelectorAll('wpt').forEach(wpt => {
      const lat = parseFloat(wpt.getAttribute('lat'));
      const lon = parseFloat(wpt.getAttribute('lon'));
      const nameEl = wpt.querySelector('name');
      const descEl = wpt.querySelector('desc');
      const symEl = wpt.querySelector('sym');
      if (!isNaN(lat) && !isNaN(lon)) {
        result.waypoints.push({
          lat, lon,
          name: nameEl ? nameEl.textContent.trim() : '',
          note: descEl ? descEl.textContent.trim() : '',
          type: symEl ? symEl.textContent.trim().toLowerCase() : 'checkpoint',
        });
      }
    });

    return result;
  }

  function export_(routeName, activityType, segments, waypoints) {
    const now = new Date().toISOString();
    const creator = 'RouteForge';

    // Flatten all segment points into one track
    let trkpts = '';
    segments.forEach(seg => {
      seg.forEach(pt => {
        const ele = pt.ele != null ? `\n        <ele>${pt.ele.toFixed(1)}</ele>` : '';
        trkpts += `      <trkpt lat="${pt.lat.toFixed(7)}" lon="${pt.lon.toFixed(7)}">${ele}\n      </trkpt>\n`;
      });
    });

    let wpts = '';
    waypoints.forEach(wpt => {
      const sym = markerTypeToSym(wpt.type);
      wpts += `  <wpt lat="${wpt.lat.toFixed(7)}" lon="${wpt.lon.toFixed(7)}">\n`;
      if (wpt.name) wpts += `    <name>${escapeXml(wpt.name)}</name>\n`;
      if (wpt.note) wpts += `    <desc>${escapeXml(wpt.note)}</desc>\n`;
      wpts += `    <sym>${sym}</sym>\n`;
      wpts += `  </wpt>\n`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${creator}"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(routeName)}</name>
    <author><name>${creator}</name></author>
    <time>${now}</time>
  </metadata>
${wpts}  <trk>
    <name>${escapeXml(routeName)}</name>
    <type>${escapeXml(activityType)}</type>
    <trkseg>
${trkpts}    </trkseg>
  </trk>
</gpx>`;
  }

  function escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function markerTypeToSym(type) {
    const map = {
      start: 'Flag, Green',
      finish: 'Flag, Blue',
      checkpoint: 'Circle with X',
      water: 'Drinking Water',
      warning: 'Caution',
    };
    return map[type] || 'Waypoint';
  }

  function symToMarkerType(sym) {
    const s = (sym || '').toLowerCase();
    if (s.includes('green')) return 'start';
    if (s.includes('blue')) return 'finish';
    if (s.includes('water') || s.includes('drink')) return 'water';
    if (s.includes('caution') || s.includes('warn')) return 'warning';
    return 'checkpoint';
  }

  return { parse, export: export_, symToMarkerType };
})();
