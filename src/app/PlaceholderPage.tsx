import { Card } from '../components/Card'
import { ScopePill } from '../components/ScopePill'

interface PlaceholderPageProps {
  title: string
  phase: string
  description: string
}

export function PlaceholderPage({ title, phase, description }: PlaceholderPageProps) {
  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <ScopePill />
          <h1>{title}</h1>
          <p>Coming in {phase}</p>
        </div>
      </div>
      <Card title="Not built yet">
        <p className="muted">{description}</p>
      </Card>
    </div>
  )
}
