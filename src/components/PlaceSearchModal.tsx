import { useEffect, useState } from 'react'
import { hasKakaoKey, kakaoSearchUrl, searchPlaces } from '../lib/kakao'

type Props = {
  open: boolean
  initialKeyword: string
  onClose: () => void
  onSelect: (place: kakao.maps.services.PlaceResult) => void
}

/** 카카오 장소 검색 결과를 골라 주소·좌표·카카오맵 링크를 한 번에 채운다. */
export function PlaceSearchModal({ open, initialKeyword, onClose, onSelect }: Props) {
  const [keyword, setKeyword] = useState(initialKeyword)
  const [results, setResults] = useState<kakao.maps.services.PlaceResult[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  // 열릴 때마다 기본 검색어로 초기화 (이전 검색 결과가 남지 않도록)
  useEffect(() => {
    if (!open) return
    setKeyword(initialKeyword)
    setResults([])
    setState('idle')
    setError('')
  }, [open, initialKeyword])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const runSearch = async () => {
    setState('loading')
    setError('')
    try {
      setResults(await searchPlaces(keyword))
      setState('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : '검색에 실패했습니다.')
      setState('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 className="text-base font-semibold">주소 찾기</h2>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-600">
            닫기
          </button>
        </header>

        <div className="flex gap-2 p-4">
          <input
            autoFocus
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch()
            }}
            placeholder="예) 강남구 대치동 한촌설렁탕"
            className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={state === 'loading' || !keyword.trim()}
            className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {state === 'loading' ? '검색 중' : '검색'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {!hasKakaoKey && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              카카오맵 앱 키가 없어 검색을 사용할 수 없습니다. 주소는 직접 입력하거나{' '}
              <a
                href={kakaoSearchUrl(keyword)}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                카카오맵에서 검색
              </a>
              해 보세요.
            </p>
          )}
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          {state === 'done' && results.length === 0 && (
            <p className="py-6 text-center text-sm text-stone-400">검색 결과가 없습니다.</p>
          )}

          <ul className="divide-y divide-stone-100">
            {results.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => onSelect(place)}
                  className="w-full py-3 text-left hover:bg-stone-50"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{place.place_name}</span>
                    <span className="truncate text-xs text-stone-400">
                      {place.category_name.split('>').pop()?.trim()}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-stone-600">
                    {place.road_address_name || place.address_name}
                  </div>
                  {place.phone && <div className="text-xs text-stone-400">{place.phone}</div>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
