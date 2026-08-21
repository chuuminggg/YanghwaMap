export type LatLng = { lat: number; lng: number }

const EARTH_RADIUS_M = 6_371_000
const toRad = (deg: number) => (deg * Math.PI) / 180

/**
 * WGS84 두 지점 사이의 대권 거리(미터).
 *
 * 서버가 같은 식으로 계산해 `distanceMeters`를 붙여 주지만, 위치가 갱신됐을 때
 * 재요청 없이 목록을 다시 정렬하려면 클라이언트에도 같은 계산이 필요하다.
 * (카카오 응답의 `distance` 값은 쓰지 않는다 — 기준이 다르면 정렬이 흔들린다.)
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.asin(Math.sqrt(h))
}

/** 1km 미만은 10m 단위로 끊는다 — GPS 오차가 그보다 크므로 한 자리까지 보여 줄 이유가 없다. */
export const formatDistance = (meters: number) =>
  meters < 1000 ? `${Math.round(meters / 10) * 10}m` : `${(meters / 1000).toFixed(1)}km`
