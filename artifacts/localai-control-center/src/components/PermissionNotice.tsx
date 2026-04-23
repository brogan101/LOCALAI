import { ShieldAlert } from "lucide-react";
import type { AgentPermission } from "../api.js";
import { permissionLabel } from "../hooks/useAgentPermissions.js";

export function PermissionNotice({
  permission,
  className = "",
}: {
  permission: AgentPermission;
  className?: string;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${className}`}
      style={{
        background: "color-mix(in srgb, var(--color-warn) 10%, transparent)",
        color: "var(--color-warn)",
        border: "1px solid color-mix(in srgb, var(--color-warn) 24%, transparent)",
      }}>
      <ShieldAlert size={14} className="shrink-0 mt-0.5" />
      <span>{permissionLabel(permission)} is disabled. Enable it in Settings before running this action.</span>
    </div>
  );
}
