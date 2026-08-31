import { useMemo, useState } from 'react'
import { useAsyncQuery } from '../../hooks/useAsyncQuery'
import { listSubsidyModels, listSubsidyStatus } from '../../lib/api'
import {
  manwonLabel,
  subsidyTone,
  SUBSIDY_VEHICLES,
  type SubsidyModelResult,
  type SubsidyRegion,
  type SubsidyResult,
} from '../../types/drive'
import { PanelBody } from './NearbyLayout'
import { chipClass } from './styles'

const NO_ITEMS: SubsidyRegion[] = []
const countClass = 'flex flex-col items-center gap-0.5'

const count = (value: number | null) => (value === null ? '—' : value.toLocaleString('ko-KR'))

/**
 * 지자체별 전기차 구매보조금 지급현황.
 *
 * 다른 패널과 달리 위치를 쓰지 않는다 — 보조금은 주소지 기준이지 현재 위치 기준이 아니다.
 * 지자체가 161곳뿐이라 한 번에 받아 두고 시도·검색어 필터는 브라우저에서 건다.
 */
export function SubsidyPanel() {
  const [vehicle, setVehicle] = useState<string>('passenger')
  const [sido, setSido] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { state } = useAsyncQuery<SubsidyResult>(
    `subsidy:${vehicle}`,
    () => listSubsidyStatus({ vehicle }),
    '보조금 현황을 불러오지 못했습니다.',
  )

  // 카드를 펼친 지자체 하나만 모델 표를 받아 온다 — 161곳을 미리 받을 이유가 없다
  const models = useAsyncQuery<SubsidyModelResult>(
    expanded ? `models:${expanded}:${vehicle}` : null,
    () => listSubsidyModels({ localCode: expanded!, vehicle }),
    '모델별 보조금을 불러오지 못했습니다.',
  )

  const all = state.status === 'ready' ? state.data.items : NO_ITEMS
  const sidoList = state.status === 'ready' ? state.data.sidoList : []

  const items = useMemo(() => {
    const needle = keyword.trim()
    return all.filter(
      (item) => (!sido || item.sido === sido) && (!needle || item.name.includes(needle)),
    )
  }, [all, sido, keyword])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {SUBSIDY_VEHICLES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setVehicle(item.key)
                  setExpanded(null)
                }}
                className={chipClass(vehicle === item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="지자체 검색"
            className="ml-auto w-32 min-w-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500"
          />
        </div>

        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setSido(null)} className={chipClass(sido === null)}>
              전체
            </button>
            {sidoList.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setSido(name)}
                className={chipClass(sido === name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-stone-500">
          {state.status === 'ready'
            ? `${state.data.year}년 ${state.data.vehicleLabel} · ${items.length}개 지자체`
            : '환경부 무공해차 통합누리집 공개 지급현황입니다.'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-stone-50 px-4 py-3">
        <PanelBody
          status={state.status}
          message={state.status === 'error' ? state.message : undefined}
          count={items.length}
          loadingText="보조금 현황을 불러오는 중…"
          errorTitle="보조금 현황을 불러오지 못했습니다."
          emptyTitle="해당하는 지자체가 없습니다."
          emptyDescription="시도를 바꾸거나 검색어를 지워 보세요."
        >
          <ul className="space-y-3">
            {items.map((region) => (
              <li key={`${region.localCode}:${region.vehicleLabel}`}>
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-stone-900">{region.name}</h3>
                      <p className="mt-0.5 truncate text-sm text-stone-500">
                        {region.sido} · {region.vehicleLabel}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${subsidyTone(region.status)}`}
                    >
                      {region.status}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-stone-50 py-2 text-xs">
                    <div className={countClass}>
                      <span className="text-stone-400">공고</span>
                      <span className="font-semibold text-stone-700">{count(region.noticeCount)}</span>
                    </div>
                    <div className={countClass}>
                      <span className="text-stone-400">접수</span>
                      <span className="font-semibold text-stone-700">{count(region.receivedCount)}</span>
                    </div>
                    <div className={countClass}>
                      <span className="text-stone-400">출고</span>
                      <span className="font-semibold text-stone-700">{count(region.releasedCount)}</span>
                    </div>
                    <div className={countClass}>
                      <span className="text-stone-400">출고잔여</span>
                      <span className="font-semibold text-brand-600">{count(region.remainingCount)}</span>
                    </div>
                  </div>

                  {region.note && (
                    <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs text-stone-500">
                      {region.note}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === region.localCode ? null : region.localCode)}
                    className="mt-3 rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-500 transition hover:border-brand-300 hover:text-brand-600"
                  >
                    {expanded === region.localCode ? '모델별 보조금 닫기' : '모델별 보조금'}
                  </button>

                  {expanded === region.localCode && (
                    <div className="mt-3 border-t border-stone-100 pt-3">
                      {models.state.status === 'ready' ? (
                        models.state.data.items.length === 0 ? (
                          <p className="text-xs text-stone-400">공개된 모델별 보조금이 없습니다.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {models.state.data.items.map((model, index) => (
                              <li
                                key={`${model.maker}:${model.model}:${index}`}
                                className="flex items-center gap-2 text-xs"
                              >
                                <span className="min-w-0 flex-1 truncate text-stone-700">
                                  {model.model}
                                </span>
                                <span className="shrink-0 text-stone-400">
                                  국비 {manwonLabel(model.nationalKrw)} · 지방 {manwonLabel(model.localKrw)}
                                </span>
                                <span className="shrink-0 font-semibold text-stone-900">
                                  {manwonLabel(model.totalKrw)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )
                      ) : models.state.status === 'error' ? (
                        <p className="text-xs text-red-600">{models.state.message}</p>
                      ) : (
                        <p className="text-xs text-stone-400">모델별 보조금을 불러오는 중…</p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </PanelBody>
      </div>

      <p className="border-t border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">
        출고잔여는 공고 − 출고일 뿐이라 실제 신청 가능 대수와 다릅니다. 잔여가 남아 있어도 비고가 마감이면
        신청할 수 없습니다. 신청 전 해당 지자체에 확인하세요.
      </p>
    </div>
  )
}
