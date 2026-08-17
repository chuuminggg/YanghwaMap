import { useState } from 'react'
import { useNavigate } from 'react-router'
import { defaultSearchKeyword, placeToPatch } from '../lib/kakao'
import { emptyDraft, type RestaurantDraft } from '../types/restaurant'
import { PlaceSearchModal } from './PlaceSearchModal'

type Props = {
  initial?: RestaurantDraft
  submitLabel: string
  onSubmit: (draft: RestaurantDraft) => void
  onDelete?: () => void
}

const labelClass = 'block text-sm font-medium text-stone-700'
const inputClass =
  'mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

/** 등록/수정 공용 폼. '주소 찾기'로 주소·좌표·카카오맵 링크를 한 번에 채운다. */
export function RestaurantForm({ initial, submitLabel, onSubmit, onDelete }: Props) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<RestaurantDraft>(initial ?? emptyDraft())
  const [searchOpen, setSearchOpen] = useState(false)

  const set = <K extends keyof RestaurantDraft>(key: K, value: RestaurantDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const handleSelectPlace = (place: kakao.maps.services.PlaceResult) => {
    const { suggestedName, patch } = placeToPatch(place)
    setDraft((prev) => ({
      ...prev,
      ...patch,
      // 상호를 아직 안 적었으면 검색 결과 이름을 그대로 쓴다
      name: prev.name.trim() || suggestedName,
    }))
    setSearchOpen(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = draft.name.trim()
    if (!name) return
    onSubmit({ ...draft, name })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="name">
          상호 <span className="text-brand-500">*</span>
        </label>
        <input
          id="name"
          required
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="예) 한촌설렁탕"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="menu">
          메뉴 / 업종
        </label>
        <input
          id="menu"
          value={draft.menu}
          onChange={(e) => set('menu', e.target.value)}
          placeholder="예) 설렁탕, 백반집"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="district">
            구
          </label>
          <input
            id="district"
            value={draft.district}
            onChange={(e) => set('district', e.target.value)}
            placeholder="예) 강남구"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="dong">
            동
          </label>
          <input
            id="dong"
            value={draft.dong}
            onChange={(e) => set('dong', e.target.value)}
            placeholder="예) 대치동"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className={labelClass} htmlFor="address">
            주소
          </label>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="rounded-lg border border-brand-300 px-3 py-1 text-sm text-brand-600 hover:bg-brand-50"
          >
            주소 찾기
          </button>
        </div>
        <input
          id="address"
          value={draft.address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="주소 찾기로 채우거나 직접 입력"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-stone-400">
          {draft.lat && draft.lng
            ? `좌표 등록됨 (${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)})`
            : '좌표가 없으면 지도에 표시되지 않습니다.'}
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="memo">
          추가 메모 (간단 위치 요약)
        </label>
        <textarea
          id="memo"
          rows={2}
          value={draft.memo}
          onChange={(e) => set('memo', e.target.value)}
          placeholder="예) 남부터미널 대각선 골목"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="reference">
          참조
        </label>
        <input
          id="reference"
          value={draft.reference}
          onChange={(e) => set('reference', e.target.value)}
          placeholder="예) 1시까지 영업, 주차 가능"
          className={inputClass}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={draft.visited}
          onChange={(e) => set('visited', e.target.checked)}
          className="size-4 accent-brand-500"
        />
        가본 곳
      </label>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-brand-500 px-4 py-2.5 font-medium text-white hover:bg-brand-600"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg border border-stone-300 px-4 py-2.5 text-stone-600 hover:bg-stone-50"
        >
          취소
        </button>
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
        >
          삭제
        </button>
      )}

      <PlaceSearchModal
        open={searchOpen}
        initialKeyword={defaultSearchKeyword(draft)}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSelectPlace}
      />
    </form>
  )
}
