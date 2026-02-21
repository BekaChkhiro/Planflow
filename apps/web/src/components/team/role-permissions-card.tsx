'use client'

import {
  ShieldCheck,
  Shield,
  Edit3,
  Eye,
  Check,
  X,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { MemberRole } from '@/hooks/use-team'

// Role definitions with permissions
export const ROLE_DEFINITIONS: {
  role: MemberRole
  label: string
  description: string
  icon: typeof ShieldCheck
  color: string
  bgColor: string
  permissions: {
    label: string
    allowed: boolean
  }[]
}[] = [
  {
    role: 'owner',
    label: 'Owner',
    description: 'Full control over the organization',
    icon: ShieldCheck,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    permissions: [
      { label: 'View all projects and tasks', allowed: true },
      { label: 'Edit projects and tasks', allowed: true },
      { label: 'Manage team members', allowed: true },
      { label: 'Change member roles', allowed: true },
      { label: 'Delete organization', allowed: true },
      { label: 'Manage billing', allowed: true },
    ],
  },
  {
    role: 'admin',
    label: 'Admin',
    description: 'Manage team and organization settings',
    icon: Shield,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    permissions: [
      { label: 'View all projects and tasks', allowed: true },
      { label: 'Edit projects and tasks', allowed: true },
      { label: 'Manage team members', allowed: true },
      { label: 'Change member roles', allowed: false },
      { label: 'Delete organization', allowed: false },
      { label: 'Manage billing', allowed: false },
    ],
  },
  {
    role: 'editor',
    label: 'Editor',
    description: 'Edit projects and tasks',
    icon: Edit3,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    permissions: [
      { label: 'View all projects and tasks', allowed: true },
      { label: 'Edit projects and tasks', allowed: true },
      { label: 'Manage team members', allowed: false },
      { label: 'Change member roles', allowed: false },
      { label: 'Delete organization', allowed: false },
      { label: 'Manage billing', allowed: false },
    ],
  },
  {
    role: 'viewer',
    label: 'Viewer',
    description: 'View-only access to projects',
    icon: Eye,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    permissions: [
      { label: 'View all projects and tasks', allowed: true },
      { label: 'Edit projects and tasks', allowed: false },
      { label: 'Manage team members', allowed: false },
      { label: 'Change member roles', allowed: false },
      { label: 'Delete organization', allowed: false },
      { label: 'Manage billing', allowed: false },
    ],
  },
]

export function getRoleDefinition(role: MemberRole) {
  return ROLE_DEFINITIONS.find((r) => r.role === role)!
}

interface RolePermissionsCardProps {
  currentUserRole?: MemberRole
  compact?: boolean
}

export function RolePermissionsCard({ currentUserRole, compact = false }: RolePermissionsCardProps) {
  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4" />
            Role Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ROLE_DEFINITIONS.map((roleDef) => {
              const Icon = roleDef.icon
              const isCurrentRole = currentUserRole === roleDef.role
              return (
                <TooltipProvider key={roleDef.role}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                          isCurrentRole
                            ? 'border-blue-200 bg-blue-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className={`rounded-full p-1.5 ${roleDef.bgColor}`}>
                          <Icon className={`h-4 w-4 ${roleDef.color}`} />
                        </div>
                        <span className="text-sm font-medium">{roleDef.label}</span>
                        {isCurrentRole && (
                          <Badge variant="secondary" className="text-xs">
                            You
                          </Badge>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p className="font-medium">{roleDef.label}</p>
                      <p className="text-xs text-gray-400">{roleDef.description}</p>
                      <div className="mt-2 space-y-1">
                        {roleDef.permissions.slice(0, 3).map((perm) => (
                          <div key={perm.label} className="flex items-center gap-1.5 text-xs">
                            {perm.allowed ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <X className="h-3 w-3 text-gray-400" />
                            )}
                            <span className={perm.allowed ? '' : 'text-gray-400'}>
                              {perm.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            })}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Role Permissions
        </CardTitle>
        <CardDescription>
          Understanding what each role can do in your organization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="pb-3 text-left text-sm font-medium text-gray-500">Permission</th>
                {ROLE_DEFINITIONS.map((roleDef) => {
                  const Icon = roleDef.icon
                  const isCurrentRole = currentUserRole === roleDef.role
                  return (
                    <th
                      key={roleDef.role}
                      className={`pb-3 text-center text-sm font-medium ${
                        isCurrentRole ? 'text-blue-600' : 'text-gray-500'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className={`rounded-full p-1 ${roleDef.bgColor}`}>
                          <Icon className={`h-3.5 w-3.5 ${roleDef.color}`} />
                        </div>
                        <span>{roleDef.label}</span>
                        {isCurrentRole && (
                          <Badge variant="outline" className="text-xs">
                            You
                          </Badge>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {(ROLE_DEFINITIONS[0]?.permissions ?? []).map((perm, permIndex) => (
                <tr key={perm.label} className="border-b last:border-0">
                  <td className="py-3 text-sm text-gray-700">{perm.label}</td>
                  {ROLE_DEFINITIONS.map((roleDef) => {
                    const permission = roleDef.permissions[permIndex]
                    return (
                      <td key={roleDef.role} className="py-3 text-center">
                        {permission?.allowed ? (
                          <Check className="mx-auto h-4 w-4 text-green-500" />
                        ) : (
                          <X className="mx-auto h-4 w-4 text-gray-300" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
