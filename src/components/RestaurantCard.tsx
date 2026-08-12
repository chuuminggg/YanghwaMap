import { Link } from 'react-router'
import { areaLabel, hasCoords, type Restaurant } from '../types/restaurant'

/** 목록 화면의 카드 한 장 — 상호·메뉴·구역·메모(위치 요약)·참조를 한눈에 보여준다. */
export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const area = areaLabel(restaurant)

  return (
    <Link
      to={`/${restaurant.id}`}
      className="block rounded-xl border border-stone-200 bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-stone-900">{restaurant.name}</h3>
          {restaurant.menu && (
            <p className="mt-0.5 truncate text-sm text-brand-600">{restaurant.menu}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            restaurant.visited ? 'bg-brand-50 text-brand-600' : 'bg-stone-100 text-stone-500'
          }`}
        >
          {restaurant.visited ? '가본 곳' : '가볼 곳'}
        </span>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        {area && (
          <div className="flex gap-2">
            <dt className="w-10 shrink-0 text-stone-400">구역</dt>
            <dd className="text-stone-700">{area}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-stone-400">주소</dt>
          <dd className={restaurant.address ? 'text-stone-700' : 'text-stone-400'}>
            {restaurant.address || '미등록'}
          </dd>
        </div>
        {restaurant.memo && (
          <div className="flex gap-2">
            <dt className="w-10 shrink-0 text-stone-400">메모</dt>
            <dd className="text-stone-600">{restaurant.memo}</dd>
          </div>
        )}
        {restaurant.reference && (
          <div className="flex gap-2">
            <dt className="w-10 shrink-0 text-stone-400">참조</dt>
            <dd className="text-stone-600">{restaurant.reference}</dd>
          </div>
        )}
      </dl>

      {!hasCoords(restaurant) && (
        <p className="mt-3 inline-block rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
          지도 위치 미등록 · 주소 찾기 필요
        </p>
      )}
    </Link>
  )
}
