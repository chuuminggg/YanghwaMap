import { formatDistance } from '../lib/geo'
import { kakaoSearchUrl } from '../lib/kakao'
import { openingHours, restroomAddress, toiletSummary, type NearbyRestroom } from '../types/restroom'

const featureClass = 'shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600'

/**
 * 거리순 목록의 카드 한 장.
 * 상세 화면이 없고 누르면 지도의 해당 마커를 여는 게 목적이라 Link 대신 button이다.
 */
export function RestroomCard({
  restroom,
  selected,
  onSelect,
}: {
  restroom: NearbyRestroom
  selected: boolean
  onSelect: () => void
}) {
  const hours = openingHours(restroom)
  const toilets = toiletSummary(restroom)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-xl border bg-white p-4 text-left transition ${
        selected
          ? 'border-brand-500 ring-1 ring-brand-500'
          : 'border-stone-200 hover:border-brand-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-stone-900">{restroom.name}</h3>
          <p className="mt-0.5 truncate text-sm text-stone-500">
            {restroom.type}
            {hours && ` · ${hours}`}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-brand-600">
          {formatDistance(restroom.distanceMeters)}
        </span>
      </div>

      <p className="mt-2 truncate text-xs text-stone-500">{restroomAddress(restroom)}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {toilets && <span className={featureClass}>{toilets}</span>}
        {restroom.accessible && <span className={featureClass}>장애인용</span>}
        {restroom.diaperTable && <span className={featureClass}>기저귀교환대</span>}
        {restroom.emergencyBell && <span className={featureClass}>비상벨</span>}
        {restroom.cctv && <span className={featureClass}>CCTV</span>}

        <a
          href={kakaoSearchUrl(`${restroomAddress(restroom)} ${restroom.name}`)}
          target="_blank"
          rel="noreferrer"
          // 카드 클릭(지도 이동)과 링크 이동이 겹치지 않도록 버블링을 끊는다
          onClick={(event) => event.stopPropagation()}
          className="ml-auto shrink-0 text-xs text-stone-400 underline-offset-2 hover:text-brand-600 hover:underline"
        >
          카카오맵에서 열기
        </a>
      </div>
    </button>
  )
}
