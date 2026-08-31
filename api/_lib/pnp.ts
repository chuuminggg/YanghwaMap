import { UpstreamError } from './upstream.js'

/**
 * 무공해차 통합누리집(ev.or.kr)의 pnp4web 보호 해제.
 *
 * 이 사이트는 본문을 통째로 base64 비슷한 형태로 감싸 보내고, 브라우저에서 `pnp4web.js` 가
 * 풀어 document.write 한다. 서버에서 읽으려면 같은 일을 해야 한다.
 *
 * 다만 원격 자바스크립트를 eval/vm 으로 실행하지는 않는다. pnp4web.js 안에 평문으로 들어 있는
 * '문자표'(치환된 base64 알파벳 7종)만 정규식으로 읽어 내고, 디코딩은 여기서 직접 한다.
 * 남의 코드를 우리 서버에서 돌리지 않으면서 같은 결과를 얻기 위해서다.
 *
 * 페이로드 앞 두 글자가 [문자표 번호][회전량]이고, 나머지가 그 문자표로 인코딩된 본문이다.
 */

const SOURCE = '무공해차 통합누리집'

const SCRIPT_PATTERN = /<script[^>]+name=['"]pnp4web['"][^>]+src=['"]([^'"]+)['"]/i
const PAYLOAD_PATTERN = /onload=['"][^'"]*_0xac\(["']?([A-Za-z0-9+/=]+)["']?\)/i
const PROTECTED_PATTERN = /<meta[^>]+name=['"]penc['"]/i

const fail = (message: string) => new UpstreamError(SOURCE, message)

/** 문자표 조각은 자바스크립트 문자열 리터럴이라 \x41 같은 이스케이프가 섞여 있다. */
const unescapeJs = (value: string) =>
  value
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

/**
 * pnp4web.js 에서 문자표 7종을 뽑는다.
 * 소스에는 조각 배열(`var In=[...]`)과 조각 번호 조합(`o0: In[3]+In[17]+...`)이 따로 있다.
 */
function parseAlphabets(source: string): string[] {
  const array = source.match(/var In=\[([\s\S]*?)\],zn=/) || source.match(/var In=Array\(([\s\S]*?)\),zn=/)
  if (!array) throw fail('보호 해제에 필요한 문자표를 찾지 못했습니다. 사이트 구조가 바뀐 것 같습니다.')

  const fragments = [...array[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) => unescapeJs(match[1]))
  if (fragments.length === 0) throw fail('보호 해제 문자표가 비어 있습니다.')

  const alphabets: string[] = []
  for (let index = 0; index <= 6; index++) {
    const expression = source.match(new RegExp(`o${index}:([^,}]+)`))
    if (!expression) throw fail(`보호 해제 문자표 o${index}를 찾지 못했습니다.`)

    const alphabet = [...expression[1].matchAll(/In\[(\d+)\]/g)]
      .map((match) => fragments[Number(match[1])])
      .join('')
    // base64 알파벳이므로 64자 미만이면 조각 번호를 잘못 읽은 것이다
    if (alphabet.length < 64) throw fail(`보호 해제 문자표 o${index}의 길이가 올바르지 않습니다.`)
    alphabets.push(alphabet)
  }
  return alphabets
}

/** 표준 base64와 같은 규칙이되 알파벳이 문자표를 회전시킨 것으로 바뀐다. */
function decodePayload(payload: string, alphabets: string[]): string {
  if (payload.length < 3) throw fail('보호된 본문이 비어 있습니다.')

  const base = alphabets[Number(payload[0])]
  const rotation = Number(payload[1])
  if (!base || !Number.isInteger(rotation)) throw fail('보호된 본문의 문자표 지정이 올바르지 않습니다.')

  const alphabet = base.slice(rotation) + base.slice(0, rotation)
  const encoded = payload.slice(2).replace(/[^A-Za-z0-9+/=]/g, '')
  const bytes: number[] = []

  for (let offset = 0; offset < encoded.length; ) {
    const a = alphabet.indexOf(encoded[offset++])
    const b = alphabet.indexOf(encoded[offset++])
    const c = alphabet.indexOf(encoded[offset++])
    const d = alphabet.indexOf(encoded[offset++])
    if (a < 0 || b < 0) break
    bytes.push((a << 2) | (b >> 4))
    // 64는 패딩(=) 자리다. 뒤쪽 바이트가 없다는 뜻이므로 거기서 끊는다.
    if (c >= 0 && c !== 64) {
      bytes.push(((b & 15) << 4) | (c >> 2))
      if (d >= 0 && d !== 64) bytes.push(((c & 3) << 6) | d)
    }
  }

  return Buffer.from(bytes).toString('utf8')
}

/**
 * pnp4web.js 는 200KB에 가깝고 배포마다 바뀌지 않는다.
 * 서버리스 인스턴스가 재사용되는 동안은 다시 받지 않는다 (db.ts 가 클라이언트를 재사용하는 것과 같은 이유).
 */
let cached: { url: string; source: string } | null = null

export const isProtected = (html: string) => PROTECTED_PATTERN.test(html)

/**
 * 보호된 껍데기 HTML을 원래 HTML로 되돌린다.
 * 보호되지 않은 응답(오류 페이지 등)은 그대로 돌려준다.
 */
export async function decodeProtectedHtml(
  html: string,
  baseUrl: string,
  fetchText: (url: string) => Promise<string>,
): Promise<string> {
  if (!isProtected(html)) return html

  const script = html.match(SCRIPT_PATTERN)
  if (!script) throw fail('보호 해제 스크립트 주소를 찾지 못했습니다.')
  const scriptUrl = new URL(script[1], baseUrl).toString()

  if (cached?.url !== scriptUrl) {
    cached = { url: scriptUrl, source: await fetchText(scriptUrl) }
  }

  const payload = html.match(PAYLOAD_PATTERN)
  if (!payload) throw fail('보호된 본문을 찾지 못했습니다.')

  return decodePayload(payload[1], parseAlphabets(cached.source))
}
