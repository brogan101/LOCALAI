import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PermissionNotice } from "../src/components/PermissionNotice.js";
import { permissionLabel } from "../src/hooks/useAgentPermissions.js";

assert.equal(permissionLabel("allowAgentExec"), "Agent execution");
assert.equal(permissionLabel("allowAgentEdits"), "Agent edits");
assert.equal(permissionLabel("allowAgentSelfHeal"), "Agent self-heal");
assert.equal(permissionLabel("allowAgentRefactor"), "Agent refactors");

const html = renderToStaticMarkup(
  React.createElement(PermissionNotice, {
    permission: "allowAgentExec",
    className: "extra-class",
  }),
);

assert.match(html, /Agent execution is disabled\./);
assert.match(html, /Enable it in Settings before running this action\./);
assert.match(html, /extra-class/);
assert.match(html, /color-mix\(in srgb, var\(--color-warn\) 10%, transparent\)/);

console.log("permission-notice.test.ts passed (8 assertions)");
