import { useQuery } from "@tanstack/react-query";
import api, { type AgentPermission } from "../api.js";

const PERMISSION_LABELS: Record<AgentPermission, string> = {
  allowAgentExec: "Agent execution",
  allowAgentEdits: "Agent edits",
  allowAgentSelfHeal: "Agent self-heal",
  allowAgentRefactor: "Agent refactors",
};

export function permissionLabel(permission: AgentPermission): string {
  return PERMISSION_LABELS[permission];
}

export function useAgentPermissions() {
  const settingsQ = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.get(),
    staleTime: 30_000,
  });
  const settings = settingsQ.data?.settings;
  return {
    isLoading: settingsQ.isLoading,
    settings,
    canEdit: settings?.allowAgentEdits !== false,
    canExec: settings?.allowAgentExec === true,
    canSelfHeal: settings?.allowAgentSelfHeal !== false,
    canRefactor: settings?.allowAgentRefactor !== false,
  };
}
