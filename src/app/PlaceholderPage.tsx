import { Card } from '../components/Card'

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
