"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

// SVG Illustration Components
export function ProjectsIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-32 w-32", className)}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background circles */}
      <circle cx="60" cy="60" r="55" fill="var(--illustration-bg)" />
      <circle cx="60" cy="60" r="40" fill="var(--illustration-bg-secondary)" />

      {/* Folder shape */}
      <path
        d="M35 45C35 42.239 37.239 40 40 40H52L58 46H80C82.761 46 85 48.239 85 51V75C85 77.761 82.761 80 80 80H40C37.239 80 35 77.761 35 75V45Z"
        fill="#3B82F6"
        fillOpacity="0.2"
      />
      <path
        d="M35 50C35 47.239 37.239 45 40 45H80C82.761 45 85 47.239 85 50V75C85 77.761 82.761 80 80 80H40C37.239 80 35 77.761 35 75V50Z"
        fill="#3B82F6"
      />

      {/* Plus sign */}
      <path
        d="M60 55V70M52.5 62.5H67.5"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Decorative dots */}
      <circle cx="25" cy="35" r="3" fill="#93C5FD" />
      <circle cx="95" cy="40" r="2" fill="#93C5FD" />
      <circle cx="90" cy="85" r="4" fill="#DBEAFE" />
    </svg>
  );
}

export function TasksIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-32 w-32", className)}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <circle cx="60" cy="60" r="55" fill="var(--illustration-bg)" />

      {/* Clipboard */}
      <rect x="35" y="30" width="50" height="65" rx="4" fill="white" stroke="var(--illustration-bg-secondary)" strokeWidth="2" />
      <rect x="45" y="25" width="30" height="10" rx="2" fill="#3B82F6" />

      {/* Task lines */}
      <rect x="42" y="45" width="8" height="8" rx="2" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5" />
      <path d="M44 49L47 52L52 46" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="55" y="47" width="24" height="4" rx="2" fill="var(--illustration-bg-secondary)" />

      <rect x="42" y="58" width="8" height="8" rx="2" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5" />
      <path d="M44 62L47 65L52 59" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="55" y="60" width="20" height="4" rx="2" fill="var(--illustration-bg-secondary)" />

      <rect x="42" y="71" width="8" height="8" rx="2" fill="white" stroke="var(--illustration-stroke)" strokeWidth="1.5" />
      <rect x="55" y="73" width="22" height="4" rx="2" fill="var(--illustration-bg-secondary)" />

      {/* Decorative elements */}
      <circle cx="95" cy="45" r="3" fill="#93C5FD" />
      <circle cx="25" cy="70" r="4" fill="#DBEAFE" />
    </svg>
  );
}

export function TeamIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-32 w-32", className)}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <circle cx="60" cy="60" r="55" fill="var(--illustration-bg)" />

      {/* Center person */}
      <circle cx="60" cy="45" r="12" fill="#3B82F6" />
      <path
        d="M40 80C40 68.954 49.954 60 60 60C70.046 60 80 68.954 80 80"
        stroke="#3B82F6"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />

      {/* Left person (smaller) */}
      <circle cx="32" cy="55" r="8" fill="#93C5FD" />
      <path
        d="M20 78C20 70.268 26.268 64 34 64"
        stroke="#93C5FD"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Right person (smaller) */}
      <circle cx="88" cy="55" r="8" fill="#93C5FD" />
      <path
        d="M86 64C93.732 64 100 70.268 100 78"
        stroke="#93C5FD"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Decorative dots */}
      <circle cx="60" cy="95" r="3" fill="#DBEAFE" />
      <circle cx="25" cy="35" r="2" fill="#93C5FD" />
      <circle cx="95" cy="35" r="2" fill="#93C5FD" />
    </svg>
  );
}

export function NotificationsIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-32 w-32", className)}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <circle cx="60" cy="60" r="55" fill="var(--illustration-bg)" />

      {/* Bell */}
      <path
        d="M60 30C60 30 45 35 45 55V70L40 75V78H80V75L75 70V55C75 35 60 30 60 30Z"
        fill="#3B82F6"
      />
      <circle cx="60" cy="85" r="6" fill="#3B82F6" />

      {/* Bell highlight */}
      <path
        d="M52 45C52 40 55 37 60 35"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* Check mark badge */}
      <circle cx="78" cy="40" r="12" fill="#22C55E" />
      <path
        d="M73 40L76 43L84 35"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Decorative elements */}
      <circle cx="30" cy="45" r="3" fill="#93C5FD" />
      <circle cx="90" cy="75" r="2" fill="#DBEAFE" />
    </svg>
  );
}

export function CommentsIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-24 w-24", className)}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <circle cx="50" cy="50" r="45" fill="var(--illustration-bg)" />

      {/* Main chat bubble */}
      <path
        d="M25 35C25 31.686 27.686 29 31 29H69C72.314 29 75 31.686 75 35V55C75 58.314 72.314 61 69 61H40L30 71V61H31C27.686 61 25 58.314 25 55V35Z"
        fill="#3B82F6"
      />

      {/* Chat lines */}
      <rect x="33" y="38" width="30" height="4" rx="2" fill="white" opacity="0.7" />
      <rect x="33" y="46" width="22" height="4" rx="2" fill="white" opacity="0.7" />

      {/* Decorative dot */}
      <circle cx="80" cy="30" r="3" fill="#93C5FD" />
    </svg>
  );
}

export function ActivityIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-32 w-32", className)}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <circle cx="60" cy="60" r="55" fill="var(--illustration-bg)" />

      {/* Activity pulse line */}
      <path
        d="M25 60H40L47 45L55 75L63 50L70 65L75 55H95"
        stroke="#3B82F6"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Circle dots on line */}
      <circle cx="47" cy="45" r="4" fill="#3B82F6" />
      <circle cx="55" cy="75" r="4" fill="#3B82F6" />
      <circle cx="63" cy="50" r="4" fill="#3B82F6" />

      {/* Decorative elements */}
      <circle cx="30" cy="35" r="3" fill="#93C5FD" />
      <circle cx="90" cy="85" r="4" fill="#DBEAFE" />
    </svg>
  );
}

export function TokensIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-32 w-32", className)}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <circle cx="60" cy="60" r="55" fill="var(--illustration-bg)" />

      {/* Key shape */}
      <circle cx="50" cy="50" r="15" fill="none" stroke="#3B82F6" strokeWidth="4" />
      <circle cx="50" cy="50" r="6" fill="#3B82F6" />
      <path
        d="M62 58L85 81"
        stroke="#3B82F6"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M75 71L80 66"
        stroke="#3B82F6"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M80 76L85 71"
        stroke="#3B82F6"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Lock icon small */}
      <rect x="70" y="35" width="16" height="12" rx="2" fill="#93C5FD" />
      <path
        d="M73 35V32C73 29.239 75.239 27 78 27C80.761 27 83 29.239 83 32V35"
        stroke="#93C5FD"
        strokeWidth="2"
        fill="none"
      />

      {/* Decorative */}
      <circle cx="30" cy="75" r="3" fill="#DBEAFE" />
    </svg>
  );
}

export function IntegrationsIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-32 w-32", className)}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <circle cx="60" cy="60" r="55" fill="var(--illustration-bg)" />

      {/* Center hub */}
      <circle cx="60" cy="60" r="15" fill="#3B82F6" />

      {/* Connection lines */}
      <line x1="60" y1="45" x2="60" y2="30" stroke="#93C5FD" strokeWidth="3" />
      <line x1="60" y1="75" x2="60" y2="90" stroke="#93C5FD" strokeWidth="3" />
      <line x1="45" y1="60" x2="30" y2="60" stroke="#93C5FD" strokeWidth="3" />
      <line x1="75" y1="60" x2="90" y2="60" stroke="#93C5FD" strokeWidth="3" />

      {/* Outer nodes */}
      <circle cx="60" cy="25" r="8" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="2" />
      <circle cx="60" cy="95" r="8" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="2" />
      <circle cx="25" cy="60" r="8" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="2" />
      <circle cx="95" cy="60" r="8" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="2" />

      {/* Center icon (plug) */}
      <path
        d="M55 55V65M65 55V65M57 58H63"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SearchIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-32 w-32", className)}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <circle cx="60" cy="60" r="55" fill="var(--illustration-bg)" />

      {/* Magnifying glass */}
      <circle cx="52" cy="52" r="20" fill="none" stroke="#3B82F6" strokeWidth="4" />
      <circle cx="52" cy="52" r="12" fill="#DBEAFE" />
      <line x1="67" y1="67" x2="85" y2="85" stroke="#3B82F6" strokeWidth="6" strokeLinecap="round" />

      {/* Question mark */}
      <path
        d="M49 47C49 44.5 50.5 43 53 43C55.5 43 57 44.5 57 47C57 49 55 50 53 51V54"
        stroke="#3B82F6"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="53" cy="58" r="1.5" fill="#3B82F6" />

      {/* Decorative */}
      <circle cx="85" cy="35" r="3" fill="#93C5FD" />
      <circle cx="30" cy="80" r="2" fill="#DBEAFE" />
    </svg>
  );
}

export function ErrorIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn("h-32 w-32", className)}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background */}
      <circle cx="60" cy="60" r="55" fill="#FEF2F2" />

      {/* Warning triangle */}
      <path
        d="M60 30L90 80H30L60 30Z"
        fill="#EF4444"
        stroke="#DC2626"
        strokeWidth="2"
      />

      {/* Exclamation */}
      <line x1="60" y1="45" x2="60" y2="60" stroke="white" strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="68" r="3" fill="white" />

      {/* Decorative */}
      <circle cx="30" cy="40" r="3" fill="#FECACA" />
      <circle cx="90" cy="45" r="2" fill="#FECACA" />
    </svg>
  );
}

// Type definitions
type IllustrationType =
  | "projects"
  | "tasks"
  | "team"
  | "notifications"
  | "comments"
  | "activity"
  | "tokens"
  | "integrations"
  | "search"
  | "error";

interface EmptyStateProps {
  illustration?: IllustrationType;
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "secondary";
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  size?: "sm" | "md" | "lg";
}

const illustrations: Record<IllustrationType, React.FC<{ className?: string }>> = {
  projects: ProjectsIllustration,
  tasks: TasksIllustration,
  team: TeamIllustration,
  notifications: NotificationsIllustration,
  comments: CommentsIllustration,
  activity: ActivityIllustration,
  tokens: TokensIllustration,
  integrations: IntegrationsIllustration,
  search: SearchIllustration,
  error: ErrorIllustration,
};

const sizeClasses = {
  sm: {
    container: "py-6",
    illustration: "h-20 w-20",
    title: "text-sm",
    description: "text-xs",
    spacing: "mt-3",
  },
  md: {
    container: "py-10",
    illustration: "h-28 w-28",
    title: "text-base",
    description: "text-sm",
    spacing: "mt-4",
  },
  lg: {
    container: "py-16",
    illustration: "h-36 w-36",
    title: "text-lg",
    description: "text-sm",
    spacing: "mt-5",
  },
};

export function EmptyState({
  illustration,
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "md",
}: EmptyStateProps) {
  const Illustration = illustration ? illustrations[illustration] : null;
  const sizeClass = sizeClasses[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        sizeClass.container,
        className
      )}
    >
      {Illustration ? (
        <Illustration className={sizeClass.illustration} />
      ) : Icon ? (
        <div className="rounded-full bg-muted p-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      ) : null}

      <h3
        className={cn(
          "font-semibold text-foreground",
          sizeClass.spacing,
          sizeClass.title
        )}
      >
        {title}
      </h3>

      {description && (
        <p
          className={cn(
            "mt-2 max-w-sm text-muted-foreground",
            sizeClass.description
          )}
        >
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-6 flex items-center gap-3">
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant || "default"}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant="ghost"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
