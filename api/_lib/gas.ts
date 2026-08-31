import type { GasStation, GasResult } from '../../src/types/drive.js'
import { InvalidInputError } from './db.js'
import { inKorea } from './geo.js'
import { katecToWgs84, wgs84ToKatec } from './katec.js'
import { fetchUpstreamJson, first, MissingUpstreamKeyError, optionalInt, readKey } from './upstream.js'

/**
 * 근처 가장 싼 주유소 — 오피넷(한국석유공사) 오픈 API.
 *
 * 다른 기능과 달리 반경 검색이 원본에 있다. 대신 좌표계가 KATEC이라 오갈 때마다 변환해야 한다.
 *   보낼 때: 브라우저 위치(WGS84) → KATEC
 *   받을 때: 주유소 좌표(KATEC) → WGS84 (지도에 찍어야 하므로)
 *
 * aroundAll 응답에는 가격과 좌표만 있고 주소·셀프 여부는 없다. 상위 몇 곳만 detailById 로
 * 한 번 더 물어 채운다 — 전부 물으면 호출 수가 목록 길이만큼 늘어난다.
 */

const AROUND_URL = 'https://www.opinet.co.kr/api/aroundAll.do'
const DETAIL_URL = 'https://www.opinet.co.kr/api/detailById.do'
const SOURCE = '오피넷'
/** 상세를 채울 상위 개수. 가격순 상단만 실제로 눌러 보게 된다. */
const DETAIL_COUNT = 5

/** 오피넷이 허용하는 반경 상한이 5km다. */
export const RADIUS_LIMITS = { min: 500, max: 5_000, fallback: 3_000 }
export const RESULT_LIMITS = { min: 1, max: 50, fallback: 20 }

export const PRODUCTS: Record<string, string> = {
  B027: '휘발유',
  D047: '경유',
  B034: '고급휘발유',
  C004: '실내등유',
  K015: 'LPG',
}

const BRANDS: Record<string, string> = {
  SKE: 'SK에너지',
  GSC: 'GS칼텍스',
  HDO: '현대오일뱅크',
  SOL: 'S-OIL',
  RTE: '자영알뜰',
  RTX: '고속도로알뜰',
  NHO: '농협알뜰',
  ETC: '자가상표',
  SKG: 'SK가스',
  E1G: 'E1',
}

const opinetKey = () => {
  const key = readKey('OPINET_API_KEY')
  if (!key) {
    throw new MissingUpstreamKeyError(
      'OPINET_API_KEY',
      'www.opinet.co.kr 오픈 API 안내에서 인증키를 신청해 넣어 주세요.',
    )
  }
  return key
}

export type GasParams = {
  lat: number
  lng: number
  radiusMeters: number
  limit: number
  productCode: string
}

export function parseGasQuery(query: Record<string, string | string[] | undefined>): GasParams {
  const lat = Number(first(query.lat))
  const lng = Number(first(query.lng))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inKorea(lat, lng)) {
    throw new InvalidInputError('국내 좌표(lat, lng)가 필요합니다.')
  }
  const productCode = first(query.product) ?? 'B027'
  if (!(productCode in PRODUCTS)) {
    throw new InvalidInputError(`'product'는 ${Object.keys(PRODUCTS).join(', ')} 중 하나여야 합니다.`)
  }
  return {
    lat,
    lng,
    radiusMeters: optionalInt(query.radius, RADIUS_LIMITS),
    limit: optionalInt(query.limit, RESULT_LIMITS),
    productCode,
  }
}

type OilRow = Record<string, unknown>
type OpinetPayload = { RESULT?: { OIL?: OilRow | OilRow[] } }

/** 응답이 한 건일 때는 배열이 아니라 객체로 온다. */
const oilRows = (payload: OpinetPayload): OilRow[] => {
  const oil = payload.RESULT?.OIL
  if (Array.isArray(oil)) return oil
  return oil && typeof oil === 'object' ? [oil] : []
}

const str = (raw: unknown) => (raw === null || raw === undefined ? '' : String(raw).trim())
const num = (raw: unknown) => {
  const value = Number(str(raw).replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}
const isY = (raw: unknown) => str(raw).toUpperCase() === 'Y'

const ask = (url: string, params: Record<string, string>) =>
  fetchUpstreamJson<OpinetPayload>(`${url}?${new URLSearchParams(params)}`, { source: SOURCE })

/** 상세 조회는 한 곳이 실패해도 목록 전체를 버릴 이유가 없다. */
async function fetchDetail(id: string, key: string): Promise<OilRow | null> {
  try {
    const payload = await ask(DETAIL_URL, { out: 'json', id, certkey: key })
    return oilRows(payload)[0] ?? null
  } catch {
    return null
  }
}

export async function findCheapGas({
  lat,
  lng,
  radiusMeters,
  limit,
  productCode,
}: GasParams): Promise<GasResult> {
  const key = opinetKey()
  const katec = wgs84ToKatec(lat, lng)

  const payload = await ask(AROUND_URL, {
    out: 'json',
    // 오피넷은 소수 넷째 자리까지만 받는다
    x: katec.x.toFixed(4),
    y: katec.y.toFixed(4),
    radius: String(radiusMeters),
    prodcd: productCode,
    sort: '1', // 가격순
    certkey: key,
  })

  const base = oilRows(payload)
    .map((row): GasStation => {
      const katecX = num(row.GIS_X_COOR)
      const katecY = num(row.GIS_Y_COOR)
      // 좌표가 없으면 지도에 못 찍지만 가격 비교에는 쓸 수 있으므로 버리지 않는다
      const coords = katecX !== null && katecY !== null ? katecToWgs84(katecX, katecY) : null
      const brandCode = str(row.POLL_DIV_CO ?? row.POLL_DIV_CD)

      return {
        id: str(row.UNI_ID),
        name: str(row.OS_NM),
        brandCode,
        brandName: BRANDS[brandCode] || brandCode,
        price: num(row.PRICE),
        distanceMeters: num(row.DISTANCE) ?? 0,
        lat: coords && inKorea(coords.lat, coords.lng) ? coords.lat : null,
        lng: coords && inKorea(coords.lat, coords.lng) ? coords.lng : null,
        address: '',
        phone: '',
        isSelf: false,
        hasCarWash: false,
        hasMaintenance: false,
        hasStore: false,
        certified: false,
        prices: {},
      }
    })
    .filter((item) => item.id && item.price !== null)

  // 값이 같으면 가까운 곳이 낫다 — 오피넷의 가격순 정렬만으로는 동가 구간이 뒤섞인다
  const ranked = base.sort(
    (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.distanceMeters - b.distanceMeters,
  )
  const items = ranked.slice(0, limit)

  const details = await Promise.all(
    items.slice(0, DETAIL_COUNT).map(async (item) => [item.id, await fetchDetail(item.id, key)] as const),
  )
  const detailById = new Map(details)

  for (const item of items) {
    const detail = detailById.get(item.id)
    if (!detail) continue

    item.address = str(detail.NEW_ADR) || str(detail.VAN_ADR)
    item.phone = str(detail.TEL)
    item.isSelf = isY(detail.SELF_YN)
    item.hasCarWash = isY(detail.CAR_WASH_YN)
    item.hasMaintenance = isY(detail.MAINT_YN)
    item.hasStore = isY(detail.CVS_YN)
    item.certified = isY(detail.KPETRO_YN)

    // 상세에는 유종별 가격이 함께 온다 — 경유로 바꿔 볼 때 재조회 없이 쓸 수 있다
    const priceRows = detail.OIL_PRICE
    for (const row of Array.isArray(priceRows) ? priceRows : priceRows ? [priceRows] : []) {
      const entry = row as OilRow
      const code = str(entry.PRODCD)
      if (code) item.prices[code] = num(entry.PRICE)
    }
  }

  return {
    productCode,
    productName: PRODUCTS[productCode],
    items,
    total: ranked.length,
    /** 상세를 채운 개수. 뒤쪽 항목의 주소가 비어 있는 이유를 화면이 설명할 수 있다. */
    detailed: Math.min(items.length, DETAIL_COUNT),
  }
}
