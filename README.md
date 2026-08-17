# YanghwaMap

내가 가본 맛집을 **구역별로 정리**하고 **카카오맵**에서 위치를 확인하는 개인용 웹앱.
백엔드 없이 브라우저 `localStorage`에만 저장하며, Vercel에 정적 배포한다.

## 기능

- **구역 필터** — 구(1단계) → 동(2단계) 칩 필터, 건수 표시
- **검색** — 상호 / 메뉴 / 메모 / 참조 / 주소 통합 검색
- **카카오맵 연동** — 장소 키워드 검색 한 번으로 주소·좌표·카카오맵 링크를 자동 입력
- **지도 화면** — 필터 결과를 마커로 표시, 마커 클릭 시 상세로 이동
- **항목별 정보** — 상호, 메뉴, 구/동, 주소, 추가 메모(간단 위치 요약), 참조, 방문 여부

## 시작하기

```bash
npm install
cp .env.example .env.local   # 카카오 앱 키 입력
npm run dev                  # http://localhost:5173
```

### 카카오맵 앱 키 발급 (지도·주소 찾기에 필요)

1. [카카오 개발자센터](https://developers.kakao.com) → **내 애플리케이션** → 앱 생성
2. **앱 키 → JavaScript 키**를 복사해 `.env.local`의 `VITE_KAKAO_MAP_APP_KEY`에 붙여넣기
3. **앱 설정 → 플랫폼 → Web**에 사이트 도메인을 등록
   - `http://localhost:5173`
   - 배포 도메인 (예: `https://yanghwa-map.vercel.app`)

> 도메인을 등록하지 않으면 SDK 로딩이 거부된다.
> 키가 없어도 목록·필터·메모 기능은 정상 동작하며, 지도 영역에만 안내 문구가 표시된다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 체크(`tsc -b`) + 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | oxlint |
| `npm run seed` | 엑셀 → `src/data/seed-restaurants.json` 재생성 |

> 원본 엑셀(`list_template/`)은 개인 데이터라 저장소에 포함하지 않는다.
> 변환 결과인 `src/data/seed-restaurants.json`만 커밋되므로 `npm run seed`는 로컬에
> 엑셀이 있을 때만 필요하다.

## 데이터

### 저장 위치

localStorage 키 `yanghwa-map/restaurants` (zustand `persist`, version 1).
저장된 값이 없으면 시드 47건으로 시작한다. 브라우저 데이터를 지우면 초기화된다.

### 엑셀 → 앱 필드 매핑

| 엑셀 열 | 앱 필드 | 비고 |
|---|---|---|
| 구역별(동) | `district` / `dong` / `areaRaw` | 서울 25개 구 이름으로 구를 추출, 원문도 보존 |
| 위치 | `memo` | 랜드마크 기반의 간단 위치 요약 |
| 상호 및 메뉴 | `name` / `menu` | `한촌설렁탕외 백반집` → 상호+메뉴로 분리 |
| 참 조 | `reference` | 영업시간·주차 등 |
| (없음) | `address` / `lat` / `lng` / `kakaoPlaceUrl` | 앱에서 **주소 찾기**로 채운다 |

원본 엑셀에는 도로명 주소가 없어 좌표가 비어 있다. 상세 화면의 **주소 찾기**에서 장소를
선택하면 주소·좌표·카카오맵 링크가 한 번에 채워지고 지도에 표시된다.

구 이름을 특정할 수 없던 3건(`천호사거리`, `양재동`, `경기도`)은 임의로 추정하지 않고
원문을 그대로 두었다 — 수정 화면에서 직접 정리하면 된다.

## 구조

```
src/
  components/   FilterBar, RestaurantCard, RestaurantForm, PlaceSearchModal, KakaoMap, Layout
  pages/        ListPage(/), MapPage(/map), NewPage(/new), DetailPage(/:id), EditPage(/:id/edit)
  store/        useRestaurantStore(persist), useFilterStore, selectors
  lib/kakao.ts  SDK 동적 로딩 + 장소 검색 래퍼
  data/         seed.ts, seed-restaurants.json
scripts/
  xlsx-to-seed.mjs   엑셀 파서 (외부 의존성 없음)
```

## 배포 (Vercel)

GitHub 저장소를 연결하면 자동 감지된다. 설정만 두 가지 확인:

- 환경 변수 `VITE_KAKAO_MAP_APP_KEY` 등록
- 배포 도메인을 카카오 개발자센터 Web 플랫폼에 추가

`vercel.json`에 SPA rewrite가 있어 `/map`, `/:id` 등으로 직접 접속해도 404가 나지 않는다.
