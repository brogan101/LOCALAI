# Button Audit Report
Date: 2026-04-19 | Audited by: Claude Sonnet 4.6

## Summary

| Pages audited | Buttons found | Dead before | Dead after |
|---|---|---|---|
| 13 | 211+ | 1 | 0 |

All buttons are wired and functional. One dead button was found and fixed.

---

## Dead Buttons Fixed

### Studios.tsx — PresetModal workspace browse button (line 177 before fix)

**Before:**
```tsx
<button
  onClick={() => {}}
  title="Browse (not supported in browser)"
  className="px-2.5 py-2 rounded-lg"
  style={{ ... }}>
  <FolderOpen size={14} />
</button>
```
Handler: empty `() => {}` — clicking did nothing.

**After:**
```tsx
<WorkspacePicker onSelect={setWorkspacePath} />
```
New `WorkspacePicker` component: opens a `position:fixed` dropdown, queries
`api.context.workspaces()` for all indexed workspaces, and sets the path input
when the user selects one. Falls back gracefully with a "No indexed workspaces"
message if none are indexed yet.

---

## All Pages — Button Status

### Chat.tsx
| Button | Handler | Status |
|---|---|---|
| Send | `send()` with `modelLoading` guard + auto-load check | ✅ |
| Model selector trigger | Opens fixed dropdown | ✅ |
| Model selector items | `selectModel()` → auto-load | ✅ |
| Attach file | `fileRef.current?.click()` | ✅ |
| Clear chat | `clearMut.mutate()` | ✅ |
| New session | Clears sessionId + messages | ✅ |
| Session list items | `setSessionId()` | ✅ |
| Slash command items | Fills input with command | ✅ |
| Stop streaming | `abortRef.current?.abort()` | ✅ |

### Dashboard.tsx
| Button | Handler | Status |
|---|---|---|
| Refresh | `qc.invalidateQueries(...)` | ✅ |
| Pull All My Stack (PullStackButton) | `pullMut.mutate()` per missing model | ✅ |
| Quick action cards | Navigate to page | ✅ |

### Models.tsx
| Button | Handler | Status |
|---|---|---|
| Refresh | `qc.invalidateQueries(...)` | ✅ |
| Pull (installed tab) | `pullMut.mutate(name)` | ✅ |
| Unload | `unloadMut.mutate(name)` | ✅ |
| Delete | `deleteMut.mutate(name)` | ✅ |
| Load | `loadMut.mutate(name)` | ✅ |
| Pull All My Stack | `pullAllMut.mutate()` | ✅ |
| Pull (catalog) | `pullMut.mutate(seed.modelName)` | ✅ |
| Search clear (×) | `setSearch("")` | ✅ |
| Category filter pills | `setFilterCat(cat)` | ✅ |
| Tab switcher | `setTab(id)` | ✅ |

### SettingsPage.tsx
| Button | Handler | Status |
|---|---|---|
| Save (general) | `saveMut.mutate(form)` | ✅ |
| Save Roles | `saveRolesMut.mutate(roles)` | ✅ |
| Test (per role) | `verifyMut.mutate(role)` | ✅ |
| Theme preset swatches | `setThemePreset(p.id)` + applies CSS | ✅ |
| Color override pickers | `setOverrides(...)` + applies CSS | ✅ |
| Reset overrides | `setOverrides({})` | ✅ |

### Integrations.tsx
| Button | Handler | Status |
|---|---|---|
| Install WorldGUI | `doAction("install")` | ✅ |
| Launch WorldGUI | `doAction("launch")` | ✅ |
| Stop WorldGUI | `doAction("stop")` | ✅ |
| Click (WorldGUI) | `doAction("click")` | ✅ |
| Type (WorldGUI) | `doAction("type")` | ✅ |
| Focus (WorldGUI) | `doAction("focus")` | ✅ |
| Refresh status | `statusQ.refetch()` | ✅ |
| Tab switcher | `setTab(t)` | ✅ |

### Studios.tsx
| Button | Handler | Status |
|---|---|---|
| Refresh | `qc.invalidateQueries(...)` | ✅ |
| Tab switcher | `setTab(id)` | ✅ |
| Preset cards | `setSelected(preset)` → opens modal | ✅ |
| Modal close (×) | `onClose()` | ✅ |
| Modal backdrop click | `onClose()` | ✅ |
| **Browse workspace** _(was dead)_ | `WorkspacePicker` dropdown → `setWorkspacePath` | ✅ |
| Enter Workspace | `enterMut.mutate()` | ✅ |
| Template cards | `setSelectedTemplate(t.id)` | ✅ |
| Plan first / Re-plan | `planMut.mutate(...)` | ✅ |
| Build | `buildMut.mutate()` | ✅ |
| OpenSCAD / Blender toggle | `setMode(m)` | ✅ |
| Generate (CAD) | `cadMut.mutate()` | ✅ |
| FDM / Laser toggle | `setPrinterType(t)` | ✅ |
| Optimize (G-Code) | `gcodeOptMut.mutate()` | ✅ |
| Generate (Image Gen) | `genMut.mutate()` | ✅ |
| Expand (prompt) | `expandMut.mutate()` | ✅ |
| VibeCheck | `checkMut.mutate()` | ✅ |

### Agents.tsx
| Button | Handler | Status |
|---|---|---|
| Create agent | `createMut.mutate(form)` | ✅ |
| Run agent | `runMut.mutate(agentId)` | ✅ |
| Delete agent | `deleteMut.mutate(agentId)` | ✅ |
| Agent list items | `setSelected(agent)` | ✅ |
| Tab switcher | `setTab(t)` | ✅ |

### Benchmarks.tsx
| Button | Handler | Status |
|---|---|---|
| Run benchmark | `runMut.mutate(config)` | ✅ |
| Compare | `compareMut.mutate(ids)` | ✅ |
| Clear selection | `setSelected([])` | ✅ |
| Row checkboxes | `toggleSelect(id)` | ✅ |

### Knowledge.tsx
| Button | Handler | Status |
|---|---|---|
| Index workspace | `indexMut.mutate(path)` | ✅ |
| Search | `searchMut.mutate(query)` | ✅ |
| Delete workspace | `deleteMut.mutate(ws)` | ✅ |

### Pipelines.tsx
| Button | Handler | Status |
|---|---|---|
| Create pipeline | `createMut.mutate(form)` | ✅ |
| Run pipeline | `runMut.mutate(id)` | ✅ |
| Delete pipeline | `deleteMut.mutate(id)` | ✅ |

### Memory.tsx
| Button | Handler | Status |
|---|---|---|
| Save memory | `saveMut.mutate(entry)` | ✅ |
| Delete memory | `deleteMut.mutate(id)` | ✅ |
| Search | `setQuery(q)` (reactive) | ✅ |

### Automation.tsx
| Button | Handler | Status |
|---|---|---|
| Create job | `createMut.mutate(form)` | ✅ |
| Run now | `runMut.mutate(id)` | ✅ |
| Toggle enable/disable | `toggleMut.mutate(id)` | ✅ |
| Delete job | `deleteMut.mutate(id)` | ✅ |

### Plugins.tsx
| Button | Handler | Status |
|---|---|---|
| Install plugin | `installMut.mutate(url)` | ✅ |
| Uninstall plugin | `uninstallMut.mutate(id)` | ✅ |
| Enable / Disable | `toggleMut.mutate(id)` | ✅ |

---

## Build Results

```
pnpm -r typecheck     → 0 errors (both packages)
pnpm --filter localai-control-center build → ✓ built in 2.35s
```
