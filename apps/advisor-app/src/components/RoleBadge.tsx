const ROLE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  admin:          { bg: "bg-purple-100", text: "text-purple-800",  label: "Admin"          },
  advisor:        { bg: "bg-brand-100",  text: "text-brand-800",   label: "Advisor"        },
  senior_advisor: { bg: "bg-blue-100",   text: "text-blue-800",    label: "Senior Advisor" },
  compliance:     { bg: "bg-orange-100", text: "text-orange-800",  label: "Compliance"     },
  operations:     { bg: "bg-gray-100",   text: "text-gray-700",    label: "Operations"     },
};

const DEFAULT_STYLE = { bg: "bg-gray-100", text: "text-gray-700", label: "" };

interface RoleBadgeProps {
  role:       string | null;
  className?: string;
}

export function RoleBadge({ role, className = "" }: RoleBadgeProps) {
  if (!role) return null;
  const style = ROLE_STYLES[role] ?? { ...DEFAULT_STYLE, label: role };

  return (
    <span
      role="status"
      aria-label={`Role: ${style.label}`}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
        ${style.bg} ${style.text} ${className}`}
    >
      {style.label}
    </span>
  );
}
