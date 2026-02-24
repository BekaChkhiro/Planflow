'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function ProjectMembersPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params['id'] as string

  useEffect(() => {
    router.replace(`/dashboard/projects/${projectId}?tab=team`)
  }, [projectId, router])

  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-muted-foreground">Redirecting...</span>
    </div>
  )
}
