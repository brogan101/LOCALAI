/**
 * INVENTORY EXECUTOR (executor #6)
 * =================================
 * Phase 24 / Stage 5. Wraps inventory-pipeline.ts with the executor framework.
 *
 * Modes:
 *   validate  — check item exists, quantity, availability
 *   dry_run   — simulate what action would be taken (reorder, label, etc.)
 *   execute   — create the action proposal record + approval, never physically acts
 *
 * Hard limits:
 *   - Physical purchasing is NEVER executed — always proposal-only
 *   - NFC writes require tier3 approval
 *   - Low-stock reorder generates proposals, not actual orders
 *   - Delete operations require tier3 approval
 *   - All physical actions return executed: false
 *
 * The inventory system is local SQLite only — no cloud provider is integrated.
 * All "executed" actions are records in the local DB, not real-world actions.
 */

import { logger } from "./logger.js";
import {
  registerExecutor,
  type ExecutorRunner,
  type ExecutorRunnerContext,
  type ExecutorRunnerResult,
} from "./approved-executor.js";
import {
  getInventoryItem,
  listInventoryItems,
  createInventoryItem,
  checkInventoryAvailability,
  proposeInventoryAction,
  createLowStockReorderSuggestions,
  requestInventoryItemDeletion,
  getInventoryStatus,
  type InventoryActionType,
} from "./inventory-pipeline.js";

export const INVENTORY_EXECUTOR_KIND = "inventory_sync";

export interface InventoryExecutorPayload {
  [key: string]: unknown;
  /** Action to perform */
  action: "check_availability" | "create_item" | "reorder_suggestions" | "propose_action" | "delete_item";
  /** Item ID for actions on a specific item */
  itemId?: string;
  /** Items to check availability for */
  checkItems?: Array<{ itemId?: string; name?: string; requiredQuantity?: number }>;
  /** For create_item */
  newItem?: {
    name: string;
    type?: string;
    quantity?: number;
    unit?: string;
    location?: string;
    notes?: string;
    minimumQuantity?: number;
    vendorUrl?: string;
  };
  /** For propose_action */
  actionType?: InventoryActionType;
  /** Label type for label_print */
  labelType?: "qr" | "nfc" | "both";
}

const inventoryRunner: ExecutorRunner = async (ctx: ExecutorRunnerContext): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as InventoryExecutorPayload;

  checkpoint("start");
  await appendVerification(`Inventory executor: action=${payload.action} mode=${mode}`);

  if (!payload.action) {
    return { success: false, executed: false, redactedSummary: "action required" };
  }

  // ── Check availability (all modes — read-only)
  if (payload.action === "check_availability") {
    const items = payload.checkItems ?? [];
    if (items.length === 0) {
      const allItems = listInventoryItems({ limit: 200 });
      const lowStock = allItems.filter(i => i.reorderThreshold != null && i.quantity != null && i.quantity < i.reorderThreshold);
      await appendVerification(`Full inventory check: ${allItems.length} items, ${lowStock.length} low-stock`);
      return {
        success: true,
        executed: false,
        result: { totalItems: allItems.length, lowStockCount: lowStock.length, lowStockItems: lowStock.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, minimum: i.reorderThreshold })) },
        redactedSummary: `Inventory: ${allItems.length} items tracked, ${lowStock.length} below minimum`,
      };
    }
    const checks = checkInventoryAvailability({ items });
    const allAvailable = checks.every(c => c.available);
    await appendVerification(`Availability check: ${checks.length} items, allAvailable=${allAvailable}`);
    return {
      success: true,
      executed: false,
      result: { checks, allAvailable },
      redactedSummary: allAvailable
        ? `All ${checks.length} item(s) available`
        : `${checks.filter(c => !c.available).length}/${checks.length} item(s) unavailable or short`,
    };
  }

  // ── Reorder suggestions (all modes — read-only)
  if (payload.action === "reorder_suggestions") {
    const suggestions = createLowStockReorderSuggestions();
    await appendVerification(`Reorder suggestions: ${suggestions.length} items below minimum`);
    return {
      success: true,
      executed: false,
      result: { suggestions, count: suggestions.length },
      redactedSummary: suggestions.length === 0
        ? "No items below minimum stock level"
        : `${suggestions.length} item(s) need reordering`,
    };
  }

  if (mode === "validate") {
    const status = getInventoryStatus();
    return {
      success: true,
      executed: false,
      result: { status, action: payload.action },
      redactedSummary: `Inventory validated: ${status.counts?.items ?? 0} items, ${status.providers?.length ?? 0} providers`,
    };
  }

  // ── Create item (dry_run returns preview; execute creates DB record)
  if (payload.action === "create_item") {
    if (!payload.newItem?.name) {
      return { success: false, executed: false, redactedSummary: "newItem.name required" };
    }
    if (mode === "dry_run") {
      return {
        success: true,
        executed: false,
        result: { wouldCreate: payload.newItem },
        redactedSummary: `Dry-run: would create item "${payload.newItem.name}"`,
      };
    }
    const created = createInventoryItem({
      name: payload.newItem.name,
      itemType: (payload.newItem.type as any) ?? "part",
      quantity: payload.newItem.quantity ?? 0,
      unit: payload.newItem.unit ?? "unit",
      location: payload.newItem.location,
      notes: payload.newItem.notes,
      reorderThreshold: (payload.newItem as any).minimumQuantity ?? (payload.newItem as any).reorderThreshold,
      supplierLink: (payload.newItem as any).vendorUrl ?? (payload.newItem as any).supplierLink,
    });
    await appendVerification(`Created inventory item: ${created.id} "${created.name}"`);
    return {
      success: true,
      executed: true,
      result: { item: created },
      redactedSummary: `Created inventory item "${created.name}" (${created.itemType})`,
    };
  }

  // ── Propose action (creates an approval-gated proposal record)
  if (payload.action === "propose_action") {
    if (!payload.itemId) return { success: false, executed: false, redactedSummary: "itemId required" };
    if (!payload.actionType) return { success: false, executed: false, redactedSummary: "actionType required" };

    const item = getInventoryItem(payload.itemId);
    if (!item) return { success: false, executed: false, redactedSummary: `Item ${payload.itemId} not found` };

    if (mode === "dry_run") {
      return {
        success: true,
        executed: false,
        result: { item: { id: item.id, name: item.name }, actionType: payload.actionType, wouldPropose: true },
        redactedSummary: `Dry-run: would propose ${payload.actionType} for "${item.name}"`,
      };
    }

    const proposal = proposeInventoryAction({
      itemIds: payload.itemId ? [payload.itemId] : [],
      actionType: payload.actionType,
    });
    await appendVerification(`Proposal created: ${proposal.status} — ${proposal.actionType}`);
    return {
      success: true,
      executed: true, // "executed" = DB record created, not physical action
      result: { proposal },
      redactedSummary: `Proposed ${payload.actionType} for "${item.name}" — status: ${proposal.status}`,
    };
  }

  // ── Delete item (requires approval)
  if (payload.action === "delete_item") {
    if (!payload.itemId) return { success: false, executed: false, redactedSummary: "itemId required" };
    const item = getInventoryItem(payload.itemId);
    if (!item) return { success: false, executed: false, redactedSummary: `Item ${payload.itemId} not found` };

    if (mode === "dry_run") {
      return {
        success: true,
        executed: false,
        result: { item: { id: item.id, name: item.name }, wouldDelete: true },
        redactedSummary: `Dry-run: would request deletion of "${item.name}"`,
      };
    }

    const proposal = requestInventoryItemDeletion(payload.itemId, request.approvalId);
    await appendVerification(`Deletion proposal: ${proposal.status}`);
    return {
      success: true,
      executed: false, // Physical delete requires separate approval
      result: { proposal },
      redactedSummary: `Deletion proposal created for "${item.name}" — status: ${proposal.status}`,
    };
  }

  return { success: false, executed: false, redactedSummary: `Unknown inventory action: ${payload.action}` };
};

let registered = false;
export function ensureInventoryExecutorRegistered(): void {
  if (registered) return;
  registerExecutor(INVENTORY_EXECUTOR_KIND, inventoryRunner);
  registered = true;
  logger.info("inventory-executor: registered");
}
