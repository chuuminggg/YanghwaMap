import type { Restaurant } from '../types/restaurant'
import type { VisitFilter } from './useFilterStore'

export type AreaBucket = { value: string; count: number }

/** 이름 대신 건수 기준으로 정렬해 자주 가는 구가 앞에 오게 한다. */
const byCountThenName = (a: AreaBucket, b: AreaBucket) =>
  b.count - a.count || a.value.localeCompare(b.value, 'ko')

const bucket = (values: string[]): AreaBucket[] => {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort(byCountThenName)
}

export const collectDistricts = (list: Restaurant[]): AreaBucket[] =>
  bucket(list.map((r) => r.district))

export const collectDongs = (list: Restaurant[], district: string | null): AreaBucket[] =>
  district ? bucket(list.filter((r) => r.district === district).map((r) => r.dong)) : []

/**
 * '콩나물해장, 소머리국밥'처럼 한 칸에 여러 메뉴가 들어 있어 쉼표/슬래시로 나눈다.
 * '기사식당 다수', '만두국 외'처럼 수량을 덧붙인 표기는 꼬리말을 떼어 같은 칩으로 묶는다.
 */
export const splitMenus = (menu: string): string[] =>
  menu
    .split(/[,/·]/)
    .map((part) => part.trim().replace(/\s*(다수|외|등)$/, '').trim())
    .filter(Boolean)

export const collectMenus = (list: Restaurant[]): AreaBucket[] =>
  bucket(list.flatMap((r) => splitMenus(r.menu)))

export type FilterCriteria = {
  district: string | null
  dong: string | null
  menu: string | null
  query: string
  visit: VisitFilter
}

export function filterRestaurants(list: Restaurant[], f: FilterCriteria): Restaurant[] {
  const q = f.query.trim().toLowerCase()
  return list.filter((r) => {
    if (f.district && r.district !== f.district) return false
    if (f.dong && r.dong !== f.dong) return false
    if (f.menu && !splitMenus(r.menu).includes(f.menu)) return false
    if (f.visit === 'visited' && !r.visited) return false
    if (f.visit === 'wish' && r.visited) return false
    if (!q) return true
    return [r.name, r.menu, r.district, r.dong, r.memo, r.reference, r.address]
      .join(' ')
      .toLowerCase()
      .includes(q)
  })
}
