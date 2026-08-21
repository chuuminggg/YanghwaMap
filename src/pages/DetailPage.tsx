import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { KakaoMap, type MapMarker } from '../components/KakaoMap'
import { PlaceSearchModal } from '../components/PlaceSearchModal'
import { defaultSearchKeyword, kakaoSearchUrl, placeToPatch } from '../lib/kakao'
import { useRestaurantStore } from '../store/useRestaurantStore'
import { areaLabel, hasCoords } from '../types/restaurant'

export function DetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const restaurant = useRestaurantStore((s) => s.restaurants.find((r) => r.id === id))
  const update = useRestaurantStore((s) => s.update)
  const toggleVisited = useRestaurantStore((s) => s.toggleVisited)
  const [searchOpen, setSearchOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  /** 서버 반영이 끝날 때까지 버튼을 잠그고, 실패하면 이유를 화면에 남긴다. */
  const save = async (action: () => Promise<void>) => {
    setSaving(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const markers = useMemo<MapMarker[]>(
    () =>
      restaurant && hasCoords(restaurant)
        ? [{ id: restaurant.id, lat: restaurant.lat, lng: restaurant.lng, title: restaurant.name }]
        : [],
    [restaurant],
  )

  if (!restaurant) {
    return (
      <div className="p-4">
        <EmptyState title="존재하지 않는 맛집입니다." description={<Link to="/" className="underline">목록으로 돌아가기</Link>} />
      </div>
    )
  }

  const area = areaLabel(restaurant)
  const rows: Array<[string, string]> = [
    ['구역', area || restaurant.areaRaw || '-'],
    ['주소', restaurant.address || '미등록'],
    ['메뉴', restaurant.menu || '-'],
    ['메모', restaurant.memo || '-'],
    ['참조', restaurant.reference || '-'],
  ]

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{restaurant.name}</h1>
          {restaurant.menu && <p className="text-sm text-brand-600">{restaurant.menu}</p>}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(() => toggleVisited(restaurant.id))}
          className={`shrink-0 rounded-full px-3 py-1 text-sm disabled:opacity-60 ${
            restaurant.visited ? 'bg-brand-50 text-brand-600' : 'bg-stone-100 text-stone-500'
          }`}
        >
          {restaurant.visited ? '가본 곳' : '가볼 곳'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <KakaoMap markers={markers} className="h-56 overflow-hidden rounded-xl" />

      {!hasCoords(restaurant) && (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="w-full rounded-lg border border-brand-300 px-4 py-2.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
        >
          주소 찾기로 지도 위치 등록
        </button>
      )}

      <dl className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white px-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3 py-3 text-sm">
            <dt className="w-12 shrink-0 text-stone-400">{label}</dt>
            <dd className="text-stone-700">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex gap-2">
        <a
          href={restaurant.kakaoPlaceUrl ?? kakaoSearchUrl(defaultSearchKeyword(restaurant))}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-lg bg-[#FEE500] px-4 py-2.5 text-center text-sm font-medium text-stone-900 hover:brightness-95"
        >
          카카오맵에서 열기
        </a>
        <button
          type="button"
          onClick={() => navigate(`/${restaurant.id}/edit`)}
          className="flex-1 rounded-lg border border-stone-300 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50"
        >
          수정
        </button>
      </div>

      <PlaceSearchModal
        open={searchOpen}
        initialKeyword={defaultSearchKeyword(restaurant)}
        onClose={() => setSearchOpen(false)}
        onSelect={(place) => {
          setSearchOpen(false)
          void save(() => update(restaurant.id, placeToPatch(place).patch))
        }}
      />
    </div>
  )
}
