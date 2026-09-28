import type { PropsWithChildren } from 'react'

export interface CollapsibleSectionProps extends PropsWithChildren {
  title: string
  defaultOpen?: boolean
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  return (
    <details className="parameter-section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="parameter-section__body">{children}</div>
    </details>
  )
}
