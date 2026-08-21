import { Link, useNavigate, useParams } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { RestaurantForm } from '../components/RestaurantForm'
import { useRestaurantStore } from '../store/useRestaurantStore'
import { toDraft } from '../types/restaurant'

export function EditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const restaurant = useRestaurantStore((s) => s.restaurants.find((r) => r.id === id))
  const update = useRestaurantStore((s) => s.update)
  const remove = useRestaurantStore((s) => s.remove)

  if (!restaurant) {
    return (
      <div className="p-4">
        <EmptyState
          title="존재하지 않는 맛집입니다."
          description={
            <Link to="/" className="underline">
              목록으로 돌아가기
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">맛집 수정</h1>
      <RestaurantForm
        initial={toDraft(restaurant)}
        submitLabel="수정 저장"
        onSubmit={async (next) => {
          await update(restaurant.id, next)
          navigate(`/${restaurant.id}`, { replace: true })
        }}
        onDelete={async () => {
          if (!window.confirm(`'${restaurant.name}'을(를) 삭제할까요?`)) return
          await remove(restaurant.id)
          navigate('/', { replace: true })
        }}
      />
    </div>
  )
}
