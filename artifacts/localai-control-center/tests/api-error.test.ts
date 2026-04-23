import assert from "node:assert/strict";
import { ApiError, apiErrorMessage, isBlockedApiError } from "../src/api.js";

const blocked = new ApiError(403, "blocked", {
  success: false,
  blocked: true,
  permission: "allowAgentExec",
  message: "Command execution and desktop automation are disabled.",
});

assert.equal(isBlockedApiError(blocked), true, "blocked API errors should be detected");
assert.equal(
  apiErrorMessage(blocked),
  "Command execution and desktop automation are disabled.",
  "blocked API errors should expose the backend permission message",
);

const normal = new ApiError(500, "HTTP 500", {
  success: false,
  message: "Backend failed",
});

assert.equal(isBlockedApiError(normal), false, "normal API errors should not be treated as permission blocks");
assert.equal(apiErrorMessage(normal), "Backend failed", "normal API errors should expose backend messages");
assert.equal(apiErrorMessage(new Error("Plain failure")), "Plain failure", "plain errors should pass through");
assert.equal(apiErrorMessage("unknown", "Fallback"), "Fallback", "non-errors should use fallback");

console.log("api-error.test.ts passed (6 assertions)");
