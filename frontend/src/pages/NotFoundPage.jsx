// 404 fallback for unknown routes.
import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import EmptyState from '../components/common/EmptyState.jsx'
import Button from '../components/common/Button.jsx'

export default function NotFoundPage() {
  return (
    <div className="page-inner">
      <EmptyState
        icon={<Compass size={22} />}
        title="Page not found"
        hint="The page you asked for doesn't exist."
        action={<Link to="/"><Button variant="primary">Back to chat</Button></Link>}
      />
    </div>
  )
}
