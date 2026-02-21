'use client'

import { useState } from 'react'
import {
  ShieldCheck,
  Shield,
  Edit3,
  Eye,
  Check,
  X,
  Loader2,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { TeamMember, MemberRole } from '@/hooks/use-team'
import { getInitials, getRoleLabel } from '@/hooks/use-team'
import { ROLE_DEFINITIONS, getRoleDefinition } from './role-permissions-card'

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

interface RoleManagementDialogProps {
  member: TeamMember | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdateRole: (memberId: string, role: MemberRole) => void
  isUpdating: boolean
}

export function RoleManagementDialog({
  member,
  open,
  onOpenChange,
  onUpdateRole,
  isUpdating,
}: RoleManagementDialogProps) {
  const [selectedRole, setSelectedRole] = useState<MemberRole | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)

  // Reset state when dialog opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedRole(null)
      setShowConfirmation(false)
    }
    onOpenChange(newOpen)
  }

  // When member changes, reset selected role
  if (member && selectedRole === null) {
    // Don't auto-set; let user choose
  }

  const currentRoleDef = member ? getRoleDefinition(member.role) : null
  const selectedRoleDef = selectedRole ? getRoleDefinition(selectedRole) : null

  const handleRoleSelect = (role: MemberRole) => {
    setSelectedRole(role)
    setShowConfirmation(false)
  }

  const handleContinue = () => {
    if (selectedRole && selectedRole !== member?.role) {
      setShowConfirmation(true)
    }
  }

  const handleConfirm = () => {
    if (member && selectedRole) {
      onUpdateRole(member.id, selectedRole)
    }
  }

  // Determine if this is a promotion or demotion
  const getRoleLevel = (role: MemberRole): number => {
    const levels: Record<MemberRole, number> = { owner: 4, admin: 3, editor: 2, viewer: 1 }
    return levels[role]
  }

  const isPromotion =
    member && selectedRole ? getRoleLevel(selectedRole) > getRoleLevel(member.role) : false
  const isDemotion =
    member && selectedRole ? getRoleLevel(selectedRole) < getRoleLevel(member.role) : false

  // Available roles (exclude owner since it can't be assigned)
  const availableRoles = ROLE_DEFINITIONS.filter((r) => r.role !== 'owner')

  if (!member) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Manage Role</DialogTitle>
          <DialogDescription>
            Change the role and permissions for this team member
          </DialogDescription>
        </DialogHeader>

        {/* Member info */}
        <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-blue-100 text-blue-700">
              {getInitials(member.userName, member.userEmail)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="font-medium text-gray-900">
              {member.userName || member.userEmail}
            </div>
            <div className="text-sm text-gray-500">{member.userEmail}</div>
          </div>
          <Badge
            variant={
              currentRoleDef?.role === 'owner'
                ? 'default'
                : currentRoleDef?.role === 'admin'
                  ? 'secondary'
                  : 'outline'
            }
            className="flex items-center gap-1"
          >
            <RoleIcon role={member.role} className="h-3 w-3" />
            {getRoleLabel(member.role)}
          </Badge>
        </div>

        {!showConfirmation ? (
          <>
            {/* Role selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select new role</Label>
              <RadioGroup
                value={selectedRole || ''}
                onValueChange={(value) => handleRoleSelect(value as MemberRole)}
                className="space-y-2"
              >
                {availableRoles.map((roleDef) => {
                  const Icon = roleDef.icon
                  const isCurrentRole = roleDef.role === member.role
                  const isSelected = roleDef.role === selectedRole

                  return (
                    <div
                      key={roleDef.role}
                      className={`relative flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : isCurrentRole
                            ? 'border-gray-300 bg-gray-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      onClick={() => !isCurrentRole && handleRoleSelect(roleDef.role)}
                    >
                      <RadioGroupItem
                        value={roleDef.role}
                        id={roleDef.role}
                        disabled={isCurrentRole}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className={`rounded-full p-1 ${roleDef.bgColor}`}>
                            <Icon className={`h-4 w-4 ${roleDef.color}`} />
                          </div>
                          <Label
                            htmlFor={roleDef.role}
                            className={`cursor-pointer font-medium ${
                              isCurrentRole ? 'text-gray-400' : ''
                            }`}
                          >
                            {roleDef.label}
                          </Label>
                          {isCurrentRole && (
                            <Badge variant="outline" className="text-xs">
                              Current
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{roleDef.description}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {roleDef.permissions
                            .filter((p) => p.allowed)
                            .slice(0, 3)
                            .map((perm) => (
                              <span
                                key={perm.label}
                                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                              >
                                <Check className="h-3 w-3 text-green-500" />
                                {perm.label}
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </RadioGroup>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleContinue}
                disabled={!selectedRole || selectedRole === member.role}
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Confirmation view */}
            <div className="space-y-4">
              {/* Role change visualization */}
              <div className="flex items-center justify-center gap-4 rounded-lg bg-gray-50 py-6">
                <div className="flex flex-col items-center gap-1">
                  <div className={`rounded-full p-2 ${currentRoleDef?.bgColor}`}>
                    <RoleIcon role={member.role} className={`h-5 w-5 ${currentRoleDef?.color}`} />
                  </div>
                  <span className="text-sm font-medium">{getRoleLabel(member.role)}</span>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
                <div className="flex flex-col items-center gap-1">
                  <div className={`rounded-full p-2 ${selectedRoleDef?.bgColor}`}>
                    <RoleIcon
                      role={selectedRole!}
                      className={`h-5 w-5 ${selectedRoleDef?.color}`}
                    />
                  </div>
                  <span className="text-sm font-medium">{getRoleLabel(selectedRole!)}</span>
                </div>
              </div>

              {/* Warning for demotion */}
              {isDemotion && (
                <Alert variant="destructive" className="border-amber-200 bg-amber-50 text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This will reduce {member.userName || 'this member'}&apos;s permissions. They
                    will lose access to some features.
                  </AlertDescription>
                </Alert>
              )}

              {/* Permission changes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Permission changes</Label>
                <div className="rounded-lg border divide-y">
                  {selectedRoleDef?.permissions.map((newPerm, index) => {
                    const oldPerm = currentRoleDef?.permissions[index]
                    const changed = oldPerm?.allowed !== newPerm.allowed

                    if (!changed) return null

                    return (
                      <div
                        key={newPerm.label}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span className="text-gray-700">{newPerm.label}</span>
                        <div className="flex items-center gap-2">
                          {oldPerm?.allowed ? (
                            <span className="flex items-center gap-1 text-red-600">
                              <X className="h-3.5 w-3.5" />
                              Removed
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-green-600">
                              <Check className="h-3.5 w-3.5" />
                              Added
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmation(false)}>
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isUpdating}
                variant={isDemotion ? 'destructive' : 'default'}
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Confirm Change
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
