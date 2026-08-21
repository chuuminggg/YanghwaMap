import { create } from 'zustand'
import * as api from '../lib/api'
import type { Restaurant, RestaurantDraft } from '../types/restaurant'

type Status = 'idle' | 'loading' | 'ready' | 'error'

type RestaurantState = {
  restaurants: Restaurant[]
  status: Status
  /** load() 실패 사유. 개별 CRUD 실패는 호출한 화면이 직접 처리한다. */
  error: string | null
  load: (force?: boolean) => Promise<void>
  add: (draft: RestaurantDraft) => Promise<string>
  update: (id: string, patch: Partial<RestaurantDraft>) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleVisited: (id: string) => Promise<void>
}

const toMessage = (error: unknown) =>
  error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'

/** 여러 화면이 동시에 마운트되며 load()를 불러도 요청은 한 번만 나가게 한다. */
let inflight: Promise<void> | null = null

/**
 * 데이터의 원본은 PostgreSQL이다. 이 스토어는 서버 응답을 담아 두는 캐시일 뿐이라
 * 브라우저에 영속화하지 않는다 (persist 미들웨어 없음).
 */
export const useRestaurantStore = create<RestaurantState>()((set, get) => ({
  restaurants: [],
  status: 'idle',
  error: null,

  load: async (force = false) => {
    if (inflight) return inflight
    if (!force && get().status === 'ready') return

    set({ status: 'loading', error: null })
    inflight = (async () => {
      try {
        set({ restaurants: await api.listRestaurants(), status: 'ready', error: null })
      } catch (error) {
        set({ status: 'error', error: toMessage(error) })
      } finally {
        inflight = null
      }
    })()
    return inflight
  },

  add: async (draft) => {
    const created = await api.createRestaurant(draft)
    set((state) => ({ restaurants: [created, ...state.restaurants] }))
    return created.id
  },

  update: async (id, patch) => {
    const updated = await api.updateRestaurant(id, patch)
    set((state) => ({
      restaurants: state.restaurants.map((r) => (r.id === id ? updated : r)),
    }))
  },

  remove: async (id) => {
    await api.deleteRestaurant(id)
    set((state) => ({ restaurants: state.restaurants.filter((r) => r.id !== id) }))
  },

  // 토글은 즉각 반응해야 하므로 먼저 화면에 반영하고, 실패하면 해당 항목만 되돌린다
  toggleVisited: async (id) => {
    const before = get().restaurants.find((r) => r.id === id)
    if (!before) return

    const visited = !before.visited
    set((state) => ({
      restaurants: state.restaurants.map((r) => (r.id === id ? { ...r, visited } : r)),
    }))

    try {
      const updated = await api.updateRestaurant(id, { visited })
      set((state) => ({
        restaurants: state.restaurants.map((r) => (r.id === id ? updated : r)),
      }))
    } catch (error) {
      set((state) => ({
        restaurants: state.restaurants.map((r) => (r.id === id ? before : r)),
      }))
      throw error
    }
  },
}))
