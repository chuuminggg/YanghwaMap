/**
 * '추천' 탭이 다루는 읽기 전용 데이터.
 *
 * 내 목록(맛집)과 달리 여기 있는 곳들은 내가 가 본 곳이 아니다. 카카오 로컬 검색 후보를
 * 다음 블로그 글로 재평가한 외부 추천(PlayMCP 맛집검색)이라 저장하지 않고 그때그때 받는다.
 */

/** 추천 근거로 쓰인 블로그 글 한 편 */
export type RecommendSource = {
  title: string
  url: string
  /** ISO. 최근 글인지 보여 주려고 그대로 내려준다 */
  publishedAt: string
}

export type RecommendPlace = {
  /** 카카오 장소 ID. 지도 마커와 목록이 같은 키를 쓴다 */
  id: string
  name: string
  /** '음식점 > 한식 > 육류,고기' */
  category: string
  address: string
  mapUrl: string
  lat?: number
  lng?: number
  /** 좌표를 찾은 경우에만. 현재 위치 기준 직선거리 */
  distanceMeters?: number
  /** 이 곳이 나온 검색어의 지역 ('합정역') */
  region: string
  /**
   * 맛집검색이 매긴 최종 점수. 절대적인 의미는 없고 같은 목록 안에서 비교용이다.
   * 최근 언급이 많을수록 높고 광고 의심 글이 많을수록 낮다.
   */
  score: number
  /** 블로그 언급 총건수 (검색 결과 수) */
  mentionCount: number
  /** 광고·협찬으로 걸러 낸 글 수 */
  promoCount: number
  /** 최근 6개월 안에 쓰인 유효 글 수 */
  recentCount: number
  sources: RecommendSource[]
}

export type RecommendResult = {
  /** 실제로 검색에 성공한 지역 이름 ('합정역', '망원역') */
  regions: string[]
  /** 후보를 만들지 못한 지역. 화면이 '왜 적게 나왔는지' 설명하는 데 쓴다 */
  skipped: string[]
  /** 사용자가 넣은 메뉴 키워드 ('파스타'). 없으면 빈 문자열 */
  keyword: string
  places: RecommendPlace[]
}
