/**
 * 공중화장실 한 곳. 공공데이터포털 '전국공중화장실표준데이터'를 앱 모델로 옮긴 형태.
 * 맛집과 달리 앱에서 수정하지 않는 읽기 전용 데이터다.
 */
export type Restroom = {
  id: string
  /** 원본 관리번호 (비어 있는 행도 있다) */
  code: string
  name: string
  /** 공중화장실 / 개방화장실 / 간이화장실 / 이동화장실 */
  type: string
  /** 자치구. 원본 주소·관리기관명·개방자치단체코드에서 뽑는다 */
  district: string
  roadAddress: string
  jibunAddress: string
  /** 원본에 좌표가 없어 지오코딩으로 채운다. 아직 못 채운 항목은 비어 있다. */
  lat?: number
  lng?: number
  manager: string
  phone: string
  /** '정시', '상시' 같은 구분값 — 실제 시간은 openTimeDetail 쪽이 정확하다 */
  openTime: string
  /** '00~24', '10:30-20:30', '평일9시간(09:00~18:00)' 등 자유 형식 */
  openTimeDetail: string
  /** 남성용 대변기 + 소변기 */
  menToilets: number
  womenToilets: number
  /** 장애인용 변기가 하나라도 있으면 true */
  accessible: boolean
  diaperTable?: boolean
  emergencyBell?: boolean
  cctv?: boolean
  dataDate: string
  /** 주소로 좌표를 찾아봤지만 실패한 항목. 자동 배치는 이 행을 건너뛴다. */
  geocodeFailed?: boolean
}

/** 서버가 haversine으로 계산해 붙여 주는 거리 (미터) */
export type NearbyRestroom = Restroom & { distanceMeters: number }

/** 아직 좌표를 시도해 보지 않은 항목 — '좌표 불러오기'가 처리할 대상 */
export const needsGeocoding = (r: Restroom) => !hasCoords(r) && !r.geocodeFailed

/** 거리순 목록에서 왔는지 — 지역구 목록에는 distanceMeters 가 없다 */
export const isNearbyRestroom = (r: Restroom | NearbyRestroom): r is NearbyRestroom =>
  typeof (r as NearbyRestroom).distanceMeters === 'number'

/** 자치구 칩에 쓰는 집계 — total 중 located 만 지도에 찍힌다 */
export type DistrictCount = { district: string; total: number; located: number }

/** 좌표가 채워진 항목만 지도에 그릴 수 있다. types/restaurant.ts 의 같은 이름 가드와 짝을 이룬다. */
export const hasCoords = (r: Restroom): r is Restroom & { lat: number; lng: number } =>
  typeof r.lat === 'number' && typeof r.lng === 'number'

/** 도로명이 비어 있는 행이 있어 지번으로 떨어진다 */
export const restroomAddress = (r: Pick<Restroom, 'roadAddress' | 'jibunAddress'>) =>
  r.roadAddress || r.jibunAddress

/** 카드에 보여 줄 개방시간. 둘 다 비면 빈 문자열. */
export const openingHours = (r: Pick<Restroom, 'openTime' | 'openTimeDetail'>) =>
  r.openTimeDetail || r.openTime

/** 남/녀 변기 수 요약 — 0이면 표기를 생략하려고 빈 문자열을 준다 */
export const toiletSummary = (r: Pick<Restroom, 'menToilets' | 'womenToilets'>) => {
  const parts: string[] = []
  if (r.menToilets > 0) parts.push(`남 ${r.menToilets}`)
  if (r.womenToilets > 0) parts.push(`여 ${r.womenToilets}`)
  return parts.join(' · ')
}
