/**
 * '운전' 탭의 다섯 패널이 함께 쓰는 조작부.
 *
 * RestroomPage 가 쓰던 칩/모드 버튼 모양을 그대로 따르되, 같은 클래스 문자열을
 * 다섯 번 베끼지 않도록 여기로 모았다. 화장실 화면은 이미 동작 중이라 건드리지 않는다.
 */

export const chipClass = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
    active
      ? 'border-brand-500 bg-brand-500 text-white'
      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
  }`

export const modeClass = (active: boolean) =>
  `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
    active ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
  }`

export const radiusLabel = (meters: number) =>
  meters < 1000 ? `${meters}m` : `${meters / 1000}km`
