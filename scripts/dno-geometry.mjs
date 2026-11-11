// Helpers to turn NESO's DNO licence-area GeoJSON (British National Grid, EPSG:27700)
// into small, simplified WGS84 polygons for the web map. No dependencies.

// --- OSGB36 National Grid (E, N) -> WGS84 (lat, lng). Accurate to a few metres. ---
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

export function osgbToWgs84(E, N) {
    // Airy 1830 ellipsoid, National Grid projection constants
    const a = 6377563.396, b = 6356256.909, F0 = 0.9996012717;
    const lat0 = toRad(49), lon0 = toRad(-2), N0 = -100000, E0 = 400000;
    const e2 = 1 - (b * b) / (a * a), n = (a - b) / (a + b), n2 = n * n, n3 = n * n * n;

    let lat = lat0, M = 0;
    do {
        lat = (N - N0 - M) / (a * F0) + lat;
        const Ma = (1 + n + (5 / 4) * n2 + (5 / 4) * n3) * (lat - lat0);
        const Mb = (3 * n + 3 * n * n + (21 / 8) * n3) * Math.sin(lat - lat0) * Math.cos(lat + lat0);
        const Mc = ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * (lat - lat0)) * Math.cos(2 * (lat + lat0));
        const Md = (35 / 24) * n3 * Math.sin(3 * (lat - lat0)) * Math.cos(3 * (lat + lat0));
        M = b * F0 * (Ma - Mb + Mc - Md);
    } while (Math.abs(N - N0 - M) >= 0.00001);

    const sinLat = Math.sin(lat), cosLat = Math.cos(lat), tanLat = Math.tan(lat);
    const nu = a * F0 / Math.sqrt(1 - e2 * sinLat * sinLat);
    const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
    const eta2 = nu / rho - 1;
    const tan2 = tanLat * tanLat, tan4 = tan2 * tan2, tan6 = tan4 * tan2;
    const secLat = 1 / cosLat;
    const nu3 = nu * nu * nu, nu5 = nu3 * nu * nu, nu7 = nu5 * nu * nu;
    const VII = tanLat / (2 * rho * nu);
    const VIII = tanLat / (24 * rho * nu3) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
    const IX = tanLat / (720 * rho * nu5) * (61 + 90 * tan2 + 45 * tan4);
    const X = secLat / nu;
    const XI = secLat / (6 * nu3) * (nu / rho + 2 * tan2);
    const XII = secLat / (120 * nu5) * (5 + 28 * tan2 + 24 * tan4);
    const XIIA = secLat / (5040 * nu7) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);
    const dE = E - E0, dE2 = dE * dE, dE3 = dE2 * dE, dE4 = dE2 * dE2, dE5 = dE4 * dE, dE6 = dE4 * dE2, dE7 = dE6 * dE;
    const phi = lat - VII * dE2 + VIII * dE4 - IX * dE6;
    const lam = lon0 + X * dE - XI * dE3 + XII * dE5 - XIIA * dE7;

    // OSGB36 lat/lon -> cartesian (Airy 1830)
    const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
    const nuA = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    const x1 = nuA * cosPhi * Math.cos(lam), y1 = nuA * cosPhi * Math.sin(lam), z1 = (1 - e2) * nuA * sinPhi;

    // Helmert transform OSGB36 -> WGS84
    const tx = 446.448, ty = -125.157, tz = 542.060, s = 20.4894e-6;
    const rx = toRad(0.1502 / 3600), ry = toRad(0.2470 / 3600), rz = toRad(0.8421 / 3600);
    const x2 = tx + (1 + s) * x1 - rz * y1 + ry * z1;
    const y2 = ty + rz * x1 + (1 + s) * y1 - rx * z1;
    const z2 = tz - ry * x1 + rx * y1 + (1 + s) * z1;

    // Cartesian -> WGS84 lat/lon (GRS80/WGS84 ellipsoid)
    const aW = 6378137, bW = 6356752.3142, e2W = 1 - (bW * bW) / (aW * aW);
    const p = Math.sqrt(x2 * x2 + y2 * y2);
    let latW = Math.atan2(z2, p * (1 - e2W)), prev = 2 * Math.PI;
    while (Math.abs(latW - prev) > 1e-12) {
        const nuW = aW / Math.sqrt(1 - e2W * Math.sin(latW) ** 2);
        prev = latW;
        latW = Math.atan2(z2 + e2W * nuW * Math.sin(latW), p);
    }
    return [toDeg(latW), toDeg(Math.atan2(y2, x2))];
}

// --- Douglas-Peucker simplification on projected (metre) coordinates ---
function simplify(points, tol) {
    if (points.length <= 4) return points;
    const sq = tol * tol;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [first, last] = stack.pop();
        let maxD = 0, idx = 0;
        const [x1, y1] = points[first], [x2, y2] = points[last];
        const dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy;
        for (let i = first + 1; i < last; i++) {
            const [px, py] = points[i];
            let t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
            t = Math.max(0, Math.min(1, t));
            const ex = x1 + t * dx - px, ey = y1 + t * dy - py, d = ex * ex + ey * ey;
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (maxD > sq) { keep[idx] = 1; stack.push([first, idx], [idx, last]); }
    }
    return points.filter((_, i) => keep[i]);
}

const ringArea = ring => {
    let s = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    return Math.abs(s / 2);
};

// tolerance in metres; islands smaller than minAreaKm2 are dropped to keep the file small
export function processDnoGeoJson(geojson, { tolerance = 250, minAreaKm2 = 3 } = {}) {
    const r4 = v => Math.round(v * 1e4) / 1e4;
    return geojson.features.map(f => {
        const g = f.geometry;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
        const polygons = polys
            .map(rings => rings[0]) // outer ring only
            .filter(ring => ringArea(ring) >= minAreaKm2 * 1e6)
            .map(ring => simplify(ring, tolerance).map(([E, N]) => {
                const [lat, lng] = osgbToWgs84(E, N);
                return [r4(lat), r4(lng)];
            }))
            .filter(ring => ring.length >= 4);
        const p = f.properties || {};
        return { area: p.Area, dno: p.DNO, dnoFull: p.DNO_Full, polygons };
    });
}
