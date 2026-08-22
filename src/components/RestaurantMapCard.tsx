import { Link } from 'react-router'
import { formatDistance } from '../lib/geo'
import { kakaoSearchUrl } from '../lib/kakao'
import { areaLabel, hasCoords, isApproximate, type Restaurant } from '../types/restaurant'

/**
 * 지도 화면 아래 목록에 쓰는 카드 한 장.
 *
 * 카드 본문은 눌러서 지도의 마커를 여는 버튼이고, 상세 링크는 그 바깥에 둔다.
 * (button 안에 a 를 넣으면 유효하지 않은 마크업이고, 좌표가 없어 버튼이 비활성화되면
 *  링크까지 함께 죽는다 — 좌표 등록 전에는 상세가 유일한 이동 수단이다.)
 */
export function RestaurantMapCard({
  restaurant,
  selected,
  onSelect,
  distanceMeters,
}: {
  restaurant: Restaurant
  selected: boolean
  onSelect: () => void
  /** '내 주변'일 때만 준다 */
  distanceMeters?: number
}) {
  const area = areaLabel(restaurant)
  const located = hasCoords(restaurant)

  return (
    <div
      className={`rounded-xl border bg-white p-4 transition ${
        selected
          ? 'border-brand-500 ring-1 ring-brand-500'
          : located
            ? 'border-stone-200 hover:border-brand-300 hover:shadow-sm'
            : 'border-stone-200'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={!located}
        className="block w-full text-left disabled:cursor-default"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-stone-900">{restaurant.name}</h3>
            {restaurant.menu && (
              <p className="mt-0.5 truncate text-sm text-brand-600">{restaurant.menu}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {distanceMeters !== undefined && (
              <span className="text-sm font-semibold text-brand-600">
                {formatDistance(distanceMeters)}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                restaurant.visited ? 'bg-brand-50 text-brand-600' : 'bg-stone-100 text-stone-500'
              }`}
            >
              {restaurant.visited ? '가본 곳' : '가볼 곳'}
            </span>
          </div>
        </div>

        <p className="mt-2 truncate text-xs text-stone-500">
          {[area, restaurant.address || restaurant.memo].filter(Boolean).join(' · ') || '주소 미등록'}
        </p>
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {!located ? (
          <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
            지도 위치 미등록
          </span>
        ) : (
          isApproximate(restaurant) && (
            <span
              className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
              title="메모의 랜드마크로 추정한 위치입니다. 상세에서 '주소 찾기'로 정확한 위치를 등록할 수 있습니다."
            >
              위치 대략
            </span>
          )
        )}
        {!located && (
          <a
            href={kakaoSearchUrl([area, restaurant.name].filter(Boolean).join(' '))}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs text-stone-400 underline-offset-2 hover:text-brand-600 hover:underline"
          >
            카카오맵에서 열기
          </a>
        )}
        <Link
          to={`/${restaurant.id}`}
          className="ml-auto shrink-0 text-xs text-stone-400 underline-offset-2 hover:text-brand-600 hover:underline"
        >
          상세 보기 →
        </Link>
      </div>
    </div>
  )
}
