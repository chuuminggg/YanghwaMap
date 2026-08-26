import type { ParkingLot, ParkingResult } from '../../src/types/drive.js'
import { fetchDataGoKr, itemsOf, text, toNumber, yesNo } from './datagokr.js'
import { InvalidInputError } from './db.js'
import { haversineMeters, inKorea } from './geo.js'
import { resolveRegion } from './region.js'
import { first, optionalInt } from './upstream.js'

/**
 * 근처 공영주차장 — 공공데이터포털 '전국주차장정보표준데이터'.
 *
 * 이 표준데이터에는 반경 검색이 없다. 시군구로 한 번에 최대 1000건을 받아 와
 * 거리 계산과 정렬은 여기서 한다. 그래서 좌표만으로는 부족하고 먼저 행정구역을 알아내야 한다.
 *
 * 실시간 잔여 면수·만차 여부는 표준데이터에 아예 없다. 있는 척하지 않는다 —
 * 요금과 운영시간도 지자체가 올린 값이라 현장과 다를 수 있다.
 */

const API_URL = 'https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api'
const SOURCE = '공공데이터포털'
/** 한 시군구의 주차장이 1000건을 넘는 경우는 없다. 표준데이터의 페이지 상한이기도 하다. */
const PAGE_SIZE = '1000'

export const RADIUS_LIMITS = { min: 300, max: 5_000, fallback: 1_500 }
export const RESULT_LIMITS = { min: 1, max: 50, fallback: 30 }

export type ParkingParams = {
  lat: number
  lng: number
  radiusMeters: number
  limit: number
  /** false 면 민영까지 포함한다. 기본은 공영만. */
  publicOnly: boolean
}

export function parseParkingQuery(query: Record<string, string | string[] | undefined>): ParkingParams {
  const lat = Number(first(query.lat))
  const lng = Number(first(query.lng))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inKorea(lat, lng)) {
    throw new InvalidInputError('국내 좌표(lat, lng)가 필요합니다.')
  }
  return {
    lat,
    lng,
    radiusMeters: optionalInt(query.radius, RADIUS_LIMITS),
    limit: optionalInt(query.limit, RESULT_LIMITS),
    publicOnly: first(query.publicOnly) !== '0',
  }
}

/** 표준데이터는 영문 컬럼명으로 오지만, 지자체에 따라 한글 컬럼이 섞여 오는 행이 있다. */
type Row = Record<string, unknown>
const pick = (row: Row, ...keys: string[]) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key]
  }
  return undefined
}

const hours = (row: Row, open: [string, string], close: [string, string]) => ({
  open: text(pick(row, ...open)),
  close: text(pick(row, ...close)),
})

function toParkingLot(row: Row, origin: { lat: number; lng: number }): ParkingLot | null {
  const lat = toNumber(pick(row, 'latitude', '위도'))
  const lng = toNumber(pick(row, 'longitude', '경도'))
  // 좌표가 비었거나 국내가 아닌 행이 섞여 있다. 지도에 못 찍고 거리도 못 재므로 버린다.
  if (lat === null || lng === null || !inKorea(lat, lng)) return null

  const roadAddress = text(pick(row, 'rdnmadr', '소재지도로명주소'))
  const lotAddress = text(pick(row, 'lnmadr', '소재지지번주소'))
  const name = text(pick(row, 'prkplceNm', '주차장명'))

  return {
    // 관리번호가 비어 있는 행이 있어 좌표를 섞어 유일하게 만든다
    id: `${text(pick(row, 'prkplceNo', '주차장관리번호'))}:${lat},${lng}`,
    name,
    category: text(pick(row, 'prkplceSe', '주차장구분')),
    type: text(pick(row, 'prkplceType', '주차장유형')),
    address: roadAddress || lotAddress,
    lat,
    lng,
    distanceMeters: Math.round(haversineMeters(origin, { lat, lng })),
    capacity: toNumber(pick(row, 'prkcmprt', '주차구획수')),
    feeInfo: text(pick(row, 'parkingchrgeInfo', '요금정보')),
    basicTime: toNumber(pick(row, 'basicTime', '주차기본시간')),
    basicCharge: toNumber(pick(row, 'basicCharge', '주차기본요금')),
    addUnitTime: toNumber(pick(row, 'addUnitTime', '추가단위시간')),
    addUnitCharge: toNumber(pick(row, 'addUnitCharge', '추가단위요금')),
    dailyCharge: toNumber(pick(row, 'dayCmmtkt', '1일주차권요금')),
    monthlyCharge: toNumber(pick(row, 'monthCmmtkt', '월정기권요금')),
    operatingDays: text(pick(row, 'operDay', '운영요일')),
    weekday: hours(row, ['weekdayOperOpenHhmm', '평일운영시작시각'], ['weekdayOperColseHhmm', '평일운영종료시각']),
    saturday: hours(row, ['satOperOperOpenHhmm', '토요일운영시작시각'], ['satOperCloseHhmm', '토요일운영종료시각']),
    holiday: hours(row, ['holidayOperOpenHhmm', '공휴일운영시작시각'], ['holidayCloseOpenHhmm', '공휴일운영종료시각']),
    paymentMethods: text(pick(row, 'metpay', '결제방법')),
    phone: text(pick(row, 'phoneNumber', '전화번호')),
    agency: text(pick(row, 'institutionNm', '관리기관명')),
    accessible: yesNo(pick(row, 'pwdbsPpkZoneYn', '장애인전용주차구역보유여부')),
    referenceDate: text(pick(row, 'referenceDate', '데이터기준일자')),
  }
}

async function fetchPage(addressField: string, addressHint: string, publicOnly: boolean) {
  const params: Record<string, string> = {
    pageNo: '1',
    numOfRows: PAGE_SIZE,
    type: 'json',
    [addressField]: addressHint,
  }
  if (publicOnly) params.prkplceSe = '공영'

  const payload = await fetchDataGoKr<{ response?: { body?: unknown } }>(API_URL, params, SOURCE)
  return itemsOf<Row>(payload.response?.body)
}

export async function findNearbyParking({
  lat,
  lng,
  radiusMeters,
  limit,
  publicOnly,
}: ParkingParams): Promise<ParkingResult> {
  const region = await resolveRegion(lat, lng)

  // 도로명주소로 거른다. 지자체에 따라 도로명이 비어 있고 지번만 채운 행이 있어,
  // 아무것도 안 걸리면 지번으로 한 번 더 물어본다.
  let rows = await fetchPage('rdnmadr', region.addressHint, publicOnly)
  if (rows.length === 0) rows = await fetchPage('lnmadr', region.addressHint, publicOnly)

  const items = rows
    .map((row) => toParkingLot(row, { lat, lng }))
    .filter((item): item is ParkingLot => item !== null)
    .filter((item) => item.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.name.localeCompare(b.name, 'ko'))

  // 같은 주차장이 여러 기관에서 중복 등록되는 경우가 있다
  const seen = new Set<string>()
  const deduped = items.filter((item) => {
    const key = `${item.name}:${item.lat},${item.lng}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    region: region.addressHint,
    items: deduped.slice(0, limit),
    total: deduped.length,
  }
}
