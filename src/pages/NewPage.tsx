import { useNavigate } from 'react-router'
import { RestaurantForm } from '../components/RestaurantForm'
import { useRestaurantStore } from '../store/useRestaurantStore'

export function NewPage() {
  const navigate = useNavigate()
  const add = useRestaurantStore((s) => s.add)

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">맛집 추가</h1>
      <RestaurantForm
        submitLabel="저장"
        onSubmit={(draft) => navigate(`/${add(draft)}`, { replace: true })}
      />
    </div>
  )
}
