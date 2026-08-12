import type { ReactNode } from 'react'

export function EmptyState({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-stone-600">{title}</p>
      {description && <p className="mt-1 text-sm text-stone-400">{description}</p>}
    </div>
  )
}
