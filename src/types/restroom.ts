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
  roadAddress: string
  jibunAddress: string
  lat: number
  lng: number
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
}

/** 서버가 haversine으로 계산해 붙여 주는 거리 (미터) */
export type NearbyRestroom = Restroom & { distanceMeters: number }

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
