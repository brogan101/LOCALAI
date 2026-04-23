import assert from "node:assert/strict";
import { ApiError, settings } from "../src/api.js";

type FetchCall = {
  input: string | URL | Request;
  init?: RequestInit;
};

const originalFetch = globalThis.fetch;
const calls: FetchCall[] = [];

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function installFetch(handler: (input: string | URL | Request, init?: RequestInit) => Response | Promise<Response>) {
  calls.length = 0;
  globalThis.fetch = (async (input, init) => {
    calls.push({ input, init });
    return handler(input, init);
  }) as typeof fetch;
}

try {
  installFetch(() => jsonResponse({ settings: { allowAgentExec: true } }));
  const getResult = await settings.get();
  assert.deepEqual(getResult, { settings: { allowAgentExec: true } });
  assert.equal(calls[0]?.input, "/api/settings");
  assert.equal(calls[0]?.init?.method, "GET");
  assert.deepEqual(calls[0]?.init?.headers, {});

  installFetch((_input, init) => {
    assert.equal(init?.body, JSON.stringify({ allowAgentExec: false }));
    return jsonResponse({ success: true, settings: { allowAgentExec: false } });
  });
  const setResult = await settings.set({ allowAgentExec: false });
  assert.deepEqual(setResult, { success: true, settings: { allowAgentExec: false } });
  assert.equal(calls[0]?.input, "/api/settings");
  assert.equal(calls[0]?.init?.method, "PUT");
  assert.deepEqual(calls[0]?.init?.headers, { "Content-Type": "application/json" });

  installFetch(() => jsonResponse({
    success: false,
    blocked: true,
    permission: "allowAgentExec",
    message: "Command execution and desktop automation are disabled.",
  }, { status: 403 }));
  await assert.rejects(
    () => settings.set({ allowAgentExec: true }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 403);
      assert.equal(error.payload?.blocked, true);
      assert.equal(error.payload?.permission, "allowAgentExec");
      assert.equal(error.message, "Command execution and desktop automation are disabled.");
      return true;
    },
  );

  installFetch(() => new Response("plain failure", {
    status: 500,
    headers: { "content-type": "text/plain" },
  }));
  await assert.rejects(
    () => settings.get(),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 500);
      assert.equal(error.message, "plain failure");
      assert.equal(error.payload, undefined);
      return true;
    },
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("api-client.test.ts passed (18 assertions)");
