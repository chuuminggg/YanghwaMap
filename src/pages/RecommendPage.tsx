import { useCallback, useMemo, useRef, useState } from 'react'
import type { MapMarker } from '../components/KakaoMap'
import { RecommendCard } from '../components/RecommendCard'
import { chipClass, modeClass } from '../components/drive/styles'
import { NearbyLayout, PanelBody } from '../components/drive/NearbyLayout'
import { useAsyncQuery } from '../hooks/useAsyncQuery'
import { useCurrentPosition } from '../hooks/useCurrentPosition'
import { listRecommendations } from '../lib/api'
import { formatDistance } from '../lib/geo'
import type { RecommendPlace } from '../types/recommend'

/**
 * '추천' 탭 — 지도 탭 옆에 붙는 화면.
 *
 * 지도 탭이 '내가 가 본 곳'을 보여 준다면 여기는 '아직 모르는 곳'이다. 카카오 로컬 검색 후보를
 * 다음 블로그 글로 재평가하는 PlayMCP 맛집검색(playmcp.kakao.com/mcp/200)을 서버가 부르고,
 * 화면은 그 결과를 지도 + 목록으로 받는다.
 *
 * 검색이 역·동 단위라 '가장 가까운 집'을 주지는 못한다. 그래서 거리순 정렬을 따로 두고,
 * 어느 지역을 검색했는지(그리고 어디가 후보를 못 냈는지)를 화면에 그대로 적는다.
 */

/** 자주 쓰는 키워드. 직접 입력이 기본이고 이건 지름길이다. */
const PRESETS = ['한식', '고기', '국밥', '파스타', '초밥', '카페']

export function RecommendPage() {
  const { position, refresh } = useCurrentPosition()
  const origin = position.status === 'locating' ? null : position.origin

  const [keyword, setKeyword] = useState('')
  const [draft, setDraft] = useState('')
  const [sort, setSort] = useState<'score' | 'distance'>('score')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // 좌표를 그대로 키로 쓰면 GPS가 미세하게 떨릴 때마다 다시 부른다. 서버도 같은 격자로 캐시한다.
  const key = origin ? `${origin.lat.toFixed(3)},${origin.lng.toFixed(3)},${keyword}` : null
  const { state, refresh: reload } = useAsyncQuery(
    key,
    () => listRecommendations({ lat: origin!.lat, lng: origin!.lng, keyword }),
    '추천을 불러오지 못했습니다.',
  )

  const result = state.status === 'ready' ? state.data : null

  const places = useMemo<RecommendPlace[]>(() => {
    const rows = result?.places ?? []
    if (sort === 'score') return rows
    // 좌표를 못 찾은 곳은 거리를 모른다. 0으로 두면 가장 가까운 척하게 되므로 뒤로 보낸다.
    return [...rows].sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
  }, [result, sort])

  const markers = useMemo<MapMarker[]>(
    () =>
      places.flatMap((place) =>
        place.lat === undefined || place.lng === undefined
          ? []
          : [
              {
                id: place.id,
                lat: place.lat,
                lng: place.lng,
                title: place.name,
                subtitle: [
                  place.distanceMeters !== undefined ? formatDistance(place.distanceMeters) : place.region,
                  place.category.split('>').map((part) => part.trim())[1] ?? '',
                ]
                  .filter(Boolean)
                  .join(' · '),
              },
            ],
      ),
    [places],
  )

  const handleMarkerClick = useCallback((id: string) => {
    setSelectedId(id)
    listRef.current?.querySelector(`[data-place-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  const submit = (value: string) => {
    setDraft(value)
    setKeyword(value.trim())
    setSelectedId(null)
  }

  const regions = result?.regions ?? []
  const status = position.status === 'locating' ? 'loading' : state.status

  return (
    <div className="flex h-full flex-col">
      <NearbyLayout
        controls={
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submit(draft)
              }}
              className="flex gap-2"
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="메뉴 키워드 (예: 파스타)"
                className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-400"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
              >
                찾기
              </button>
            </form>

            <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
              <button type="button" onClick={() => submit('')} className={chipClass(keyword === '')}>
                전체
              </button>
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => submit(preset)}
                  className={chipClass(keyword === preset)}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex flex-1 rounded-lg bg-stone-200/70 p-0.5">
                <button type="button" onClick={() => setSort('score')} className={modeClass(sort === 'score')}>
                  추천순
                </button>
                <button type="button" onClick={() => setSort('distance')} className={modeClass(sort === 'distance')}>
                  거리순
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  refresh()
                  reload()
                }}
                disabled={position.status === 'locating'}
                className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 transition hover:border-stone-300 disabled:opacity-50"
              >
                📍 현재 위치
              </button>
            </div>

            <p className="truncate text-xs text-stone-500">
              {position.status === 'locating'
                ? '위치를 확인하는 중입니다…'
                : position.status === 'fallback'
                  ? position.reason
                  : regions.length > 0
                    ? `${regions.join(' · ')} 기준 ${places.length}곳`
                    : '내 위치 기준'}
            </p>
          </>
        }
        markers={markers}
        listFirst
        origin={origin}
        selectedId={selectedId}
        onMarkerClick={handleMarkerClick}
        // 390px에서 네 줄이 되면 목록이 그만큼 가려진다. 한계를 알리되 두 줄 안에 끝낸다.
        footer="PlayMCP 맛집검색이 블로그 글의 최근성·광고 비율로 매긴 순위입니다. 역 단위로 찾으므로 가장 가까운 집은 아닐 수 있습니다."
      >
        <PanelBody
          status={status}
          message={state.status === 'error' ? state.message : undefined}
          count={places.length}
          loadingText="추천을 찾는 중입니다…"
          errorTitle="추천을 불러오지 못했습니다."
          emptyTitle="추천할 곳을 찾지 못했습니다."
          emptyDescription={
            result && result.skipped.length > 0
              ? `${result.skipped.join(' · ')}에서 후보를 만들지 못했습니다. 키워드를 바꾸거나 잠시 후 다시 시도해 보세요.`
              : '키워드를 바꾸거나 다른 곳에서 다시 시도해 보세요.'
          }
        >
          <ul ref={listRef} className="space-y-3">
            {places.map((place, index) => (
              <li key={place.id} data-place-id={place.id}>
                <RecommendCard
                  place={place}
                  rank={index + 1}
                  selected={selectedId === place.id}
                  onSelect={() => setSelectedId(place.id)}
                />
              </li>
            ))}
          </ul>

          {result && result.skipped.length > 0 && places.length > 0 && (
            <p className="mt-4 text-xs text-stone-400">
              {result.skipped.join(' · ')}은 후보를 만들지 못해 빠졌습니다.
            </p>
          )}
        </PanelBody>
      </NearbyLayout>
    </div>
  )
}
