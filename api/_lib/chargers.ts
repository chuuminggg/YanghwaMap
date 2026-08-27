import type { EvCharger, EvStation, EvStationResult } from '../../src/types/drive.js'
import { fetchDataGoKr, itemsOf, text, toNumber, yesNo } from './datagokr.js'
import { InvalidInputError } from './db.js'
import { haversineMeters, inKorea } from './geo.js'
import { resolveRegion } from './region.js'
import { first, optionalInt } from './upstream.js'

/**
 * 전기차 충전소 위치와 충전기 상태 — 환경부 전기차 충전소 API(데이터셋 15076352).
 *
 * 주차장과 마찬가지로 반경 검색이 없어 시군구 코드(zscode)로 받아 와 여기서 거리를 잰다.
 * 응답은 충전기 한 대가 한 행이라 그대로 보여 주면 같은 충전소가 열 번 뜬다 — statId 로 묶는다.
 *
 * 이 데이터셋은 포털 인증키가 있어도 활용신청을 따로 해야 한다(자동승인이지만 반영에 시간이 걸린다).
 */

const INFO_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo'
const STATUS_URL = 'https://apis.data.go.kr/B552584/EvCharger/getChargerStatus'
const SOURCE = '환경부 전기차 충전소'
/** 데이터셋이 허용하는 최대치. 시군구 하나가 이보다 많은 경우는 사실상 없다. */
const PAGE_SIZE = '9999'

export const RADIUS_LIMITS = { min: 300, max: 5_000, fallback: 2_000 }
export const RESULT_LIMITS = { min: 1, max: 50, fallback: 30 }

/** 충전기 커넥터 종류. 원본은 코드만 준다. */
const CHARGER_TYPES: Record<string, string> = {
  '01': 'DC차데모',
  '02': 'AC완속',
  '03': 'DC차데모+AC3상',
  '04': 'DC콤보',
  '05': 'DC차데모+DC콤보',
  '06': 'DC차데모+AC3상+DC콤보',
  '07': 'AC3상',
  '08': 'DC콤보(완속)',
}

/** 충전기 상태 코드. 2(충전대기)만이 지금 바로 꽂을 수 있다는 뜻이다. */
const STATUS_LABELS: Record<string, string> = {
  '1': '통신이상',
  '2': '충전대기',
  '3': '충전중',
  '4': '운영중지',
  '5': '점검중',
  '9': '상태미확인',
}

export const AVAILABLE_STATUS = '2'

export type ChargerParams = {
  lat: number
  lng: number
  radiusMeters: number
  limit: number
  /** true 면 지금 충전 가능한 충전기가 있는 충전소만 남긴다 */
  availableOnly: boolean
}

export function parseChargerQuery(query: Record<string, string | string[] | undefined>): ChargerParams {
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
    availableOnly: first(query.availableOnly) === '1',
  }
}

type Row = Record<string, unknown>

/** 상태 조회는 실패해도 위치 목록까지 버릴 이유가 없다 — 그때는 정보 응답의 stat 을 그대로 쓴다. */
async function fetchStatuses(zcode: string, zscode: string): Promise<Map<string, Row>> {
  try {
    const payload = await fetchDataGoKr<{ items?: unknown; response?: { body?: unknown } }>(
      STATUS_URL,
      { pageNo: '1', numOfRows: PAGE_SIZE, dataType: 'JSON', zcode, zscode, period: '10' },
      SOURCE,
    )
    const rows = itemsOf<Row>(payload.response?.body ?? payload)
    return new Map(rows.map((row) => [`${text(row.statId)}:${text(row.chgerId)}`, row]))
  } catch {
    return new Map()
  }
}

function toCharger(row: Row, live: Row | undefined): EvCharger {
  // 상태 조회가 최근 변경분만 주므로, 있으면 그쪽이 최신이고 없으면 정보 응답의 값을 쓴다
  const status = text(live?.stat ?? row.stat)
  return {
    chargerId: text(row.chgerId),
    type: text(row.chgerType),
    typeLabel: CHARGER_TYPES[text(row.chgerType)] ?? text(row.chgerType),
    /** kW */
    output: toNumber(row.output),
    status,
    statusLabel: STATUS_LABELS[status] ?? '',
    updatedAt: text(live?.statUpdDt ?? row.statUpdDt),
  }
}

export async function findNearbyChargers({
  lat,
  lng,
  radiusMeters,
  limit,
  availableOnly,
}: ChargerParams): Promise<EvStationResult> {
  const region = await resolveRegion(lat, lng)

  const [info, statuses] = await Promise.all([
    fetchDataGoKr<{ items?: unknown; response?: { body?: unknown } }>(
      INFO_URL,
      {
        pageNo: '1',
        numOfRows: PAGE_SIZE,
        dataType: 'JSON',
        zcode: region.zcode,
        zscode: region.zscode,
      },
      SOURCE,
    ),
    fetchStatuses(region.zcode, region.zscode),
  ])

  // 응답 봉투가 서비스마다 달라(items 가 최상위인 경우도 있다) 양쪽을 다 본다
  const rows = itemsOf<Row>(info.response?.body ?? info)

  // 충전기 한 대가 한 행이다. 충전소로 묶어야 목록이 읽힌다.
  const stations = new Map<string, EvStation>()

  for (const row of rows) {
    const statId = text(row.statId)
    const rowLat = toNumber(row.lat)
    const rowLng = toNumber(row.lng)
    if (!statId || rowLat === null || rowLng === null || !inKorea(rowLat, rowLng)) continue

    let station = stations.get(statId)
    if (!station) {
      station = {
        id: statId,
        name: text(row.statNm),
        address: text(row.addr),
        location: text(row.location),
        lat: rowLat,
        lng: rowLng,
        distanceMeters: Math.round(haversineMeters({ lat, lng }, { lat: rowLat, lng: rowLng })),
        operator: text(row.busiNm),
        phone: text(row.busiCall),
        useTime: text(row.useTime),
        parkingFree: yesNo(row.parkingFree),
        limited: yesNo(row.limitYn),
        limitDetail: text(row.limitDetail),
        note: text(row.note),
        chargers: [],
        availableCount: 0,
      }
      stations.set(statId, station)
    }

    station.chargers.push(toCharger(row, statuses.get(`${statId}:${text(row.chgerId)}`)))
  }

  const items = [...stations.values()]
    .map((station) => ({
      ...station,
      availableCount: station.chargers.filter((c) => c.status === AVAILABLE_STATUS).length,
      // 같은 충전소 안에서는 급속(용량 큰 것)을 먼저 보여 준다
      chargers: station.chargers.sort((a, b) => (b.output ?? 0) - (a.output ?? 0)),
    }))
    .filter((station) => station.distanceMeters <= radiusMeters)
    .filter((station) => !availableOnly || station.availableCount > 0)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)

  return {
    region: region.addressHint,
    items: items.slice(0, limit),
    total: items.length,
    /** 상태 조회가 통째로 실패하면 '충전 가능' 숫자를 믿을 수 없다 */
    liveStatus: statuses.size > 0,
  }
}
