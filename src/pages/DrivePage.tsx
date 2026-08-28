import { useState } from 'react'
import { ChargerPanel } from '../components/drive/ChargerPanel'
import { GasPanel } from '../components/drive/GasPanel'
import { HighwayPanel } from '../components/drive/HighwayPanel'
import { ParkingPanel } from '../components/drive/ParkingPanel'
import { chipClass } from '../components/drive/styles'
import { useCurrentPosition } from '../hooks/useCurrentPosition'

/**
 * 운전 중에 필요한 조회를 한 탭에 모은다.
 *
 * 헤더 탭을 기능마다 하나씩 늘리면 좁은 화면에서 금방 넘친다. 대신 여기서 하위 칩으로 나누고,
 * 위치는 이 화면이 한 번만 잡아 패널들에 넘긴다 — 탭을 옮길 때마다 권한 창이 다시 뜨지 않는다.
 */
const TABS = [
  { key: 'gas', label: '주유소', needsPosition: true },
  { key: 'parking', label: '주차장', needsPosition: true },
  { key: 'charger', label: '충전소', needsPosition: true },
  { key: 'highway', label: '고속도로', needsPosition: true },
] as const

type TabKey = (typeof TABS)[number]['key']

export function DrivePage() {
  const [tab, setTab] = useState<TabKey>('gas')
  const active = TABS.find((item) => item.key === tab)!

  // 위치가 필요 없는 패널(보조금 등)에서는 권한 창을 띄우지 않는다
  const { position, refresh } = useCurrentPosition({ enabled: active.needsPosition })
  const origin = position.status === 'locating' ? null : position.origin

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col">
      <div className="-mx-0 overflow-x-auto border-b border-stone-200 bg-stone-50 px-4 py-3">
        <div className="flex gap-1.5">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={chipClass(tab === item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'gas' && <GasPanel origin={origin} position={position} onRefreshPosition={refresh} />}
      {tab === 'parking' && (
        <ParkingPanel origin={origin} position={position} onRefreshPosition={refresh} />
      )}
      {tab === 'charger' && (
        <ChargerPanel origin={origin} position={position} onRefreshPosition={refresh} />
      )}
      {tab === 'highway' && (
        <HighwayPanel origin={origin} position={position} onRefreshPosition={refresh} />
      )}
    </div>
  )
}
