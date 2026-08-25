import type { PositionState } from '../../hooks/useCurrentPosition'
import { chipClass, radiusLabel } from './styles'

/** 운전 탭 패널들이 함께 쓰는 조작 컴포넌트. 클래스 헬퍼는 styles.ts 에 있다. */

export function RadiusChips({
  options,
  value,
  onChange,
}: {
  options: readonly number[]
  value: number
  onChange: (meters: number) => void
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((meters) => (
        <button key={meters} type="button" onClick={() => onChange(meters)} className={chipClass(value === meters)}>
          {radiusLabel(meters)}
        </button>
      ))}
    </div>
  )
}

/** 위치를 다시 잡는 버튼. 잡는 동안은 눌러도 소용이 없으므로 비활성으로 둔다. */
export function LocateButton({ position, onRefresh }: { position: PositionState; onRefresh: () => void }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={position.status === 'locating'}
      className="ml-auto shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 transition hover:border-stone-300 disabled:opacity-50"
    >
      {position.status === 'locating' ? '위치 확인 중…' : '📍 현재 위치'}
    </button>
  )
}

/** 필터 줄 아래에 붙는 한 줄 안내. 위치 폴백 사유가 있으면 그쪽이 우선한다. */
export function PositionNote({ position, children }: { position: PositionState; children: React.ReactNode }) {
  return (
    <p className="text-xs text-stone-500">
      {position.status === 'fallback'
        ? position.reason
        : position.status === 'locating'
          ? '위치를 확인하는 중입니다…'
          : children}
    </p>
  )
}
