/**
 * '운전' 탭이 다루는 읽기 전용 데이터.
 *
 * 맛집·화장실은 우리 DB에 있지만 여기 있는 것들은 전부 외부 기관이 실시간으로 주는 값이라
 * 저장하지 않는다. 서버(`/api/drive/*`)가 원본을 부르고 이 모양으로 정리해 내려 준다.
 */

/** 소통 정보에 실제로 등장한 노선 — 칩 목록을 원본에서 그대로 만든다 */
export type HighwayRoute = { routeNo: string; routeName: string; count: number }

/** 콘존(고속도로를 나눈 구간) 하나의 현재 소통 상태 */
export type HighwayConzone = {
  id: string
  routeNo: string
  routeName: string
  /** '구서IC-영락IC' */
  conzoneName: string
  direction: '상행' | '하행' | ''
  /** 구간 평균 속도(km/h). 검지기가 자료를 못 주면 null */
  speed: number | null
  /** 5분간 통과 대수 합 */
  trafficAmount: number | null
  /** 1 원활 · 2 서행 · 3 정체 */
  grade: number | null
  gradeLabel: '원활' | '서행' | '정체' | ''
  /** 'HH:MM' */
  updatedAt: string
}

export type HighwayTraffic = {
  routes: HighwayRoute[]
  items: HighwayConzone[]
  /** 필터에 걸린 전체 구간 수 (items 는 limit 만큼만 온다) */
  total: number
  updatedAt: string
}

export type HighwayCctv = {
  id: string
  name: string
  lat: number
  lng: number
  /**
   * 서명된 HLS 주소. 만료되고 http 라서 https 페이지에 그대로 embed 할 수 없다 —
   * 화면에서는 재생 대신 복사해서 외부 플레이어로 열도록 안내한다.
   */
  streamUrl: string
  format: string
  distanceMeters: number
}

export type HighwayCctvResult = {
  items: HighwayCctv[]
  /**
   * ITS 공개 데모 키로 받은 결과. 데모 키는 좌표 범위를 무시하고 늘 같은 표본 20건을 주므로
   * '내 주변'이 아니다. 개인 키(ITS_API_KEY)를 넣으면 false 가 되고 반경이 실제로 적용된다.
   */
  sample: boolean
}

/** 소통등급별 색. 원활/서행/정체를 한눈에 구분한다. */
export const gradeTone = (grade: number | null) =>
  grade === 3
    ? 'bg-red-50 text-red-700'
    : grade === 2
      ? 'bg-amber-50 text-amber-700'
      : grade === 1
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-stone-100 text-stone-500'

/** 운영시간 한 쌍. 원본이 'HHMM' 문자열이고 비어 있는 경우가 흔하다. */
export type OpenHours = { open: string; close: string }

/**
 * 공영주차장 한 곳. 공공데이터포털 '전국주차장정보표준데이터'.
 * 실시간 잔여 면수·만차·예약 여부는 원본에 없다 — 추측해서 채우지 않는다.
 */
export type ParkingLot = {
  id: string
  name: string
  /** 공영 / 민영 */
  category: string
  /** 노상 / 노외 / 부설 */
  type: string
  address: string
  lat: number
  lng: number
  distanceMeters: number
  /** 주차구획수 */
  capacity: number | null
  /** 자유 형식 요금 안내 */
  feeInfo: string
  basicTime: number | null
  basicCharge: number | null
  addUnitTime: number | null
  addUnitCharge: number | null
  dailyCharge: number | null
  monthlyCharge: number | null
  operatingDays: string
  weekday: OpenHours
  saturday: OpenHours
  holiday: OpenHours
  paymentMethods: string
  phone: string
  agency: string
  /** 장애인 전용 구역 보유. 원본이 비어 있으면 null(모름) */
  accessible: boolean | null
  referenceDate: string
}

export type ParkingResult = {
  /** 좌표로 알아낸 조회 구역 ('서울특별시 마포구') */
  region: string
  items: ParkingLot[]
  total: number
}

/** '30분 1,200원' 형태의 한 줄 요금. 기본시간·기본요금이 다 있어야 말이 된다. */
export const basicFee = (lot: Pick<ParkingLot, 'basicTime' | 'basicCharge'>) =>
  lot.basicTime !== null && lot.basicCharge !== null
    ? `${lot.basicTime}분 ${lot.basicCharge.toLocaleString('ko-KR')}원`
    : ''

/** 'HHMM' → 'HH:MM'. 원본에 '0900' 과 '09:00' 이 섞여 있다. */
export const clockLabel = (raw: string) => {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 4 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : raw
}

/** 평일 운영시간 한 줄. 둘 중 하나라도 비면 표기를 생략한다. */
export const weekdayHours = (lot: Pick<ParkingLot, 'weekday'>) =>
  lot.weekday.open && lot.weekday.close
    ? `${clockLabel(lot.weekday.open)}~${clockLabel(lot.weekday.close)}`
    : ''
