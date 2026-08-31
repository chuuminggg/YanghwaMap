import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { apiDevPlugin } from './scripts/vite-api-plugin.ts'

/** 개발 서버의 /api 핸들러가 읽는 서버 전용 변수들 (클라이언트 번들에는 들어가지 않는다) */
const SERVER_ENV_KEYS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'APP_PASSWORD',
  'KAKAO_REST_API_KEY',
  // 운전 탭이 부르는 외부 기관 인증키. 없으면 해당 하위 탭만 안내 문구로 끝난다.
  'DATA_GO_KR_API_KEY',
  'OPINET_API_KEY',
  'EXDATA_API_KEY',
  'ITS_API_KEY',
]

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 세 번째 인자를 ''로 주면 VITE_ 접두사가 없는 변수도 읽는다
  const env = loadEnv(mode, process.cwd(), '')

  for (const key of SERVER_ENV_KEYS) {
    // 빈 값을 넣으면 process.env가 문자열 "undefined"로 만들어 버리므로 있을 때만 옮긴다.
    // 셸에서 직접 준 값이 .env.local 보다 우선한다.
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [react(), tailwindcss(), apiDevPlugin()],
  }
})
