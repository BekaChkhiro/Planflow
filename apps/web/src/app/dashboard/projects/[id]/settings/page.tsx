'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'

import { useProject, useDeleteProject, useUpdateProject } from '@/hooks/use-projects'
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
  const deleteProject = useDeleteProject()
  const updateProject = useUpdateProject()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

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

  const handleDelete = async () => {
    try {
      await deleteProject.mutateAsync(projectId)
      router.push('/dashboard/projects')
    } catch (err) {
      console.error('Failed to delete project:', err)
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
          <h3 className="text-lg font-semibold text-gray-900">Project not found</h3>
          <p className="mt-2 text-sm text-gray-500">
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
        <h1 className="text-2xl font-bold text-gray-900">Project Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your project settings and preferences.</p>
      </div>

      <div className="space-y-6">
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

        {/* Danger Zone */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible actions that affect your project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Delete Project</h4>
                <p className="text-sm text-muted-foreground">
                  Permanently delete this project and all its data.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Project
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{project.name}&quot;? This action cannot be
              undone and will permanently delete all project data including tasks and plans.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deleteProject.isPending}
            >
              {deleteProject.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
