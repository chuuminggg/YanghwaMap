import { formatDistance } from '../lib/geo'
import { kakaoSearchUrl } from '../lib/kakao'
import {
  hasCoords,
  isNearbyRestroom,
  openingHours,
  restroomAddress,
  toiletSummary,
  type NearbyRestroom,
  type Restroom,
} from '../types/restroom'

const featureClass = 'shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600'

/**
 * 거리순·지역구별 목록이 함께 쓰는 카드 한 장.
 *
 * 카드 본문은 눌러서 지도의 마커를 여는 버튼이고, 카카오맵 링크는 그 바깥에 둔다.
 * (button 안에 a 를 넣으면 유효하지 않은 마크업이고, 좌표가 없어 버튼이 비활성화되면
 *  링크까지 함께 죽는다 — 지오코딩 전에는 링크가 유일한 이동 수단이다.)
 */
export function RestroomCard({
  restroom,
  selected,
  onSelect,
}: {
  restroom: Restroom | NearbyRestroom
  selected: boolean
  onSelect: () => void
}) {
  const hours = openingHours(restroom)
  const toilets = toiletSummary(restroom)
  const located = hasCoords(restroom)

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
            <h3 className="truncate font-semibold text-stone-900">{restroom.name}</h3>
            <p className="mt-0.5 truncate text-sm text-stone-500">
              {restroom.type}
              {hours && ` · ${hours}`}
            </p>
          </div>
          {isNearbyRestroom(restroom) && (
            <span className="shrink-0 text-sm font-semibold text-brand-600">
              {formatDistance(restroom.distanceMeters)}
            </span>
          )}
        </div>

        <p className="mt-2 truncate text-xs text-stone-500">{restroomAddress(restroom)}</p>
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {toilets && <span className={featureClass}>{toilets}</span>}
        {restroom.accessible && <span className={featureClass}>장애인용</span>}
        {restroom.diaperTable && <span className={featureClass}>기저귀교환대</span>}
        {restroom.emergencyBell && <span className={featureClass}>비상벨</span>}
        {restroom.cctv && <span className={featureClass}>CCTV</span>}
        {!located && (
          <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
            지도 위치 미등록
          </span>
        )}

        <a
          href={kakaoSearchUrl(`${restroomAddress(restroom)} ${restroom.name}`)}
          target="_blank"
          rel="noreferrer"
          className="ml-auto shrink-0 text-xs text-stone-400 underline-offset-2 hover:text-brand-600 hover:underline"
        >
          카카오맵에서 열기
        </a>
      </div>
    </div>
  )
}
