import type { Restaurant } from '../types/restaurant'
import seedRows from './seed-restaurants.json'

/** scripts/xlsx-to-seed.mjs 가 만들어내는 행의 형태 */
type SeedRow = Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt' | 'lat' | 'lng' | 'kakaoPlaceUrl' | 'rating'>

/**
 * 첫 실행 시 localStorage를 채우는 초기 데이터 (엑셀 47건).
 * id는 재생성해도 같도록 고정값을 쓴다 — 초기화/복원 시 중복이 생기지 않는다.
 */
export function createSeedRestaurants(): Restaurant[] {
  const now = new Date().toISOString()
  return (seedRows as SeedRow[]).map((row, index) => ({
    ...row,
    id: `seed-${String(index + 1).padStart(2, '0')}`,
    createdAt: now,
    updatedAt: now,
  }))
}

export const SEED_COUNT = (seedRows as SeedRow[]).length
