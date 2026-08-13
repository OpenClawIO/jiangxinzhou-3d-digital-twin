export const WGS84_A = 6_378_137;
export const WGS84_F = 1 / 298.257223563;
export const WGS84_B = (1 - WGS84_F) * WGS84_A;
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);

const radians = (degrees) => (degrees * Math.PI) / 180;
const X_PI = (Math.PI * 3000) / 180;

const outOfChina = ([longitude, latitude]) => longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
const transformLatitude = (x, y) => {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  value += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  value += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  value += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return value;
};
const transformLongitude = (x, y) => {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  value += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  value += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  value += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return value;
};

/** Convert WGS84 longitude/latitude to mainland China GCJ-02. */
export function wgs84ToGcj02(coordinate) {
  if (outOfChina(coordinate)) return [...coordinate];
  const [longitude, latitude] = coordinate;
  const a = 6_378_245;
  const ee = 0.006693421622965943;
  const dLat = transformLatitude(longitude - 105, latitude - 35);
  const dLng = transformLongitude(longitude - 105, latitude - 35);
  const radLat = radians(latitude);
  const magic = 1 - ee * Math.sin(radLat) ** 2;
  const sqrtMagic = Math.sqrt(magic);
  const longitudeOffset = (dLng * 180) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  const latitudeOffset = (dLat * 180) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  return [
    longitude + longitudeOffset,
    latitude + latitudeOffset,
  ];
}

/** Convert GCJ-02 longitude/latitude to WGS84 by the standard inverse approximation. */
export function gcj02ToWgs84(coordinate) {
  if (outOfChina(coordinate)) return [...coordinate];
  const transformed = wgs84ToGcj02(coordinate);
  return [coordinate[0] * 2 - transformed[0], coordinate[1] * 2 - transformed[1]];
}

/** Convert Baidu BD-09 longitude/latitude to GCJ-02. */
export function bd09ToGcj02([longitude, latitude]) {
  const x = longitude - 0.0065;
  const y = latitude - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

/** Convert Baidu BD-09 longitude/latitude directly to canonical WGS84. */
export function bd09ToWgs84(coordinate) {
  return gcj02ToWgs84(bd09ToGcj02(coordinate));
}

/** Convert WGS84 longitude/latitude directly to Baidu BD-09 for offline source comparison. */
export function wgs84ToBd09(coordinate) {
  const [longitude, latitude] = wgs84ToGcj02(coordinate);
  const z = Math.sqrt(longitude * longitude + latitude * latitude) + 0.00002 * Math.sin(latitude * X_PI);
  const theta = Math.atan2(latitude, longitude) + 0.000003 * Math.cos(longitude * X_PI);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

/** Local equirectangular scale derived from the WGS84 ellipsoid at a latitude. */
export function metersPerDegreeAt(latitude) {
  const phi = radians(latitude);
  const sinPhi = Math.sin(phi);
  const denominator = Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  const primeVerticalRadius = WGS84_A / denominator;
  const meridianRadius = (WGS84_A * (1 - WGS84_E2)) / denominator ** 3;
  return {
    longitude: radians(1) * primeVerticalRadius * Math.cos(phi),
    latitude: radians(1) * meridianRadius,
  };
}

export function projectLocal([longitude, latitude], [originLongitude, originLatitude]) {
  const scale = metersPerDegreeAt(originLatitude);
  return [
    (longitude - originLongitude) * scale.longitude,
    (latitude - originLatitude) * scale.latitude,
  ];
}

/** Vincenty inverse distance on WGS84. Falls back to a spherical distance if convergence fails. */
export function geodesicDistanceM([longitude1, latitude1], [longitude2, latitude2]) {
  if (longitude1 === longitude2 && latitude1 === latitude2) return 0;
  const phi1 = radians(latitude1);
  const phi2 = radians(latitude2);
  const reduced1 = Math.atan((1 - WGS84_F) * Math.tan(phi1));
  const reduced2 = Math.atan((1 - WGS84_F) * Math.tan(phi2));
  const sinU1 = Math.sin(reduced1);
  const cosU1 = Math.cos(reduced1);
  const sinU2 = Math.sin(reduced2);
  const cosU2 = Math.cos(reduced2);
  const longitudeDifference = radians(longitude2 - longitude1);
  let lambda = longitudeDifference;
  let previous;
  let sinSigma;
  let cosSigma;
  let sigma;
  let sinAlpha;
  let cosSqAlpha;
  let cos2SigmaM;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2
      + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    );
    if (sinSigma === 0) return 0;
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const coefficient = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    previous = lambda;
    lambda = longitudeDifference + (1 - coefficient) * WGS84_F * sinAlpha * (
      sigma + coefficient * sinSigma * (
        cos2SigmaM + coefficient * cosSigma * (-1 + 2 * cos2SigmaM ** 2)
      )
    );
    if (Math.abs(lambda - previous) < 1e-12) break;
    if (iteration === 99) {
      const deltaLatitude = phi2 - phi1;
      const deltaLongitude = radians(longitude2 - longitude1);
      const h = Math.sin(deltaLatitude / 2) ** 2
        + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLongitude / 2) ** 2;
      return 6_371_008.8 * 2 * Math.asin(Math.sqrt(h));
    }
  }

  const uSq = cosSqAlpha * (WGS84_A ** 2 - WGS84_B ** 2) / WGS84_B ** 2;
  const aCoefficient = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const bCoefficient = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = bCoefficient * sinSigma * (
    cos2SigmaM + (bCoefficient / 4) * (
      cosSigma * (-1 + 2 * cos2SigmaM ** 2)
      - (bCoefficient / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)
    )
  );
  return WGS84_B * aCoefficient * (sigma - deltaSigma);
}

export function polylineLengthM(coordinates) {
  return coordinates.slice(1).reduce(
    (total, coordinate, index) => total + geodesicDistanceM(coordinates[index], coordinate),
    0,
  );
}

/** Stable local-area calculation for visitor-scale polygons around one origin. */
export function polygonAreaM2(ring) {
  const origin = [
    ring.reduce((sum, [longitude]) => sum + longitude, 0) / ring.length,
    ring.reduce((sum, [, latitude]) => sum + latitude, 0) / ring.length,
  ];
  const projected = ring.map((coordinate) => projectLocal(coordinate, origin));
  return Math.abs(projected.slice(0, -1).reduce((area, [x1, y1], index) => {
    const [x2, y2] = projected[index + 1];
    return area + x1 * y2 - x2 * y1;
  }, 0) / 2);
}
