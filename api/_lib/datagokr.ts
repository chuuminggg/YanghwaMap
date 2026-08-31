import {
  fetchUpstreamRaw,
  InvalidUpstreamKeyError,
  MissingUpstreamKeyError,
  readKey,
  UpstreamError,
} from './upstream.js'

/**
 * 공공데이터포털(data.go.kr) 공통부.
 *
 * 주차장·전기차 충전소가 같은 포털의 같은 인증키를 쓰고, 실패 응답 모양도 같다.
 * 포털은 오류를 두 가지 봉투로 준다 — 게이트웨이 단계에서 막히면 `OpenAPI_ServiceResponse`,
 * 서비스까지 도달했으면 `response.header.resultCode`.
 *
 * 상태 코드는 믿을 수 없다. 봉투는 HTTP 200 으로도, 403 으로도 온다. 그래서 상태 코드로
 * 성공/실패를 가르지 않고 본문의 봉투를 먼저 읽는다 — 사유는 늘 본문에 있다.
 */

const KEY_GUIDE =
  'data.go.kr 에서 인증키를 발급받아 DATA_GO_KR_API_KEY 에 넣어 주세요. ' +
  '포털 키가 있어도 데이터셋마다 활용신청을 따로 해야 합니다(대부분 자동승인).'

export const dataGoKrKey = () => {
  const key = readKey('DATA_GO_KR_API_KEY')
  if (!key) throw new MissingUpstreamKeyError('DATA_GO_KR_API_KEY', KEY_GUIDE)
  return key
}

/**
 * 포털은 같은 키를 두 형태로 발급한다.
 *   Encoding : abc%2Bdef%2Fghi%3D%3D
 *   Decoding : abc+def/ghi==
 * 어느 쪽을 넣어도 되도록 한 번 풀었다가 다시 인코딩해 한 가지 형태로 맞춘다.
 * Decoding 키에는 '%'가 없어 푸는 단계가 사실상 통과이고, Encoding 키만 실제로 풀린다.
 *
 * 키가 중간에 잘려 '%'가 홀로 남으면 decodeURIComponent 가 URIError 를 던진다.
 * 그대로 두면 우리 버그처럼 보이는 500이 나가므로, 붙여넣기 문제라고 분명히 말해 준다.
 */
function encodeServiceKey(key: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(key))
  } catch {
    throw new InvalidUpstreamKeyError(
      'DATA_GO_KR_API_KEY',
      '포털 > 마이페이지 > 인증키 발급현황에서 일반 인증키(Decoding) 한 칸을 통째로 다시 복사해 주세요.',
    )
  }
}

type ErrorEnvelope = {
  OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string } }
  response?: { header?: { resultCode?: string; resultMsg?: string }; body?: unknown }
}

/** 오류 안내에 넣을 데이터셋. 포털 오류는 '어느 데이터셋에서' 났는지가 원인을 가른다. */
export type Dataset = { name: string; id: string }

/**
 * 포털 오류 코드를 그대로 보여 주면 무슨 말인지 알 수 없어, 손댈 수 있는 안내로 바꾼다.
 *
 * `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 는 이름과 달리 '키가 틀렸다'만 뜻하지 않는다.
 * 키는 멀쩡한데 **그 데이터셋에 활용신청이 안 됐거나 아직 반영 전**일 때도 똑같이 온다.
 * 같은 키로 충전소(15076352)는 200, 주차장(15012896)은 이 코드로 403 이 나는 것을 확인했다
 * (인코딩 3종 × http/https 전부 동일 — 인코딩 문제가 아니었다). 그래서 '키를 다시 복사하라'고만
 * 하면 멀쩡한 키를 의심하게 만든다. 데이터셋을 짚고 두 가능성을 함께 말한다.
 */
function explain(raw: string, dataset: Dataset): string {
  const target = `${dataset.name}(${dataset.id})`
  if (/NOT_REGISTERED/i.test(raw)) {
    return (
      `이 인증키로 ${target}을(를) 쓸 수 없습니다. ` +
      `다른 데이터셋은 되는데 이것만 안 된다면 이 데이터셋의 활용신청이 빠졌거나 아직 반영 전입니다(승인 후 최대 1시간). ` +
      `data.go.kr 마이페이지 > 데이터활용 > Open API 에서 ${dataset.id} 신청 여부를 확인해 주세요. ` +
      `어느 데이터셋도 안 된다면 키 자체를 다시 복사해 주세요.`
    )
  }
  if (/SERVICE_ACCESS_DENIED|UNREGISTERED|NO_OPENAPI_SERVICE/i.test(raw)) {
    return `${target} 활용신청이 아직 승인되지 않았습니다. data.go.kr 에서 신청 상태를 확인해 주세요.`
  }
  if (/LIMITED_NUMBER|EXCEEDS/i.test(raw)) {
    return `${target} 오늘 호출 횟수를 다 썼습니다. 내일 다시 시도하거나 트래픽 증가를 신청해 주세요.`
  }
  if (/DEADLINE|EXPIRED/i.test(raw)) return `${target} 인증키 사용 기간이 만료됐습니다.`
  return `공공데이터포털이 ${target} 요청을 거부했습니다. (${raw})`
}

/**
 * 포털을 부르고 성공 응답만 돌려준다.
 * `serviceKey`는 encodeServiceKey 가 이미 인코딩해 두므로 URLSearchParams 에 넣지 않고
 * 직접 붙인다 — 넣으면 '%'가 다시 인코딩돼 이중 인코딩이 된다.
 *
 * 상태 코드보다 **본문의 오류 봉투를 먼저** 본다. 포털은 사유를 403 본문에 담아 보내므로,
 * 상태 코드만 보고 던지면 'HTTP 403' 만 남고 무엇을 고쳐야 하는지가 사라진다.
 */
export async function fetchDataGoKr<T>(
  baseUrl: string,
  params: Record<string, string>,
  source: string,
  dataset: Dataset,
): Promise<T> {
  const query = new URLSearchParams(params).toString()
  const url = `${baseUrl}?serviceKey=${encodeServiceKey(dataGoKrKey())}&${query}`

  const { status, ok, text } = await fetchUpstreamRaw(url, { source })

  let payload: T & ErrorEnvelope
  try {
    payload = JSON.parse(text) as T & ErrorEnvelope
  } catch {
    // 봉투조차 없으면 상태 코드로만 말할 수 있다 (점검 안내 HTML, 게이트웨이 XML 등)
    throw new UpstreamError(
      source,
      ok
        ? `${source} 응답을 해석하지 못했습니다. 점검 중일 수 있습니다.`
        : `${source}가 ${dataset.id} 요청에 HTTP ${status}를 돌려줬습니다.`,
    )
  }

  const gateway = payload.OpenAPI_ServiceResponse?.cmmMsgHeader
  if (gateway) {
    throw new UpstreamError(source, explain(gateway.errMsg ?? gateway.returnAuthMsg ?? '알 수 없는 오류', dataset))
  }

  const header = payload.response?.header
  // 표준데이터는 '00', 일부 서비스는 '0' 을 성공으로 쓴다
  if (header?.resultCode && !['00', '0'].includes(header.resultCode)) {
    throw new UpstreamError(source, explain(header.resultMsg ?? header.resultCode, dataset))
  }

  // 봉투에 오류가 없는데 상태만 실패인 경우
  if (!ok) throw new UpstreamError(source, `${source}가 ${dataset.id} 요청에 HTTP ${status}를 돌려줬습니다.`)

  return payload
}

/** 표준데이터는 items 를 배열로도, `{ item: [...] }` 로도 준다. 빈 결과는 아예 문자열이 오기도 한다. */
export function itemsOf<T>(body: unknown): T[] {
  const items = (body as { items?: unknown })?.items
  if (Array.isArray(items)) return items as T[]
  const inner = (items as { item?: unknown })?.item
  if (Array.isArray(inner)) return inner as T[]
  if (inner && typeof inner === 'object') return [inner as T]
  return []
}

/** '1,200' 같은 문자열도 숫자로 받는다. 값이 없거나 숫자가 아니면 null. */
export function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(String(raw).replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

export const text = (raw: unknown): string => (raw === null || raw === undefined ? '' : String(raw).trim())

/** 표준데이터의 Y/N 컬럼. 값이 비어 있으면 '모름'이라 null 로 남긴다. */
export const yesNo = (raw: unknown): boolean | null => {
  const value = text(raw).toUpperCase()
  return value === 'Y' ? true : value === 'N' ? false : null
}
