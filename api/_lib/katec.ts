/**
 * WGS84 ↔ KATEC(TM128) 좌표 변환.
 *
 * 오피넷 반경 검색(`aroundAll.do`)은 기준점을 KATEC으로 받고, 응답의 주유소 좌표도 KATEC이다.
 * 우리 앱은 처음부터 끝까지 WGS84(브라우저 geolocation·카카오맵)를 쓰므로 양방향이 다 필요하다.
 *   보낼 때: 브라우저 위치(WGS84) → KATEC
 *   받을 때: 주유소 좌표(KATEC) → WGS84 (지도에 마커를 찍어야 하므로)
 *
 * KATEC은 Bessel 1841 타원체 위의 횡단 메르카토르다. WGS84와 타원체가 다르므로
 * 투영 전에 3매개변수 데이텀 변환(Molodensky)을 먼저 거친다. 높이는 0으로 둔다 —
 * 이 앱은 지표면의 점만 다루고, 고도를 무시해 생기는 오차는 미터 이하다.
 */

const WGS84_A = 6_378_137.0
const WGS84_F = 1 / 298.257223563
const BESSEL_A = 6_377_397.155
const BESSEL_F = 1 / 299.1528128

/** 대한민국 통합원점(UTM-K가 아닌 구 KATEC) 투영 상수 */
const LAT0 = radians(38.0)
const LON0 = radians(128.0)
const FALSE_EASTING = 400_000.0
const FALSE_NORTHING = 600_000.0
const SCALE = 0.9999

/** WGS84 → Bessel 지심 좌표 이동량(m). 국내에서 통용되는 값. */
const WGS84_TO_BESSEL: readonly [number, number, number] = [146.43, -507.89, -681.46]

const WGS84_E2 = 2 * WGS84_F - WGS84_F ** 2
const BESSEL_E2 = 2 * BESSEL_F - BESSEL_F ** 2
/** 제2이심률 e'^2 — 횡단 메르카토르 급수 전개에 쓰인다 */
const BESSEL_EP2 = BESSEL_E2 / (1 - BESSEL_E2)

function radians(value: number) {
  return (value * Math.PI) / 180
}

const degrees = (value: number) => (value * 180) / Math.PI

/** 적도에서 위도 phi까지의 자오선 호 길이 */
function meridionalArc(phi: number, a: number, e2: number) {
  return (
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi))
  )
}

/**
 * 3매개변수 데이텀 변환. 측지좌표 → 지심 직교좌표 → 이동 → 다시 측지좌표.
 * sign=+1 이면 WGS84→Bessel, -1 이면 Bessel→WGS84 (같은 식을 반대로 쓴다).
 */
function shiftDatum(
  latRad: number,
  lonRad: number,
  from: { a: number; e2: number },
  to: { a: number; e2: number },
  sign: 1 | -1,
) {
  const [dx, dy, dz] = WGS84_TO_BESSEL
  const sinLat = Math.sin(latRad)
  const cosLat = Math.cos(latRad)
  const n = from.a / Math.sqrt(1 - from.e2 * sinLat ** 2)

  const x = n * cosLat * Math.cos(lonRad) + sign * dx
  const y = n * cosLat * Math.sin(lonRad) + sign * dy
  const z = n * (1 - from.e2) * sinLat + sign * dz

  const lon = Math.atan2(y, x)
  const horizontal = Math.sqrt(x ** 2 + y ** 2)
  let lat = Math.atan2(z, horizontal * (1 - to.e2))

  // 위도는 닫힌 해가 없어 반복해서 좁힌다. 8회면 1e-14 rad 아래로 수렴한다.
  for (let i = 0; i < 8; i++) {
    const sin = Math.sin(lat)
    const radius = to.a / Math.sqrt(1 - to.e2 * sin ** 2)
    const next = Math.atan2(z + to.e2 * radius * sin, horizontal)
    if (Math.abs(next - lat) < 1e-14) return { lat: next, lon }
    lat = next
  }
  return { lat, lon }
}

const WGS84 = { a: WGS84_A, e2: WGS84_E2 }
const BESSEL = { a: BESSEL_A, e2: BESSEL_E2 }

export type Katec = { x: number; y: number }

/** WGS84 위경도 → KATEC 미터 좌표 */
export function wgs84ToKatec(lat: number, lng: number): Katec {
  const { lat: phi, lon: lambda } = shiftDatum(radians(lat), radians(lng), WGS84, BESSEL, 1)

  const sinPhi = Math.sin(phi)
  const cosPhi = Math.cos(phi)
  const tanPhi = Math.tan(phi)

  const n = BESSEL_A / Math.sqrt(1 - BESSEL_E2 * sinPhi ** 2)
  const t = tanPhi ** 2
  const c = BESSEL_EP2 * cosPhi ** 2
  const a = (lambda - LON0) * cosPhi

  const m = meridionalArc(phi, BESSEL_A, BESSEL_E2)
  const m0 = meridionalArc(LAT0, BESSEL_A, BESSEL_E2)

  const x =
    FALSE_EASTING +
    SCALE *
      n *
      (a +
        ((1 - t + c) * a ** 3) / 6 +
        ((5 - 18 * t + t ** 2 + 72 * c - 58 * BESSEL_EP2) * a ** 5) / 120)

  const y =
    FALSE_NORTHING +
    SCALE *
      (m -
        m0 +
        n *
          tanPhi *
          (a ** 2 / 2 +
            ((5 - t + 9 * c + 4 * c ** 2) * a ** 4) / 24 +
            ((61 - 58 * t + t ** 2 + 600 * c - 330 * BESSEL_EP2) * a ** 6) / 720))

  return { x, y }
}

/** KATEC 미터 좌표 → WGS84 위경도. wgs84ToKatec의 역변환. */
export function katecToWgs84(x: number, y: number): { lat: number; lng: number } {
  const m = (y - FALSE_NORTHING) / SCALE + meridionalArc(LAT0, BESSEL_A, BESSEL_E2)
  const mu = m / (BESSEL_A * (1 - BESSEL_E2 / 4 - (3 * BESSEL_E2 ** 2) / 64 - (5 * BESSEL_E2 ** 3) / 256))

  // 자오선 호 길이 m 에 대응하는 위도(footpoint latitude)를 급수로 되돌린다
  const e1 = (1 - Math.sqrt(1 - BESSEL_E2)) / (1 + Math.sqrt(1 - BESSEL_E2))
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)

  const sinPhi1 = Math.sin(phi1)
  const cosPhi1 = Math.cos(phi1)
  const tanPhi1 = Math.tan(phi1)

  const c1 = BESSEL_EP2 * cosPhi1 ** 2
  const t1 = tanPhi1 ** 2
  const n1 = BESSEL_A / Math.sqrt(1 - BESSEL_E2 * sinPhi1 ** 2)
  const r1 = (BESSEL_A * (1 - BESSEL_E2)) / (1 - BESSEL_E2 * sinPhi1 ** 2) ** 1.5
  const d = (x - FALSE_EASTING) / (n1 * SCALE)

  const phi =
    phi1 -
    ((n1 * tanPhi1) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * BESSEL_EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * BESSEL_EP2 - 3 * c1 ** 2) * d ** 6) / 720)

  const lambda =
    LON0 +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * BESSEL_EP2 + 24 * t1 ** 2) * d ** 5) / 120) /
      cosPhi1

  const { lat, lon } = shiftDatum(phi, lambda, BESSEL, WGS84, -1)
  return { lat: degrees(lat), lng: degrees(lon) }
}
