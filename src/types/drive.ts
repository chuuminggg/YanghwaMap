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
