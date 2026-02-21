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
  ShieldCheck,
  Eye,
  Edit3,
  Trash2,
  Clock,
  X,
  Loader2,
  Building2,
  Settings2,
  BarChart3,
} from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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

import {
  useOrganizations,
  useTeamMembers,
  useTeamInvitations,
  useInviteMember,
  useUpdateMemberRole,
  useRemoveMember,
  useRevokeInvitation,
  getRoleLabel,
  getRoleBadgeVariant,
  canManageMembers,
  canChangeRoles,
  getInitials,
  type TeamMember,
  type TeamInvitation,
  type MemberRole,
} from '@/hooks/use-team'
import { useAuth } from '@/hooks/use-auth'
import { RoleManagementDialog, RolePermissionsCard } from '@/components/team'

// Invite form schema
const inviteFormSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  role: z.enum(['admin', 'editor', 'viewer']),
})

type InviteFormData = z.infer<typeof inviteFormSchema>

// Role icon component
function RoleIcon({ role, className }: { role: MemberRole; className?: string }) {
  switch (role) {
    case 'owner':
      return <ShieldCheck className={className} />
    case 'admin':
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
  onManageRole,
  onRemove,
  isRemoving,
}: {
  member: TeamMember
  currentUserRole: MemberRole
  currentUserId: string
  onManageRole: (member: TeamMember) => void
  onRemove: (memberId: string) => void
  isRemoving: boolean
}) {
  const isCurrentUser = member.userId === currentUserId
  const canManage = canManageMembers(currentUserRole) && !isCurrentUser && member.role !== 'owner'
  const canChangeRole = canChangeRoles(currentUserRole) && member.role !== 'owner'

  return (
    <div className="flex items-center justify-between rounded-lg border bg-white p-4 transition-colors hover:bg-gray-50">
      <div className="flex items-center gap-4">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-blue-100 text-blue-700">
            {getInitials(member.userName, member.userEmail)}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">
              {member.userName || member.userEmail}
            </span>
            {isCurrentUser && (
              <Badge variant="outline" className="text-xs">You</Badge>
            )}
          </div>
          <span className="text-sm text-gray-500">{member.userEmail}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant={getRoleBadgeVariant(member.role)} className="flex items-center gap-1">
          <RoleIcon role={member.role} className="h-3 w-3" />
          {getRoleLabel(member.role)}
        </Badge>

        {(canManage || canChangeRole) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {canChangeRole && (
                <DropdownMenuItem
                  onClick={() => onManageRole(member)}
                  className="flex items-center gap-2"
                >
                  <Settings2 className="h-4 w-4" />
                  Manage Role
                </DropdownMenuItem>
              )}

              {canManage && (
                <>
                  {canChangeRole && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onClick={() => onRemove(member.id)}
                    disabled={isRemoving}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove from team
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

// Pending invitation card component
function InvitationCard({
  invitation,
  canManage,
  onRevoke,
  isRevoking,
}: {
  invitation: TeamInvitation
  canManage: boolean
  onRevoke: (invitationId: string) => void
  isRevoking: boolean
}) {
  const expiresAt = new Date(invitation.expiresAt)
  const isExpired = expiresAt < new Date()
  const daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
      <div className="flex items-center gap-4">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-gray-200 text-gray-500">
            <Mail className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700">{invitation.email}</span>
            <Badge variant="outline" className="text-xs">
              <Clock className="mr-1 h-3 w-3" />
              Pending
            </Badge>
          </div>
          <span className="text-sm text-gray-500">
            Invited by {invitation.inviterName}
            {!isExpired && daysUntilExpiry > 0 && (
              <span className="ml-2 text-gray-400">
                · Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
              </span>
            )}
            {isExpired && <span className="ml-2 text-red-500">· Expired</span>}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant={getRoleBadgeVariant(invitation.role)} className="flex items-center gap-1">
          <RoleIcon role={invitation.role} className="h-3 w-3" />
          {getRoleLabel(invitation.role)}
        </Badge>

        {canManage && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-red-600"
            onClick={() => onRevoke(invitation.id)}
            disabled={isRevoking}
          >
            {isRevoking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            <span className="sr-only">Revoke invitation</span>
          </Button>
        )}
      </div>
    </div>
  )
}

// Invite member dialog component
function InviteMemberDialog({
  organizationId,
  open,
  onOpenChange,
}: {
  organizationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const inviteMember = useInviteMember(organizationId)

  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: '',
      role: 'editor',
    },
  })

  const onSubmit = async (data: InviteFormData) => {
    try {
      await inviteMember.mutateAsync(data)
      form.reset()
      onOpenChange(false)
    } catch (error) {
      // Error handling is done by React Query
      console.error('Failed to invite member:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send an invitation to join your team. They&apos;ll receive an email with a link to
            accept.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input placeholder="colleague@company.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
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
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <div>
                            <div>Admin</div>
                            <div className="text-xs text-gray-500">
                              Can manage team and settings
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="editor">
                        <div className="flex items-center gap-2">
                          <Edit3 className="h-4 w-4" />
                          <div>
                            <div>Editor</div>
                            <div className="text-xs text-gray-500">Can edit projects and tasks</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="viewer">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          <div>
                            <div>Viewer</div>
                            <div className="text-xs text-gray-500">Can view projects only</div>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
  )
}

// Loading skeleton
function TeamPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-1 h-3 w-48" />
                </div>
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// Empty state
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-gray-100 p-4">
        <Building2 className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="mt-4 text-lg font-medium text-gray-900">No organizations yet</h3>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        You&apos;re not a member of any organizations. Create one to start collaborating with your
        team.
      </p>
      <Button className="mt-6">
        <Building2 className="mr-2 h-4 w-4" />
        Create Organization
      </Button>
    </div>
  )
}

// Main page component
export default function TeamPage() {
  const { user } = useAuth()
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null)
  const [memberToManageRole, setMemberToManageRole] = useState<TeamMember | null>(null)

  // Fetch organizations
  const { data: organizations, isLoading: orgsLoading, error: orgsError } = useOrganizations()

  // Auto-select first organization
  const currentOrgId = selectedOrgId || organizations?.[0]?.id
  const currentOrg = organizations?.find((org) => org.id === currentOrgId)

  // Fetch team data
  const { data: members, isLoading: membersLoading } = useTeamMembers(currentOrgId)
  const { data: invitations, isLoading: invitationsLoading } = useTeamInvitations(currentOrgId)

  // Mutations
  const updateRole = useUpdateMemberRole(currentOrgId || '')
  const removeMember = useRemoveMember(currentOrgId || '')
  const revokeInvitation = useRevokeInvitation(currentOrgId || '')

  // Current user's role in the organization
  const currentUserRole = currentOrg?.role || 'viewer'
  const canInvite = canManageMembers(currentUserRole)

  // Handle remove member
  const handleRemoveMember = async () => {
    if (!memberToRemove) return
    try {
      await removeMember.mutateAsync(memberToRemove.id)
      setMemberToRemove(null)
    } catch (error) {
      console.error('Failed to remove member:', error)
    }
  }

  // Loading state
  if (orgsLoading) {
    return <TeamPageSkeleton />
  }

  // Error state
  if (orgsError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-red-100 p-4">
          <Users className="h-8 w-8 text-red-600" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">Failed to load team</h3>
        <p className="mt-2 text-sm text-gray-500">
          There was an error loading your organizations. Please try again.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    )
  }

  // Empty state - no organizations
  if (!organizations || organizations.length === 0) {
    return <EmptyState />
  }

  const pendingInvitations = invitations?.filter((inv) => !inv.acceptedAt) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Team Members</h1>
          <p className="text-sm text-gray-500">
            Manage your team and control access to your projects
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Organization selector */}
          {organizations.length > 1 && (
            <Select value={currentOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger className="w-[200px]">
                <Building2 className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Workload button */}
          <Link href="/dashboard/team/workload">
            <Button variant="outline">
              <BarChart3 className="mr-2 h-4 w-4" />
              Workload
            </Button>
          </Link>

          {/* Invite button */}
          {canInvite && (
            <Button onClick={() => setInviteDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          )}
        </div>
      </div>

      {/* Organization info */}
      {currentOrg && organizations.length === 1 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">{currentOrg.name}</CardTitle>
                {currentOrg.description && (
                  <CardDescription>{currentOrg.description}</CardDescription>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Team Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Members
                {members && (
                  <Badge variant="secondary" className="ml-2">
                    {members.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>People with access to this organization</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div>
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="mt-1 h-3 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : members && members.length > 0 ? (
            <div className="space-y-3">
              {members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  currentUserRole={currentUserRole}
                  currentUserId={user?.id || ''}
                  onManageRole={(m) => setMemberToManageRole(m)}
                  onRemove={(memberId) => {
                    const m = members.find((m) => m.id === memberId)
                    if (m) setMemberToRemove(m)
                  }}
                  isRemoving={removeMember.isPending}
                />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500">No members found</div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invitations
              <Badge variant="secondary" className="ml-2">
                {pendingInvitations.length}
              </Badge>
            </CardTitle>
            <CardDescription>Invitations waiting to be accepted</CardDescription>
          </CardHeader>
          <CardContent>
            {invitationsLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {pendingInvitations.map((invitation) => (
                  <InvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    canManage={canInvite}
                    onRevoke={(invitationId) => revokeInvitation.mutate(invitationId)}
                    isRevoking={revokeInvitation.isPending}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite Member Dialog */}
      {currentOrgId && (
        <InviteMemberDialog
          organizationId={currentOrgId}
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
        />
      )}

      {/* Role Permissions Reference Card */}
      {canChangeRoles(currentUserRole) && (
        <RolePermissionsCard currentUserRole={currentUserRole} compact />
      )}

      {/* Role Management Dialog */}
      <RoleManagementDialog
        member={memberToManageRole}
        open={!!memberToManageRole}
        onOpenChange={(open) => !open && setMemberToManageRole(null)}
        onUpdateRole={(memberId, role) => {
          updateRole.mutate(
            { memberId, role },
            {
              onSuccess: () => setMemberToManageRole(null),
            }
          )
        }}
        isUpdating={updateRole.isPending}
      />

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <strong>{memberToRemove?.userName || memberToRemove?.userEmail}</strong> from the
              team? They will lose access to all organization projects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-red-600 hover:bg-red-700"
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove Member'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
