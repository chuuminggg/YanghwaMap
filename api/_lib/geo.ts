/**
 * 서버에서 쓰는 거리 계산.
 *
 * 화장실은 Postgres가 SQL 안에서 haversine을 돌리고(api/_lib/restrooms.ts),
 * 프런트는 위치가 갱신될 때 재정렬하려고 같은 식을 한 번 더 갖는다(src/lib/geo.ts).
 * 운전 탭은 DB를 거치지 않고 외부 API 응답을 그 자리에서 정렬해야 해서 세 번째 자리가 필요하다.
 * 세 곳이 같은 식을 써야 같은 목록에서 거리가 어긋나지 않는다.
 */

const EARTH_RADIUS_M = 6_371_000
const toRad = (deg: number) => (deg * Math.PI) / 180

export type LatLng = { lat: number; lng: number }

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.asin(Math.sqrt(h))
}

/** 대한민국 본토 + 도서 범위. 원본이 0이나 엉뚱한 좌표를 준 행을 거른다. */
export const inKorea = (lat: number, lng: number) =>
  lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132
