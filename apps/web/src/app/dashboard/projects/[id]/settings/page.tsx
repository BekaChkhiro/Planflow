'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Archive, ArchiveRestore, Users } from 'lucide-react'

import { useProject, useArchiveProject, useRestoreProject, useUpdateProject } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function ProjectSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params['id'] as string

  const { data: project, isLoading, error } = useProject(projectId)
  const archiveProject = useArchiveProject()
  const restoreProject = useRestoreProject()
  const updateProject = useUpdateProject()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const isArchived = !!project?.archivedAt

  // Initialize form when project loads
  if (project && !hasChanges && name === '' && description === '') {
    setName(project.name)
    setDescription(project.description || '')
  }

  const handleSave = async () => {
    if (!project) return
    try {
      await updateProject.mutateAsync({
        projectId,
        data: { name, description: description || null },
      })
      setHasChanges(false)
    } catch (err) {
      console.error('Failed to update project:', err)
    }
  }

  const handleArchive = async () => {
    try {
      await archiveProject.mutateAsync(projectId)
      router.push('/dashboard/projects')
    } catch (err) {
      console.error('Failed to archive project:', err)
    }
  }

  const handleRestore = async () => {
    try {
      await restoreProject.mutateAsync(projectId)
    } catch (err) {
      console.error('Failed to restore project:', err)
    }
  }

  const handleNameChange = (value: string) => {
    setName(value)
    setHasChanges(true)
  }

  const handleDescriptionChange = (value: string) => {
    setDescription(value)
    setHasChanges(true)
  }

  if (isLoading) {
    return (
      <div>
        <Skeleton className="mb-4 h-5 w-24" />
        <Skeleton className="mb-6 h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <h3 className="text-lg font-semibold text-foreground">Project not found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            The project you&apos;re looking for doesn&apos;t exist.
          </p>
          <Button className="mt-6" asChild>
            <Link href="/dashboard/projects">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Projects
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href={`/dashboard/projects/${projectId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Project
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Project Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your project settings and preferences.</p>
      </div>

      <div className="space-y-6">
        {/* Members Section */}
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Manage who has access to this project.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Project Members</p>
                  <p className="text-sm text-muted-foreground">
                    Invite team members and manage their roles
                  </p>
                </div>
              </div>
              <Button variant="outline" asChild>
                <Link href={`/dashboard/projects/${projectId}?tab=team`}>
                  Manage Members
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>Update your project name and description.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Project name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder="Project description (optional)"
                rows={3}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={!hasChanges || updateProject.isPending || !name.trim()}
              >
                {updateProject.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Archive/Restore Zone */}
        <Card className={isArchived ? 'border-amber-200' : 'border-red-200'}>
          <CardHeader>
            <CardTitle className={isArchived ? 'text-amber-600' : 'text-red-600'}>
              {isArchived ? 'Archived Project' : 'Danger Zone'}
            </CardTitle>
            <CardDescription>
              {isArchived
                ? 'This project is archived. You can restore it to make it active again.'
                : 'Actions that affect your project\'s availability.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isArchived ? (
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Restore Project</h4>
                  <p className="text-sm text-muted-foreground">
                    Restore this project to make it active again.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleRestore}
                  disabled={restoreProject.isPending}
                >
                  {restoreProject.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                      Restore Project
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Archive Project</h4>
                  <p className="text-sm text-muted-foreground">
                    Archive this project. You can restore it later from the archived projects list.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setShowArchiveDialog(true)}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive Project
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive &quot;{project.name}&quot;? The project will be
              moved to your archived projects and can be restored at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleArchive}
              disabled={archiveProject.isPending}
            >
              {archiveProject.isPending ? 'Archiving...' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
