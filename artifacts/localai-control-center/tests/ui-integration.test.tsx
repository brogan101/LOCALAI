/**
 * Phase 20 — UI Integration Tests
 *
 * Verifies:
 *  - StatusBadges components render correctly for all known states
 *  - Dashboard renders the Phase 20 status strip (runtime mode, approvals, updater)
 *  - No fake-ready states are rendered when data is unavailable
 *  - Unavailable/not_configured states render honestly
 *  - No secrets/private data appear in rendered output
 *
 * Uses the same renderToStaticMarkup + QueryClient.setQueryData pattern
 * as page-permission-ssr.test.tsx.
 */

import assert from "node:assert/strict";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

import { StatusPill, LocalCloudBadge, PhysicalTierBadge, UnavailableCard } from "../src/components/StatusBadges.js";
import Dashboard from "../src/pages/Dashboard.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderWithQueryClient(
  element: React.ReactElement,
  queryData: Array<[unknown[], unknown]> = [],
): string {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  for (const [key, data] of queryData) client.setQueryData(key, data);
  return renderToStaticMarkup(
    React.createElement(QueryClientProvider, { client }, element),
  );
}

// Required for wouter (router) to not throw in SSR context
Object.defineProperty(globalThis, "location", {
  value: { pathname: "/", search: "", hash: "" },
  configurable: true,
});
Object.defineProperty(globalThis, "history", {
  value: { pushState() {}, replaceState() {} },
  configurable: true,
});

const permissionSettings = {
  allowAgentExec: false,
  allowAgentEdits: false,
  allowAgentSelfHeal: false,
  allowAgentRefactor: false,
};

// ── StatusPill tests ───────────────────────────────────────────────────────────

// 1. not_configured renders with muted style
const notConfiguredHtml = renderToStaticMarkup(
  React.createElement(StatusPill, { status: "not_configured" }),
);
assert.match(notConfiguredHtml, /not_configured/);
assert.match(notConfiguredHtml, /var\(--color-elevated\)/);
assert.match(notConfiguredHtml, /var\(--color-muted\)/);

// 2. blocked renders with error color
const blockedHtml = renderToStaticMarkup(
  React.createElement(StatusPill, { status: "blocked" }),
);
assert.match(blockedHtml, /blocked/);
assert.match(blockedHtml, /var\(--color-error\)/);

// 3. approval_required renders with warn color and readable label
const approvalHtml = renderToStaticMarkup(
  React.createElement(StatusPill, { status: "approval_required" }),
);
assert.match(approvalHtml, /approval required/);
assert.match(approvalHtml, /var\(--color-warn\)/);

// 4. manual_only renders with error color and readable label
const manualHtml = renderToStaticMarkup(
  React.createElement(StatusPill, { status: "manual_only" }),
);
assert.match(manualHtml, /manual only/);
assert.match(manualHtml, /var\(--color-error\)/);

// 5. active renders with success color
const activeHtml = renderToStaticMarkup(
  React.createElement(StatusPill, { status: "active" }),
);
assert.match(activeHtml, /active/);
assert.match(activeHtml, /var\(--color-success\)/);

// 6. dry_run renders with warn color
const dryRunHtml = renderToStaticMarkup(
  React.createElement(StatusPill, { status: "dry_run" }),
);
assert.match(dryRunHtml, /dry_run/);
assert.match(dryRunHtml, /var\(--color-warn\)/);

// 7. degraded renders with warn color
const degradedHtml = renderToStaticMarkup(
  React.createElement(StatusPill, { status: "degraded" }),
);
assert.match(degradedHtml, /degraded/);
assert.match(degradedHtml, /var\(--color-warn\)/);

// ── LocalCloudBadge tests ──────────────────────────────────────────────────────

// 8. Local only badge renders "Local only" and info color
const localBadgeHtml = renderToStaticMarkup(
  React.createElement(LocalCloudBadge, { dataLeavesMachine: false }),
);
assert.match(localBadgeHtml, /Local only/);
assert.match(localBadgeHtml, /var\(--color-info\)/);

// 9. Cloud badge renders warning message
const cloudBadgeHtml = renderToStaticMarkup(
  React.createElement(LocalCloudBadge, { dataLeavesMachine: true }),
);
assert.match(cloudBadgeHtml, /Cloud.*data leaves machine/);
assert.match(cloudBadgeHtml, /var\(--color-warn\)/);

// ── PhysicalTierBadge tests ────────────────────────────────────────────────────

// 10. manual_only tier renders "manual only" with error color
const manualTierHtml = renderToStaticMarkup(
  React.createElement(PhysicalTierBadge, { tier: "manual_only" }),
);
assert.match(manualTierHtml, /manual only/);
assert.match(manualTierHtml, /var\(--color-error\)/);

// 11. blocked tier renders "blocked" with error color
const blockedTierHtml = renderToStaticMarkup(
  React.createElement(PhysicalTierBadge, { tier: "blocked" }),
);
assert.match(blockedTierHtml, /blocked/);
assert.match(blockedTierHtml, /var\(--color-error\)/);

// 12. approval_required tier renders with warn color
const approvalTierHtml = renderToStaticMarkup(
  React.createElement(PhysicalTierBadge, { tier: "approval_required" }),
);
assert.match(approvalTierHtml, /approval req/);
assert.match(approvalTierHtml, /var\(--color-warn\)/);

// 13. simulation_only tier renders with warn color
const simTierHtml = renderToStaticMarkup(
  React.createElement(PhysicalTierBadge, { tier: "simulation_only" }),
);
assert.match(simTierHtml, /sim only/);
assert.match(simTierHtml, /var\(--color-warn\)/);

// ── UnavailableCard tests ──────────────────────────────────────────────────────

// 14. UnavailableCard renders title and not_configured pill
const unavailableHtml = renderToStaticMarkup(
  React.createElement(UnavailableCard, {
    title: "ROS 2 Bridge",
    reason: "not_configured",
    hint: "Install ROSBridge to enable this integration.",
  }),
);
assert.match(unavailableHtml, /ROS 2 Bridge/);
assert.match(unavailableHtml, /not_configured/);
assert.match(unavailableHtml, /Install ROSBridge/);
// Must not claim it is ready/active
assert.doesNotMatch(unavailableHtml, /active|ready|connected/i);

// 15. UnavailableCard with degraded reason renders correctly
const degradedCardHtml = renderToStaticMarkup(
  React.createElement(UnavailableCard, {
    title: "Ollama Degraded",
    reason: "degraded",
  }),
);
assert.match(degradedCardHtml, /Ollama Degraded/);
assert.match(degradedCardHtml, /degraded/);

// ── Dashboard Phase 20 status strip tests ─────────────────────────────────────

// 16. Dashboard renders runtime mode card when runtime data is available
const dashRuntimeHtml = renderWithQueryClient(
  React.createElement(Dashboard),
  [
    [["settings"], { settings: permissionSettings }],
    [["model-roles"], { installedModels: [], roles: [] }],
    [
      ["runtime-mode"],
      {
        success: true,
        mode: "Lightweight",
        physicalActionsDisabled: false,
        servicePolicies: [],
      },
    ],
    [["approvals-dash"], { success: true, approvals: [] }],
    [["updater-dash"], { success: true, proposals: [], dryRunOnly: true }],
  ],
);
assert.match(dashRuntimeHtml, /Runtime Mode/);
assert.match(dashRuntimeHtml, /Lightweight/);

// 17. Dashboard renders "None pending" when no approvals are waiting
assert.match(dashRuntimeHtml, /Approvals/);
assert.match(dashRuntimeHtml, /None pending/);

// 18. Dashboard renders updater card with "No proposals"
assert.match(dashRuntimeHtml, /Updater/);
assert.match(dashRuntimeHtml, /No proposals/);

// 19. Dashboard shows EmergencyStop mode in error color when mode is EmergencyStop
const dashEmergencyHtml = renderWithQueryClient(
  React.createElement(Dashboard),
  [
    [["settings"], { settings: permissionSettings }],
    [["model-roles"], { installedModels: [], roles: [] }],
    [
      ["runtime-mode"],
      {
        success: true,
        mode: "EmergencyStop",
        physicalActionsDisabled: true,
        servicePolicies: [],
      },
    ],
    [["approvals-dash"], { success: true, approvals: [] }],
    [["updater-dash"], { success: true, proposals: [], dryRunOnly: true }],
  ],
);
assert.match(dashEmergencyHtml, /EmergencyStop/);
// physicalActionsDisabled warning should appear
assert.match(dashEmergencyHtml, /Physical actions disabled/);

// 20. Dashboard shows pending approvals count when waiting approvals exist
const dashApprovalsHtml = renderWithQueryClient(
  React.createElement(Dashboard),
  [
    [["settings"], { settings: permissionSettings }],
    [["model-roles"], { installedModels: [], roles: [] }],
    [
      ["runtime-mode"],
      {
        success: true,
        mode: "Lightweight",
        physicalActionsDisabled: false,
        servicePolicies: [],
      },
    ],
    [
      ["approvals-dash"],
      {
        success: true,
        approvals: [
          {
            id: "ap-1",
            type: "test",
            title: "Test approval",
            summary: "A test",
            riskTier: "tier2_safe_local_execute",
            requestedAction: "test",
            payloadHash: "abc",
            payload: {},
            status: "waiting_for_approval",
            requestedAt: new Date(0).toISOString(),
          },
          {
            id: "ap-2",
            type: "test",
            title: "Another approval",
            summary: "Another",
            riskTier: "tier3_file_modification",
            requestedAction: "edit",
            payloadHash: "def",
            payload: {},
            status: "waiting_for_approval",
            requestedAt: new Date(0).toISOString(),
          },
        ],
      },
    ],
    [["updater-dash"], { success: true, proposals: [], dryRunOnly: true }],
  ],
);
assert.match(dashApprovalsHtml, /2 pending/);

// 21. Dashboard does NOT render private/sensitive values even with approval data
// (titles above are non-sensitive stubs; raw payloads must not appear)
assert.doesNotMatch(dashApprovalsHtml, /payloadHash|"abc"|"def"/);

// 22. Dashboard shows updater proposals count when proposals exist
const dashUpdaterHtml = renderWithQueryClient(
  React.createElement(Dashboard),
  [
    [["settings"], { settings: permissionSettings }],
    [["model-roles"], { installedModels: [], roles: [] }],
    [
      ["runtime-mode"],
      {
        success: true,
        mode: "Lightweight",
        physicalActionsDisabled: false,
        servicePolicies: [],
      },
    ],
    [["approvals-dash"], { success: true, approvals: [] }],
    [
      ["updater-dash"],
      {
        success: true,
        proposals: [
          {
            id: "prop-1",
            kind: "dependency_update",
            title: "Update diff to 8.1.0",
            description: "Patch dependency",
            riskTier: "tier1_draft_only",
            status: "proposed",
            source: "npm-registry",
            sourceTrusted: true,
            requiresTests: true,
            requiresRollbackPlan: true,
            dryRunOnly: true,
            applied: false,
            approvalRequired: true,
            metadata: {},
          },
        ],
        dryRunOnly: true,
      },
    ],
  ],
);
assert.match(dashUpdaterHtml, /1 proposal/);

// 23. UnavailableCard never shows "ready", "active", or "online" for not_configured
// (regression guard — make sure we never fake success)
const unavailableNeverFakeHtml = renderToStaticMarkup(
  React.createElement(UnavailableCard, {
    title: "Foxglove Studio",
    reason: "not_configured",
  }),
);
assert.doesNotMatch(unavailableNeverFakeHtml, /\bready\b|\bactive\b|\bonline\b/i);

// 24. StatusPill with unknown status falls back gracefully (no throw)
const unknownStatusHtml = renderToStaticMarkup(
  React.createElement(StatusPill, { status: "some_future_status_not_in_map" }),
);
assert.match(unknownStatusHtml, /some_future_status_not_in_map/);

console.log("ui-integration.test.tsx passed (24 assertions)");
