'use client'

import { Building2, ChevronDown, Check, Plus } from 'lucide-react'
import Link from 'next/link'
import { useOrganizationContext } from '@/hooks/use-organization-context'
import { getRoleBadgeVariant, getRoleLabel } from '@/hooks/use-team'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

interface OrganizationSelectorProps {
  className?: string
  showRole?: boolean
}

export function OrganizationSelector({ className, showRole = true }: OrganizationSelectorProps) {
  const {
    currentOrganization,
    organizations,
    setSelectedOrganization,
    isLoading,
  } = useOrganizationContext()

  if (isLoading) {
    return <Skeleton className="h-9 w-[180px]" />
  }

  if (!organizations || organizations.length === 0) {
    return (
      <Button variant="outline" size="sm" asChild className={className}>
        <Link href="/dashboard/team">
          <Plus className="mr-2 h-4 w-4" />
          Create Organization
        </Link>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={className}>
          <Building2 className="mr-2 h-4 w-4" />
          <span className="max-w-[120px] truncate">
            {currentOrganization?.name || 'Select Organization'}
          </span>
          {showRole && currentOrganization?.role && (
            <Badge
              variant={getRoleBadgeVariant(currentOrganization.role)}
              className="ml-2 text-xs"
            >
              {getRoleLabel(currentOrganization.role)}
            </Badge>
          )}
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[240px]">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => setSelectedOrganization(org.id)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="max-w-[140px] truncate">{org.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={getRoleBadgeVariant(org.role)} className="text-xs">
                {getRoleLabel(org.role)}
              </Badge>
              {org.id === currentOrganization?.id && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/team" className="flex items-center">
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
