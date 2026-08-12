import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Restaurant, RestaurantDraft } from '../types/restaurant'
import { createSeedRestaurants } from '../data/seed'

type RestaurantState = {
  restaurants: Restaurant[]
  add: (draft: RestaurantDraft) => string
  update: (id: string, patch: Partial<RestaurantDraft>) => void
  remove: (id: string) => void
  toggleVisited: (id: string) => void
  /** 시드 데이터로 되돌린다 (사용자가 직접 입력한 내용은 사라짐) */
  resetToSeed: () => void
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const useRestaurantStore = create<RestaurantState>()(
  persist(
    (set) => ({
      // 저장된 값이 없으면 이 초기값이 그대로 첫 화면 데이터가 된다
      restaurants: createSeedRestaurants(),

      add: (draft) => {
        const now = new Date().toISOString()
        const id = newId()
        set((state) => ({
          restaurants: [{ ...draft, id, createdAt: now, updatedAt: now }, ...state.restaurants],
        }))
        return id
      },

      update: (id, patch) =>
        set((state) => ({
          restaurants: state.restaurants.map((r) =>
            r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
          ),
        })),

      remove: (id) =>
        set((state) => ({ restaurants: state.restaurants.filter((r) => r.id !== id) })),

      toggleVisited: (id) =>
        set((state) => ({
          restaurants: state.restaurants.map((r) =>
            r.id === id ? { ...r, visited: !r.visited, updatedAt: new Date().toISOString() } : r,
          ),
        })),

      resetToSeed: () => set({ restaurants: createSeedRestaurants() }),
    }),
    {
      name: 'yanghwa-map/restaurants',
      version: 1,
      partialize: (state) => ({ restaurants: state.restaurants }),
    },
  ),
)
