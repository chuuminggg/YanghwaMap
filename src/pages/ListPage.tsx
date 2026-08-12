import { useMemo } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { FilterBar } from '../components/FilterBar'
import { RestaurantCard } from '../components/RestaurantCard'
import { filterRestaurants } from '../store/selectors'
import { useFilterStore } from '../store/useFilterStore'
import { useRestaurantStore } from '../store/useRestaurantStore'

export function ListPage() {
  const restaurants = useRestaurantStore((s) => s.restaurants)
  const district = useFilterStore((s) => s.district)
  const dong = useFilterStore((s) => s.dong)
  const query = useFilterStore((s) => s.query)
  const visit = useFilterStore((s) => s.visit)

  const filtered = useMemo(
    () => filterRestaurants(restaurants, { district, dong, query, visit }),
    [restaurants, district, dong, query, visit],
  )

  return (
    <div className="space-y-4 p-4 pb-24">
      <FilterBar />

      <p className="text-sm text-stone-500">
        총 <strong className="text-stone-800">{filtered.length}</strong>곳
        {filtered.length !== restaurants.length && ` (전체 ${restaurants.length}곳)`}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title="조건에 맞는 맛집이 없습니다."
          description="필터를 초기화하거나 새로운 맛집을 추가해 보세요."
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((restaurant) => (
            <li key={restaurant.id}>
              <RestaurantCard restaurant={restaurant} />
            </li>
          ))}
        </ul>
      )}

      <Link
        to="/new"
        className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full bg-brand-500 px-6 py-3 font-medium text-white shadow-lg hover:bg-brand-600"
      >
        + 맛집 추가
      </Link>
    </div>
  )
}
