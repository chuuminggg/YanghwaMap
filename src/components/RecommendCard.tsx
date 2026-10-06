import { formatDistance } from '../lib/geo'
import type { RecommendPlace } from '../types/recommend'

/** '음식점 > 한식 > 육류,고기' → '한식 · 육류,고기' — 첫 단계는 전부 '음식점'이라 버린다. */
const categoryLabel = (category: string) =>
  category
    .split('>')
    .map((part) => part.trim())
    .filter((part) => part && part !== '음식점')
    .slice(0, 2)
    .join(' · ')

/** '2026-07-22T03:16:00.000+09:00' → '26.07' */
const monthLabel = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : `${String(date.getFullYear()).slice(2)}.${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 추천 한 곳. 지도 화면의 카드와 같은 모양이되 보여 주는 값이 다르다.
 *
 * 내 목록의 카드는 내가 매긴 별점과 메모를 보여 주지만 여기엔 그런 게 없다.
 * 대신 이 집이 왜 올라왔는지 — 최근에 쓰인 블로그 글 몇 편 — 를 그대로 건다.
 * 요약을 지어내는 대신 원문 링크를 보여 주는 쪽이 판단에 쓸모가 있다.
 */
export function RecommendCard({
  place,
  rank,
  selected,
  onSelect,
}: {
  place: RecommendPlace
  rank: number
  selected: boolean
  onSelect: () => void
}) {
  const category = categoryLabel(place.category)

  return (
    <div
      className={`rounded-xl border bg-white p-4 transition ${
        selected ? 'border-brand-500 ring-1 ring-brand-500' : 'border-stone-200 hover:border-brand-300 hover:shadow-sm'
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
            {rank}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-stone-900">{place.name}</p>
            <p className="mt-0.5 truncate text-xs text-stone-500">
              {[category, place.region].filter(Boolean).join(' · ')}
            </p>
          </div>
          {place.distanceMeters !== undefined && (
            <span className="shrink-0 text-xs text-stone-400">{formatDistance(place.distanceMeters)}</span>
          )}
        </div>

        {place.address && <p className="mt-2 truncate text-xs text-stone-400">{place.address}</p>}
      </button>

      {/* 근거 요약 — 숫자만으로는 무슨 뜻인지 모르므로 문장으로 적는다 */}
      <p className="mt-2 text-xs text-stone-500">
        블로그 언급 {place.mentionCount.toLocaleString()}건
        {place.recentCount > 0 && ` · 최근 6개월 글 ${place.recentCount}편`}
        {place.promoCount > 0 && ` · 광고로 걸러 냄 ${place.promoCount}편`}
      </p>

      {place.sources.length > 0 && (
        <ul className="mt-2 space-y-1">
          {place.sources.map((source) => (
            <li key={source.url} className="truncate text-xs">
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-brand-600"
              >
                {source.title || source.url}
              </a>
              {source.publishedAt && <span className="ml-1 text-stone-300">{monthLabel(source.publishedAt)}</span>}
            </li>
          ))}
        </ul>
      )}

      <a
        href={place.mapUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-xs text-brand-600 hover:underline"
      >
        카카오맵에서 열기 →
      </a>
    </div>
  )
}
