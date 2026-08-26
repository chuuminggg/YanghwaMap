import type { ReactNode } from 'react'
import { EmptyState } from '../EmptyState'
import { KakaoMap, type MapMarker } from '../KakaoMap'
import type { LatLng } from '../../lib/geo'

/**
 * '내 주변'을 지도 + 목록으로 보여 주는 세 패널(주유소·주차장·충전소)의 공통 뼈대.
 *
 * RestroomPage 와 같은 3:2 비율을 쓴다. 세 패널이 다른 건 필터 줄과 카드 모양뿐이라
 * 나머지(지도, 스크롤 목록, 상태 분기, 하단 주의문)를 여기로 모았다.
 */
export function NearbyLayout({
  controls,
  markers,
  origin,
  selectedId,
  onMarkerClick,
  children,
  footer,
}: {
  /** 필터 칩 · 위치 버튼 · 안내 한 줄 */
  controls: ReactNode
  markers: MapMarker[]
  origin: LatLng | null
  selectedId: string | null
  onMarkerClick: (id: string) => void
  /** 목록 본문. 보통 <PanelBody> 로 감싼다. */
  children: ReactNode
  footer: string
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-stone-200 bg-stone-50 px-4 py-3">{controls}</div>

      <KakaoMap
        markers={markers}
        className="min-h-0 flex-[3]"
        origin={origin}
        selectedId={selectedId}
        onMarkerClick={onMarkerClick}
      />

      <div className="min-h-0 flex-[2] overflow-y-auto border-t border-stone-200 bg-stone-50 px-4 py-3">
        {children}
      </div>

      <p className="border-t border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">{footer}</p>
    </div>
  )
}

/**
 * 조회 상태에 따라 로딩·오류·빈 목록을 가려 준다.
 *
 * useAsyncQuery 를 쓰는 패널마다 같은 4단 삼항 연산자가 반복돼 여기로 뺐다.
 * 제네릭 대신 status 와 건수만 받는다 — 데이터 모양은 패널이 알아서 그리면 된다.
 */
export function PanelBody({
  status,
  message,
  count,
  loadingText,
  errorTitle,
  emptyTitle,
  emptyDescription,
  children,
}: {
  status: 'idle' | 'loading' | 'ready' | 'error'
  message?: string
  count: number
  loadingText: string
  errorTitle: string
  emptyTitle: string
  emptyDescription: string
  children: ReactNode
}) {
  if (status === 'idle' || status === 'loading') {
    return <p className="py-8 text-center text-sm text-stone-400">{loadingText}</p>
  }
  if (status === 'error') return <EmptyState title={errorTitle} description={message} />
  if (count === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />
  return <>{children}</>
}
