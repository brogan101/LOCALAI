/**
 * workspace-presets.ts — 10 canonical workspace presets.
 * All model references are looked up via modelRolesService at runtime —
 * no model name literals here, per Rule 4.
 */

import type { ModelRole } from "./models.config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StartingLayout =
  | "split-editor-chat"
  | "single-chat"
  | "canvas-chat"
  | "gallery-chat";

export interface PresetToolset {
  rag:        boolean;
  vision:     boolean;
  fileExec:   boolean;
  webSearch:  boolean;
  osInterop:  boolean;
  gcode:      boolean;
  openscad:   boolean;
  comfyui:    boolean;
}

export interface WorkspacePreset {
  id:                           string;
  name:                         string;
  description:                  string;
  /** Lucide icon name (string, resolved in the frontend) */
  icon:                         string;
  requiredRoles:                ModelRole[];
  optionalRoles:                ModelRole[];
  toolset:                      PresetToolset;
  systemPrompt:                 string;
  startingLayout:               StartingLayout;
  defaultWorkspacePathTemplate: string;
  /**
   * Role assignments to write to model-roles.json on first entry.
   * Keys are ModelRole, values are Ollama model name strings.
   * Written only when the model is already installed in Ollama.
   */
  preferredRoleAssignments?:    Partial<Record<ModelRole, string>>;
}

// ── 10 Canonical presets ──────────────────────────────────────────────────────

export const WORKSPACE_PRESETS: WorkspacePreset[] = [
  {
    id:          "coding",
    name:        "Coding Workspace",
    description: "Split editor + chat, Monaco, VS Code launch",
    icon:        "Code2",
    requiredRoles:  ["primary-coding"],
    optionalRoles:  ["fast-coding", "autocomplete", "reasoning"],
    toolset: {
      rag: true, vision: false, fileExec: true,
      webSearch: false, osInterop: true,
      gcode: false, openscad: false, comfyui: false,
    },
    systemPrompt:
      "You are Sovereign Coder — a senior software engineer running locally. " +
      "You have full access to the workspace filesystem. Prefer editing files in-place. " +
      "When generating code always include the full file path as the fence label. " +
      "Never truncate functions — produce the complete implementation.",
    startingLayout:               "split-editor-chat",
    defaultWorkspacePathTemplate: "%USERPROFILE%\\LocalAI-Tools\\workspaces\\coding",
    preferredRoleAssignments: {
      "primary-coding": "qwen2.5-coder:7b",
      "fast-coding":    "qwen2.5-coder:1.5b",
      "autocomplete":   "qwen2.5-coder:1.5b",
    },
  },

  {
    id:          "cad",
    name:        "CAD / 3-D Workspace",
    description: "OpenSCAD + render preview + G-code optimizer",
    icon:        "Box",
    requiredRoles:  ["reasoning"],
    optionalRoles:  ["vision", "fast-coding"],
    toolset: {
      rag: false, vision: true, fileExec: true,
      webSearch: false, osInterop: true,
      gcode: true, openscad: true, comfyui: false,
    },
    systemPrompt:
      "You are a mechanical-design expert. The user works in OpenSCAD and FreeCAD. " +
      "When generating OpenSCAD always emit complete, valid scripts. " +
      "For G-code, optimize for FDM printing unless the user specifies laser. " +
      "Always ask about tolerances, materials, and layer height before generating.",
    startingLayout:               "canvas-chat",
    defaultWorkspacePathTemplate: "%USERPROFILE%\\LocalAI-Tools\\workspaces\\cad",
    preferredRoleAssignments: {
      "reasoning": "qwen2.5:14b",
      "vision":    "llava:13b",
    },
  },

  {
    id:          "imagegen",
    name:        "Image Generation",
    description: "ComfyUI / SD probe + prompt expander + gallery",
    icon:        "Image",
    requiredRoles:  ["imagegen"],
    optionalRoles:  ["vision", "chat"],
    toolset: {
      rag: false, vision: true, fileExec: false,
      webSearch: false, osInterop: false,
      gcode: false, openscad: false, comfyui: true,
    },
    systemPrompt:
      "You are an expert AI art director. Help craft, refine, and expand image prompts " +
      "for diffusion models. When the user shows you an image, describe how to reproduce " +
      "or improve it. Suggest negative prompts. Recommend cfg scale and sampling steps.",
    startingLayout:               "gallery-chat",
    defaultWorkspacePathTemplate: "%USERPROFILE%\\LocalAI-Tools\\workspaces\\imagegen",
  },

  {
    id:          "writing",
    name:        "Writing Workspace",
    description: "Markdown editor + chat + RAG upload zone",
    icon:        "FileText",
    requiredRoles:  ["chat"],
    optionalRoles:  ["reasoning", "embedding"],
    toolset: {
      rag: true, vision: false, fileExec: false,
      webSearch: false, osInterop: false,
      gcode: false, openscad: false, comfyui: false,
    },
    systemPrompt:
      "You are a professional writing assistant. Help with structure, clarity, tone, " +
      "and style. When asked to revise, preserve the author's voice. " +
      "Use the RAG context when documents are uploaded to answer questions about them.",
    startingLayout:               "split-editor-chat",
    defaultWorkspacePathTemplate: "%USERPROFILE%\\LocalAI-Tools\\workspaces\\writing",
    preferredRoleAssignments: {
      "chat": "llama3.1:8b",
    },
  },

  {
    id:          "research",
    name:        "Research Workspace",
    description: "Chat + RAG + web search (Phase 6)",
    icon:        "BookOpen",
    requiredRoles:  ["deep-reasoning"],
    optionalRoles:  ["embedding", "chat"],
    toolset: {
      rag: true, vision: true, fileExec: false,
      webSearch: true, osInterop: false,
      gcode: false, openscad: false, comfyui: false,
    },
    systemPrompt:
      "You are a research analyst. Synthesise information from uploaded documents and " +
      "web search results. Always cite sources. Think step-by-step. " +
      "Distinguish between facts, inferences, and speculation.",
    startingLayout:               "single-chat",
    defaultWorkspacePathTemplate: "%USERPROFILE%\\LocalAI-Tools\\workspaces\\research",
  },

  {
    id:          "automotive",
    name:        "Automotive Workspace",
    description: "Domain system prompt + vision for photos",
    icon:        "Car",
    requiredRoles:  ["reasoning"],
    optionalRoles:  ["vision", "chat"],
    toolset: {
      rag: true, vision: true, fileExec: false,
      webSearch: false, osInterop: false,
      gcode: false, openscad: false, comfyui: false,
    },
    systemPrompt:
      "You are an expert automotive technician and engineer. " +
      "When the user shares a photo, diagnose visible issues, identify parts, and suggest repairs. " +
      "Provide torque specs, part numbers, and estimated labour time when relevant. " +
      "Always advise professional inspection for safety-critical components.",
    startingLayout:               "single-chat",
    defaultWorkspacePathTemplate: "%USERPROFILE%\\LocalAI-Tools\\workspaces\\automotive",
  },

  {
    id:          "sysadmin",
    name:        "SysAdmin Workspace",
    description: "Chat + run-command inline + log analysis",
    icon:        "Terminal",
    requiredRoles:  ["reasoning"],
    optionalRoles:  ["fast-coding"],
    toolset: {
      rag: false, vision: false, fileExec: true,
      webSearch: false, osInterop: true,
      gcode: false, openscad: false, comfyui: false,
    },
    systemPrompt:
      "You are a senior Linux/Windows systems administrator. " +
      "When the user pastes logs or error output, diagnose immediately. " +
      "Propose exact commands to fix issues. Prefer idempotent one-liners. " +
      "Always warn before destructive operations (rm -rf, format, DROP TABLE).",
    startingLayout:               "single-chat",
    defaultWorkspacePathTemplate: "%USERPROFILE%\\LocalAI-Tools\\workspaces\\sysadmin",
  },

  {
    id:          "log-analysis",
    name:        "Log Analysis",
    description: "Drop .log file → RAG index → ask-about-log",
    icon:        "FileSearch",
    requiredRoles:  ["reasoning"],
    optionalRoles:  ["embedding"],
    toolset: {
      rag: true, vision: false, fileExec: false,
      webSearch: false, osInterop: false,
      gcode: false, openscad: false, comfyui: false,
    },
    systemPrompt:
      "You are a log analysis expert. The user will drop log files; you will index them via RAG " +
      "and answer questions about errors, warnings, timings, and patterns. " +
      "Highlight the most critical issues first. Correlate timestamps when multiple logs are present.",
    startingLayout:               "single-chat",
    defaultWorkspacePathTemplate: "%USERPROFILE%\\LocalAI-Tools\\workspaces\\log-analysis",
  },

  {
    id:          "3d-print-slicer",
    name:        "3-D Print Slicer",
    description: "G-code optimizer + Cura interop (Phase 6)",
    icon:        "Printer",
    requiredRoles:  ["fast-coding"],
    optionalRoles:  ["reasoning", "vision"],
    toolset: {
      rag: false, vision: true, fileExec: true,
      webSearch: false, osInterop: true,
      gcode: true, openscad: true, comfyui: false,
    },
    systemPrompt:
      "You are a 3-D printing specialist. Help slice models, tune slicer profiles, and " +
      "optimise G-code for quality and speed. Provide bed adhesion, retraction, and " +
      "cooling recommendations specific to the user's filament and printer.",
    startingLayout:               "canvas-chat",
    defaultWorkspacePathTemplate: "%USERPROFILE%\\LocalAI-Tools\\workspaces\\3d-print",
  },

  {
    id:          "laser-engrave",
    name:        "Laser Engraving",
    description: "Power/speed calculator + G-code tuning",
    icon:        "Zap",
    requiredRoles:  ["fast-coding"],
    optionalRoles:  ["reasoning", "vision"],
    toolset: {
      rag: false, vision: true, fileExec: true,
      webSearch: false, osInterop: true,
      gcode: true, openscad: false, comfyui: false,
    },
    systemPrompt:
      "You are a laser engraving and cutting expert. Help calculate power/speed settings " +
      "for different materials and laser wattages. Generate and optimise LightBurn-compatible " +
      "G-code. Warn about material fumes, reflective surfaces, and required PPE.",
    startingLayout:               "canvas-chat",
    defaultWorkspacePathTemplate: "%USERPROFILE%\\LocalAI-Tools\\workspaces\\laser",
  },
];

// ── Convenience lookup ─────────────────────────────────────────────────────────

export function getPreset(id: string): WorkspacePreset | undefined {
  return WORKSPACE_PRESETS.find(p => p.id === id);
}
