import type { NearbyRestroom } from '../../src/types/restroom.js'
import { db, InvalidInputError } from './db.js'

/** 위도 1도 ≈ 111.32km. bbox를 만들 때만 쓰는 근사값이고, 정렬은 haversine이 담당한다. */
const METERS_PER_DEGREE_LAT = 111_320

export const RADIUS_LIMITS = { min: 100, max: 5_000, fallback: 1_000 }
export const RESULT_LIMITS = { min: 1, max: 100, fallback: 30 }

export type NearbyParams = {
  lat: number
  lng: number
  radiusMeters: number
  limit: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** 쿼리스트링 값은 string | string[] | undefined 로 들어온다. */
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

function requireCoord(raw: string | string[] | undefined, name: string, bound: number): number {
  const value = Number(first(raw))
  if (!first(raw) || !Number.isFinite(value) || Math.abs(value) > bound) {
    throw new InvalidInputError(`'${name}' 값이 올바르지 않습니다.`)
  }
  return value
}

/** 범위를 벗어난 radius/limit은 거절하지 않고 조용히 자른다 — 지도 UI가 멈추는 것보다 낫다. */
function optionalInt(raw: string | string[] | undefined, limits: { min: number; max: number; fallback: number }) {
  const value = Number(first(raw))
  if (!first(raw) || !Number.isFinite(value)) return limits.fallback
  return Math.round(clamp(value, limits.min, limits.max))
}

export function parseNearbyQuery(query: Record<string, string | string[] | undefined>): NearbyParams {
  return {
    lat: requireCoord(query.lat, 'lat', 90),
    lng: requireCoord(query.lng, 'lng', 180),
    radiusMeters: optionalInt(query.radius, RADIUS_LIMITS),
    limit: optionalInt(query.limit, RESULT_LIMITS),
  }
}

type Row = {
  id: string
  code: string
  name: string
  type: string
  road_address: string
  jibun_address: string
  lat: number
  lng: number
  manager: string
  phone: string
  open_time: string
  open_time_detail: string
  men_toilets: number
  women_toilets: number
  accessible: boolean
  diaper_table: boolean | null
  emergency_bell: boolean | null
  cctv: boolean | null
  data_date: string
  distance_m: number
}

/** snake_case 행을 프런트가 그대로 쓰는 모양으로 (null → undefined). db.ts의 toRestaurant와 같은 규칙. */
const toRestroom = (row: Row): NearbyRestroom => ({
  id: row.id,
  code: row.code,
  name: row.name,
  type: row.type,
  roadAddress: row.road_address,
  jibunAddress: row.jibun_address,
  lat: row.lat,
  lng: row.lng,
  manager: row.manager,
  phone: row.phone,
  openTime: row.open_time,
  openTimeDetail: row.open_time_detail,
  menToilets: row.men_toilets,
  womenToilets: row.women_toilets,
  accessible: row.accessible,
  diaperTable: row.diaper_table ?? undefined,
  emergencyBell: row.emergency_bell ?? undefined,
  cctv: row.cctv ?? undefined,
  dataDate: row.data_date,
  distanceMeters: Math.round(row.distance_m),
})

/**
 * 기준점에서 가까운 순으로 화장실을 찾는다.
 *
 * bbox로 인덱스를 태워 후보를 줄인 뒤 haversine으로 정렬한다. bbox는 원보다 넓으므로
 * (모서리가 반경 밖) 정렬 후 반경으로 한 번 더 자른다.
 */
export async function findNearbyRestrooms({
  lat,
  lng,
  radiusMeters,
  limit,
}: NearbyParams): Promise<NearbyRestroom[]> {
  const dLat = radiusMeters / METERS_PER_DEGREE_LAT
  // 고위도로 갈수록 경도 1도의 실제 거리가 짧아진다. 극지방에서 0으로 나누지 않도록 하한을 둔다.
  const dLng = radiusMeters / (METERS_PER_DEGREE_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))

  const rows = await db().query(
    `select r.*,
            6371000 * 2 * asin(sqrt(
              power(sin(radians(r.lat - $1) / 2), 2) +
              cos(radians($1)) * cos(radians(r.lat)) *
              power(sin(radians(r.lng - $2) / 2), 2)
            )) as distance_m
       from restrooms r
      where r.lat between $1 - $3 and $1 + $3
        and r.lng between $2 - $4 and $2 + $4
      order by distance_m
      limit $5`,
    [lat, lng, dLat, dLng, limit],
  )

  return (rows as Row[]).filter((row) => row.distance_m <= radiusMeters).map(toRestroom)
}
