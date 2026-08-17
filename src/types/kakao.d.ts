/**
 * Kakao Maps JS SDK 중 이 앱이 실제로 쓰는 부분만 최소 선언.
 * 전체 타입이 필요해지면 @types/kakao.maps.d.ts 도입을 고려한다.
 */
export {}

declare global {
  namespace kakao.maps {
    class LatLng {
      constructor(lat: number, lng: number)
      getLat(): number
      getLng(): number
    }

    class LatLngBounds {
      extend(latlng: LatLng): void
      isEmpty(): boolean
    }

    class Map {
      constructor(container: HTMLElement, options: { center: LatLng; level?: number })
      setCenter(latlng: LatLng): void
      setLevel(level: number): void
      setBounds(bounds: LatLngBounds, ...paddings: number[]): void
      relayout(): void
    }

    class Marker {
      constructor(options: { position: LatLng; map?: Map; title?: string })
      setMap(map: Map | null): void
      getPosition(): LatLng
    }

    class InfoWindow {
      constructor(options: { content: string | HTMLElement; removable?: boolean })
      open(map: Map, marker: Marker): void
      close(): void
    }

    namespace event {
      function addListener(target: unknown, type: string, handler: () => void): void
    }

    namespace services {
      /** keywordSearch 응답 항목 (필요한 필드만) */
      type PlaceResult = {
        id: string
        place_name: string
        address_name: string
        road_address_name: string
        category_name: string
        category_group_name: string
        phone: string
        place_url: string
        /** 경도 */
        x: string
        /** 위도 */
        y: string
      }

      /** SDK는 문자열 상수로 status를 넘긴다 */
      const Status: { OK: string; ZERO_RESULT: string; ERROR: string }

      class Places {
        keywordSearch(
          keyword: string,
          callback: (data: PlaceResult[], status: string) => void,
          options?: { size?: number; page?: number },
        ): void
      }
    }

    function load(callback: () => void): void
  }

  interface Window {
    kakao?: { maps: typeof kakao.maps }
  }
}
