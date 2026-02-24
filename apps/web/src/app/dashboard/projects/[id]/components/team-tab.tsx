'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Users,
  UserPlus,
  MoreHorizontal,
  Mail,
  Shield,
  Edit3,
  Eye,
  Trash2,
  Clock,
  Loader2,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ValidatedInput } from '@/components/ui/validated-input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

import { useAuth } from '@/hooks/use-auth'
import {
  useProjectMembers,
  useProjectInvitations,
  useInviteProjectMember,
  useUpdateProjectMemberRole,
  useRemoveProjectMember,
  useRevokeProjectInvitation,
  getProjectRoleLabel,
  getProjectRoleBadgeVariant,
  canManageProjectMembers,
  getProjectMemberInitials,
  type ProjectMember,
  type ProjectInvitation,
  type ProjectMemberRole,
} from '@/hooks/use-project-members'

// Invite form schema
const inviteFormSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  role: z.enum(['editor', 'viewer']),
})

type InviteFormData = z.infer<typeof inviteFormSchema>

// Role icon component
function RoleIcon({ role, className }: { role: ProjectMemberRole; className?: string }) {
  switch (role) {
    case 'owner':
      return <Shield className={className} />
    case 'editor':
      return <Edit3 className={className} />
    case 'viewer':
      return <Eye className={className} />
  }
}

// Member card component
function MemberCard({
  member,
  currentUserRole,
  currentUserId,
  onUpdateRole,
  onRemove,
  isUpdating,
  isRemoving,
}: {
  member: ProjectMember
  currentUserRole: ProjectMemberRole
  currentUserId: string
  onUpdateRole: (memberId: string, role: 'editor' | 'viewer') => void
  onRemove: (memberId: string) => void
  isUpdating: boolean
  isRemoving: boolean
}) {
  const isCurrentUser = member.userId === currentUserId
  const canManage = canManageProjectMembers(currentUserRole) && !isCurrentUser && member.role !== 'owner'

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback>
            {getProjectMemberInitials(member.userName, member.userEmail)}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{member.userName || member.userEmail}</span>
            {isCurrentUser && (
              <Badge variant="outline" className="text-xs">
                You
              </Badge>
            )}
          </div>
          <span className="text-sm text-muted-foreground">{member.userEmail}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={getProjectRoleBadgeVariant(member.role)}>
          <RoleIcon role={member.role} className="mr-1 h-3 w-3" />
          {getProjectRoleLabel(member.role)}
        </Badge>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isUpdating || isRemoving}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Change Role</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onUpdateRole(member.id, 'editor')}
                disabled={member.role === 'editor'}
              >
                <Edit3 className="mr-2 h-4 w-4" />
                Editor
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onUpdateRole(member.id, 'viewer')}
                disabled={member.role === 'viewer'}
              >
                <Eye className="mr-2 h-4 w-4" />
                Viewer
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onRemove(member.id)}
                className="text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

// Invitation card component
function InvitationCard({
  invitation,
  onRevoke,
  isRevoking,
}: {
  invitation: ProjectInvitation
  onRevoke: (invitationId: string) => void
  isRevoking: boolean
}) {
  const expiresAt = new Date(invitation.expiresAt)
  const isExpired = expiresAt < new Date()
  const daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-muted">
            <Mail className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{invitation.email}</span>
            <Badge variant="outline" className="text-xs">
              <Clock className="mr-1 h-3 w-3" />
              {isExpired ? 'Expired' : `${daysUntilExpiry}d left`}
            </Badge>
          </div>
          <span className="text-sm text-muted-foreground">
            Invited by {invitation.inviterName || 'Unknown'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={getProjectRoleBadgeVariant(invitation.role)}>
          <RoleIcon role={invitation.role} className="mr-1 h-3 w-3" />
          {getProjectRoleLabel(invitation.role)}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-red-600"
          onClick={() => onRevoke(invitation.id)}
          disabled={isRevoking}
        >
          {isRevoking ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

export function TeamTab({ projectId }: { projectId: string }) {
  const { user } = useAuth()

  const { data: members, isLoading: membersLoading } = useProjectMembers(projectId)
  const { data: invitations, isLoading: invitationsLoading } = useProjectInvitations(projectId)

  const inviteMember = useInviteProjectMember(projectId)
  const updateMemberRole = useUpdateProjectMemberRole(projectId)
  const removeMember = useRemoveProjectMember(projectId)
  const revokeInvitation = useRevokeProjectInvitation(projectId)

  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null)

  const inviteForm = useForm<InviteFormData>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: '',
      role: 'editor',
    },
  })

  // Find current user's role in this project
  const currentUserMember = members?.find((m) => m.userId === user?.id)
  const currentUserRole: ProjectMemberRole = currentUserMember?.role || 'viewer'
  const canManage = canManageProjectMembers(currentUserRole)

  const handleInvite = async (data: InviteFormData) => {
    try {
      await inviteMember.mutateAsync(data)
      setShowInviteDialog(false)
      inviteForm.reset()
    } catch (err) {
      // Error is handled by the hook
    }
  }

  const handleUpdateRole = (memberId: string, role: 'editor' | 'viewer') => {
    updateMemberRole.mutate({ memberId, role })
  }

  const handleRemove = () => {
    if (memberToRemove) {
      removeMember.mutate(memberToRemove, {
        onSuccess: () => setMemberToRemove(null),
      })
    }
  }

  const handleRevokeInvitation = (invitationId: string) => {
    revokeInvitation.mutate(invitationId)
  }

  const isLoading = membersLoading || invitationsLoading

  if (isLoading) {
    return <TeamTabSkeleton />
  }

  const pendingInvitations = invitations?.filter((inv) => new Date(inv.expiresAt) > new Date()) || []

  return (
    <div className="space-y-6">
      {/* Header with Invite Button */}
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        </div>
      )}

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Members ({members?.length || 0})
          </CardTitle>
          <CardDescription>
            People who have access to this project
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!members || members.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">
              No members found
            </p>
          ) : (
            <div className="divide-y">
              {members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  currentUserRole={currentUserRole}
                  currentUserId={user?.id || ''}
                  onUpdateRole={handleUpdateRole}
                  onRemove={(memberId) => setMemberToRemove(memberId)}
                  isUpdating={updateMemberRole.isPending}
                  isRemoving={removeMember.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {canManage && pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invitations ({pendingInvitations.length})
            </CardTitle>
            <CardDescription>
              Invitations waiting to be accepted
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pendingInvitations.map((invitation) => (
                <InvitationCard
                  key={invitation.id}
                  invitation={invitation}
                  onRevoke={handleRevokeInvitation}
                  isRevoking={revokeInvitation.isPending}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role Permissions Info */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
          <CardDescription>
            What each role can do in this project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">Owner</h4>
                <p className="text-sm text-muted-foreground">
                  Full access to the project, can manage members, change settings, and delete the project
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/50">
                <Edit3 className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-medium">Editor</h4>
                <p className="text-sm text-muted-foreground">
                  Can view and edit tasks, add comments, and manage project content
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <Eye className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-medium">Viewer</h4>
                <p className="text-sm text-muted-foreground">
                  Read-only access to view tasks and project content
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Invite a team member to join this project. They must already be a member of your organization.
            </DialogDescription>
          </DialogHeader>
          <Form {...inviteForm}>
            <form onSubmit={inviteForm.handleSubmit(handleInvite)} className="space-y-4">
              <FormField
                control={inviteForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <ValidatedInput
                        placeholder="colleague@company.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={inviteForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="editor">
                          <div className="flex items-center gap-2">
                            <Edit3 className="h-4 w-4" />
                            Editor - Can edit tasks and content
                          </div>
                        </SelectItem>
                        <SelectItem value="viewer">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            Viewer - Read-only access
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowInviteDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={inviteMember.isPending}>
                  {inviteMember.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Invitation
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation */}
      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this member from the project? They will no longer have access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleRemove}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Loading skeleton for code splitting
export function TeamTabSkeleton() {
  return (
    <div className="space-y-6">
      {/* Invite Button Skeleton */}
      <div className="flex justify-end">
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Members Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Role Permissions Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
