import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'

/**
 * `vite dev`는 /api 를 서비스하지 않으므로, 배포에서 Vercel이 실행할 핸들러 파일을
 * 개발 서버에서도 그대로 불러 쓰도록 이어 준다. 빌드에는 포함되지 않는다(apply: 'serve').
 */
const API_DIR = 'api'

type Route = { file: string; params: Record<string, string> }

/**
 * Vercel의 파일 기반 라우팅을 흉내낸다. 앞에서부터 먼저 맞는 것을 쓴다.
 *   /api/login             → api/login.ts
 *   /api/restaurants       → api/restaurants/index.ts
 *   /api/restaurants/{id}  → api/restaurants/[id].ts  (id는 query로)
 */
function resolveRoute(root: string, pathname: string): Route | null {
  const segments = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  if (segments.length === 0) return null

  const path = segments.join('/')
  const last = segments[segments.length - 1]
  const parent = segments.slice(0, -1).join('/')

  const candidates: Route[] = [
    { file: `${API_DIR}/${path}.ts`, params: {} },
    { file: `${API_DIR}/${path}/index.ts`, params: {} },
  ]
  if (parent) candidates.push({ file: `${API_DIR}/${parent}/[id].ts`, params: { id: last } })

  return candidates.find((candidate) => existsSync(resolve(root, candidate.file))) ?? null
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return undefined
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Vercel의 res.status()/json() 편의 메서드를 개발 서버의 Node 응답 객체에 붙인다. */
function shimResponse(res: ServerResponse) {
  const shimmed = res as ServerResponse & {
    status: (code: number) => typeof shimmed
    json: (body: unknown) => void
    send: (body: string) => void
  }
  shimmed.status = (code: number) => {
    shimmed.statusCode = code
    return shimmed
  }
  shimmed.json = (body: unknown) => {
    shimmed.setHeader('Content-Type', 'application/json; charset=utf-8')
    shimmed.end(JSON.stringify(body))
  }
  shimmed.send = (body: string) => shimmed.end(body)
  return shimmed
}

export function apiDevPlugin(): Plugin {
  return {
    name: 'yanghwa-api-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api')) return next()

        const route = resolveRoute(server.config.root, url.pathname)
        if (!route) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: `API 라우트를 찾을 수 없습니다: ${url.pathname}` }))
          return
        }

        try {
          const mod = await server.ssrLoadModule(`/${route.file}`)
          const handler = mod.default as (req: unknown, res: unknown) => unknown

          // Vercel이 채워 주는 필드를 흉내낸다
          Object.assign(req, {
            body: await readJsonBody(req),
            query: { ...Object.fromEntries(url.searchParams), ...route.params },
          })

          await handler(req, shimResponse(res))
        } catch (error) {
          server.ssrFixStacktrace(error as Error)
          console.error(error)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: '개발 서버에서 API 핸들러 실행에 실패했습니다.' }))
        }
      })
    },
  }
}
