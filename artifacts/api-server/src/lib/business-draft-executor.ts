/**
 * BUSINESS DRAFT EXECUTOR (executor #8)
 * =======================================
 * Wraps proposeBusinessDraftSend with the approved-executor framework.
 * When an adapter IS configured (email/slack/webhook), this executor
 * can actually send after approval. Currently logs proof bundle.
 *
 * Adapters: email (SMTP), slack (webhook URL), webhook (generic HTTP POST)
 * All external sends require tier3 approval + adapter credentials in settings.
 */

import { logger } from "./logger.js";
import {
  registerExecutor,
  redact,
  type ExecutorRunner,
  type ExecutorRunnerResult,
} from "./approved-executor.js";
import {
  proposeBusinessDraftSend,
  getBusinessDraft,
  listBusinessAdapters,
} from "./business-modules.js";

export const BUSINESS_DRAFT_EXECUTOR_KIND = "business_draft_send";

export interface BusinessDraftPayload {
  draftId: string;
}

const businessDraftRunner: ExecutorRunner = async (ctx): Promise<ExecutorRunnerResult> => {
  const { request, checkpoint, appendVerification } = ctx;
  const mode = request.mode ?? "dry_run";
  const payload = request.payload as unknown as BusinessDraftPayload;

  if (!payload.draftId) {
    return { success: false, executed: false, redactedSummary: "draftId required" };
  }

  checkpoint("validate");
  const draft = getBusinessDraft(payload.draftId);
  if (!draft) {
    return { success: false, executed: false, redactedSummary: `Draft ${payload.draftId} not found` };
  }

  const adapters = listBusinessAdapters();
  const adapter = adapters.find(a => a.id === draft.adapterId);
  await appendVerification(`Draft: ${draft.id} adapter: ${adapter?.name ?? "unknown"} status: ${adapter?.status ?? "not_found"}`);

  if (mode === "validate") {
    return {
      success: true,
      executed: false,
      result: {
        draftId: draft.id,
        adapterStatus: adapter?.status ?? "not_configured",
        adapterName: adapter?.name,
        subject: redact((draft as any).subject ?? "", 100),
        recipientCount: ((draft as any).recipients as unknown[] | undefined)?.length ?? 0,
      },
      redactedSummary: `Draft validated: adapter ${adapter?.name ?? "none"} is ${adapter?.status ?? "not_configured"}`,
    };
  }

  if (mode === "dry_run") {
    return {
      success: true,
      executed: false,
      result: {
        wouldSend: adapter?.status === "configured",
        draftId: draft.id,
        adapterStatus: adapter?.status ?? "not_configured",
      },
      redactedSummary: adapter?.status === "configured"
        ? `Dry-run: would send via ${adapter.name}`
        : `Dry-run: adapter ${adapter?.name ?? draft.adapterId} is ${adapter?.status ?? "not_configured"} — configure it in Settings`,
    };
  }

  if (mode === "execute") {
    if (!adapter || adapter.status !== "configured") {
      return {
        success: false,
        executed: false,
        redactedSummary: `Adapter ${adapter?.name ?? draft.adapterId} is not configured. Add credentials in Settings → Integrations.`,
      };
    }

    // Delegate to the lib which verifies the approval and records the audit trail
    const result = proposeBusinessDraftSend(draft.id, request.approvalId);
    await appendVerification(`proposeBusinessDraftSend result: status=${result.status} executed=${result.executed}`);

    return {
      success: result.success,
      executed: result.executed ?? false,
      result: { status: result.status, message: redact(result.message ?? "", 300) },
      redactedSummary: redact(result.message ?? `Business draft ${result.status}`, 200),
    };
  }

  return { success: false, executed: false, redactedSummary: `Unknown mode: ${mode}` };
};

let registered = false;
export function ensureBusinessDraftExecutorRegistered(): void {
  if (registered) return;
  registerExecutor(BUSINESS_DRAFT_EXECUTOR_KIND, businessDraftRunner);
  registered = true;
  logger.info("business-draft-executor: registered");
}
