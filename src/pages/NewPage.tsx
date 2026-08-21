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
        // id는 서버가 만들어 돌려준다. 실패하면 폼이 오류를 표시하고 그대로 머문다.
        onSubmit={async (draft) => navigate(`/${await add(draft)}`, { replace: true })}
      />
    </div>
  )
}
