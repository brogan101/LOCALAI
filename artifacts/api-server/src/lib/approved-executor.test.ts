/**
 * approved-executor.test.ts — Phase 24 framework tests
 *
 * Covers:
 *   - Executor registration and listing
 *   - Preflight rejects unknown executor kinds
 *   - Preflight rejects missing approval (for execute mode)
 *   - Preflight rejects payload-hash mismatch
 *   - Validate mode skips approval check
 *   - Emergency stop blocks all execution
 *   - Redaction strips secrets and PII
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  registerExecutor,
  listRegisteredExecutors,
  executeApproved,
  isEmergencyStopActive,
  activateEmergencyStop,
  clearEmergencyStop,
  redact,
  type ExecutorRunner,
} from "../lib/approved-executor.js";
import { createApprovalRequest, approveRequest } from "../lib/approval-queue.js";

const TEST_KIND = "test_executor_kind_12345";

const noopRunner: ExecutorRunner = async () => ({
  success: true,
  executed: true,
  exitCode: 0,
  redactedSummary: "Test executor noop completed",
});

describe("approved-executor: registration", () => {
  it("registers and lists executors", () => {
    registerExecutor(TEST_KIND, noopRunner);
    expect(listRegisteredExecutors()).toContain(TEST_KIND);
  });
});

describe("approved-executor: preflight blocks", () => {
  beforeEach(() => {
    registerExecutor(TEST_KIND, noopRunner);
    if (isEmergencyStopActive()) clearEmergencyStop("test reset");
  });

  it("rejects unknown executor kind", async () => {
    const result = await executeApproved({
      executorKind: "nonexistent_kind_zzz",
      approvalId: "fake",
      requestedAction: "n/a",
      payload: {},
      mode: "execute",
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("No runner registered");
  });

  it("rejects missing approval in execute mode", async () => {
    const result = await executeApproved({
      executorKind: TEST_KIND,
      approvalId: "approval_does_not_exist",
      requestedAction: "test",
      payload: { key: "value" },
      mode: "execute",
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/Approval not found|Approval status/);
  });

  it("validate mode skips approval check", async () => {
    const result = await executeApproved({
      executorKind: TEST_KIND,
      approvalId: "",
      requestedAction: "static check",
      payload: {},
      mode: "validate",
      skipRuntimeModeCheck: true,
    });
    expect(result.blocked).toBe(false);
    expect(result.success).toBe(true);
  });

  it("rejects payload-hash mismatch in execute mode", async () => {
    const truePayload = { command: "Get-Service" };
    const approval = createApprovalRequest({
      type: TEST_KIND,
      title: "Hash mismatch test",
      summary: "test",
      riskTier: "tier2_safe_local_execute",
      requestedAction: "Run safe command",
      payload: truePayload,
    });
    approveRequest(approval.id, "auto-approved for test");

    // Execute with DIFFERENT payload than what was approved
    const result = await executeApproved({
      executorKind: TEST_KIND,
      approvalId: approval.id,
      requestedAction: "Run safe command",
      payload: { command: "DIFFERENT_COMMAND" },
      mode: "execute",
      skipRuntimeModeCheck: true,
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/payload hash mismatch/i);
  });
});

describe("approved-executor: emergency stop", () => {
  beforeEach(() => {
    registerExecutor(TEST_KIND, noopRunner);
    clearEmergencyStop("test reset");
  });
  afterEach(() => {
    clearEmergencyStop("test cleanup");
  });

  it("blocks all execution when activated", async () => {
    activateEmergencyStop("integration test");
    expect(isEmergencyStopActive()).toBe(true);

    const result = await executeApproved({
      executorKind: TEST_KIND,
      approvalId: "",
      requestedAction: "should be blocked",
      payload: {},
      mode: "validate",
      skipRuntimeModeCheck: true,
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("Emergency stop");
  });

  it("clears state correctly", () => {
    activateEmergencyStop("first");
    expect(isEmergencyStopActive()).toBe(true);
    clearEmergencyStop("undo");
    expect(isEmergencyStopActive()).toBe(false);
  });
});

describe("approved-executor: redaction", () => {
  it("redacts GitHub tokens", () => {
    const input = "ghp_1234567890ABCDEFghijklmnopqrstuvwxyz1234";
    const out = redact(input);
    expect(out).toContain("[GITHUB_TOKEN_REDACTED]");
    expect(out).not.toContain("ghp_1234");
  });

  it("redacts API keys", () => {
    const input = "key=sk-abcd1234567890efghijklmnop";
    const out = redact(input);
    expect(out).toContain("[API_KEY_REDACTED]");
  });

  it("redacts Bearer tokens", () => {
    const input = "Authorization: Bearer abcd1234567890efghijklmnopqrstuvwx";
    const out = redact(input);
    expect(out).toMatch(/Bearer \[TOKEN_REDACTED\]/);
  });

  it("redacts password=value patterns", () => {
    const input = "password=hunter2";
    const out = redact(input);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("hunter2");
  });

  it("redacts emails", () => {
    const input = "Contact: brogan@example.com for details";
    const out = redact(input);
    expect(out).toContain("[EMAIL_REDACTED]");
  });

  it("redacts IP addresses", () => {
    const input = "Connecting to 192.168.1.42 on port 22";
    const out = redact(input);
    expect(out).toContain("[IP_REDACTED]");
  });

  it("truncates very long output", () => {
    const input = "a".repeat(2500);
    const out = redact(input, 1000);
    expect(out.length).toBeLessThanOrEqual(1100);
    expect(out).toContain("truncated");
  });
});
