/**
 * COMMAND SANITIZER — blocks destructive shell commands before execution
 * ======================================================================
 * Used by every handler that runs external code:
 *   POST /system/exec/run, /exec/file, /exec/self-heal, /system/os/send-keys,
 *   /system/os/type-text, /system/os/click, /chat/command /run
 *
 * Returns { dangerous: false } for safe commands.
 * Returns { dangerous: true, reason } for blocked commands.
 *
 * Bypass: body.forceDangerous === true AND settings.requireActionConfirmation === false.
 */

export interface SanitizeResult {
  dangerous: boolean;
  reason?: string;
}

const BLOCK_LIST: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+-rf\s+\//,                                  reason: "rm -rf / would delete the entire filesystem" },
  { pattern: /\brm\s+-rf\s+~/,                                   reason: "rm -rf ~ would delete your home directory" },
  { pattern: /\bformat\s+[a-zA-Z]:/i,                            reason: "Disk format command blocked" },
  { pattern: /\bdel\s+\/f\s+\/s\s+\/q\s+[a-zA-Z]:\\/i,          reason: "Recursive forced deletion of drive root blocked" },
  { pattern: /\b(?:rd|rmdir)\s+\/s\s+\/q\s+[a-zA-Z]:\\/i,        reason: "Recursive forced deletion of drive root blocked" },
  { pattern: /Remove-Item.*-Recurse.*-Force/i,                   reason: "Remove-Item -Recurse -Force blocked" },
  { pattern: /\b(?:powershell|pwsh)\b.*-(?:enc|encodedcommand)\b/i, reason: "Encoded PowerShell command blocked" },
  { pattern: /^shutdown\b/,                                       reason: "System shutdown blocked" },
  { pattern: /\breg\s+delete\s+HKLM/i,                           reason: "Registry deletion from HKLM blocked" },
  { pattern: /\bcipher\s+\/w/i,                                   reason: "cipher /w secure wipe blocked" },
  { pattern: /\bnet\s+user.*\/delete/i,                           reason: "User account deletion blocked" },
  { pattern: /\btakeown\s+\/f\s+C:\\/i,                          reason: "Taking ownership of C:\\ root blocked" },
  { pattern: /\bicacls.*\/grant\s+Everyone:F\s+\/T/i,            reason: "Setting Everyone:Full on root blocked" },
  // Additional hardened patterns
  { pattern: /\bmkfs\b/i,                                         reason: "mkfs filesystem format blocked" },
  { pattern: /\bdd\s+if=/i,                                       reason: "dd raw disk write blocked" },
  { pattern: /\b:!+\b/,                                           reason: "Fork bomb pattern blocked" },
  { pattern: /\bpoweroff\b/i,                                     reason: "System poweroff blocked" },
  { pattern: /\breboot\b/i,                                       reason: "System reboot blocked" },
  { pattern: /\bcurl\b.*\|\s*bash/i,                              reason: "curl | bash pipe execution blocked" },
  { pattern: /\bwget\b.*\|\s*sh/i,                                reason: "wget | sh pipe execution blocked" },
  { pattern: /\bchmod\s+(?:-R\s+)?777\b/i,                        reason: "World-writable chmod blocked" },
  { pattern: /\bdropdb\b/i,                                       reason: "Database drop blocked" },
  { pattern: /\bdrop\s+database\b/i,                              reason: "DROP DATABASE blocked" },
  { pattern: /\btruncate\s+table\b/i,                             reason: "TRUNCATE TABLE blocked" },
];

/**
 * Checks whether a command string matches any blocked pattern.
 * Case-insensitive for most patterns (each regex specifies /i if needed).
 */
export function isDangerousCommand(cmd: string): SanitizeResult {
  const normalized = cmd.trim();
  for (const { pattern, reason } of BLOCK_LIST) {
    if (pattern.test(normalized)) {
      return { dangerous: true, reason };
    }
  }
  return { dangerous: false };
}
