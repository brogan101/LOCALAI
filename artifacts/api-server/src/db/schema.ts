import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ── chat_sessions ─────────────────────────────────────────────────────────────

export const chatSessions = sqliteTable("chat_sessions", {
  id:            text("id").primaryKey(),
  name:          text("name").notNull().default("New Chat"),
  workspacePath: text("workspace_path"),
  createdAt:     text("created_at").notNull(),
  updatedAt:     text("updated_at").notNull(),
});

// ── chat_messages ─────────────────────────────────────────────────────────────

export const chatMessages = sqliteTable("chat_messages", {
  id:             text("id").primaryKey(),
  sessionId:      text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  role:           text("role", { enum: ["system", "user", "assistant"] }).notNull(),
  content:        text("content").notNull(),
  imagesJson:     text("images_json"),
  supervisorJson: text("supervisor_json"),
  contextJson:    text("context_json"),
  createdAt:      text("created_at").notNull(),
});

// ── app_settings ──────────────────────────────────────────────────────────────

export const appSettings = sqliteTable("app_settings", {
  key:        text("key").primaryKey(),
  valueJson:  text("value_json").notNull(),
  updatedAt:  text("updated_at").notNull(),
});

// ── service_policies ─────────────────────────────────────────────────────────

export const servicePolicies = sqliteTable("service_policies", {
  id:                    text("id").primaryKey(),
  displayName:           text("display_name").notNull(),
  startupPolicy:         text("startup_policy").notNull(),
  allowedModesJson:      text("allowed_modes_json").notNull(),
  resourceClass:         text("resource_class").notNull(),
  healthCheck:           text("health_check"),
  stopCommand:           text("stop_command"),
  emergencyStopBehavior: text("emergency_stop_behavior").notNull(),
  requiresApproval:      integer("requires_approval", { mode: "boolean" }).notNull().default(false),
  updatedAt:             text("updated_at").notNull(),
});

// ── capability_state ─────────────────────────────────────────────────────────

export const capabilityState = sqliteTable("capability_state", {
  id:            text("id").primaryKey(),
  enabled:       integer("enabled", { mode: "boolean" }).notNull().default(true),
  active:        integer("active", { mode: "boolean" }).notNull().default(false),
  phase:         text("phase").notNull().default("idle"),
  assignedJobId: text("assigned_job_id"),
  updatedAt:     text("updated_at").notNull(),
});

// ── role_assignments ──────────────────────────────────────────────────────────

export const roleAssignments = sqliteTable("role_assignments", {
  role:      text("role").primaryKey(),
  modelName: text("model_name").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ── usage_metrics ────────────────────────────────────────────────────────────

export const usageMetrics = sqliteTable("usage_metrics", {
  date:             text("date").primaryKey(),   // YYYY-MM-DD
  tokensIn:         integer("tokens_in").notNull().default(0),
  tokensOut:        integer("tokens_out").notNull().default(0),
  costEstimateUsd:  real("cost_estimate_usd").notNull().default(0),
  localTokens:      integer("local_tokens").notNull().default(0),
  cloudTokens:      integer("cloud_tokens").notNull().default(0),
  localCostUsd:     real("local_cost_usd").notNull().default(0),
  cloudCostUsd:     real("cloud_cost_usd").notNull().default(0),
});

// ── thought_log ───────────────────────────────────────────────────────────────

export const thoughtLogTable = sqliteTable("thought_log", {
  id:           text("id").primaryKey(),
  timestamp:    text("timestamp").notNull(),
  level:        text("level").notNull().default("info"),
  category:     text("category").notNull(),
  title:        text("title").notNull(),
  message:      text("message").notNull(),
  metadataJson: text("metadata_json"),
});

// ── workspace_registry ────────────────────────────────────────────────────────

export const workspaceRegistry = sqliteTable("workspace_registry", {
  id:           text("id").primaryKey(),
  name:         text("name").notNull(),
  rootPath:     text("root_path").notNull(),
  template:     text("template"),
  pinnedAt:     text("pinned_at"),
  lastOpenedAt: text("last_opened_at"),
  metadataJson: text("metadata_json"),
});

// ── model_pull_history ────────────────────────────────────────────────────────

export const modelPullHistory = sqliteTable("model_pull_history", {
  id:          text("id").primaryKey(),
  modelName:   text("model_name").notNull(),
  startedAt:   text("started_at").notNull(),
  completedAt: text("completed_at"),
  bytes:       integer("bytes"),
  status:      text("status").notNull().default("pending"),  // pending | success | failed
  error:       text("error"),
});

// ── audit_log ─────────────────────────────────────────────────────────────────

export const auditLog = sqliteTable("audit_log", {
  id:            text("id").primaryKey(),
  timestamp:     text("timestamp").notNull(),
  action:        text("action").notNull(),
  filePath:      text("file_path"),
  oldHash:       text("old_hash"),
  newHash:       text("new_hash"),
  userConfirmed: integer("user_confirmed", { mode: "boolean" }),
  result:        text("result"),
  backupPath:    text("backup_path"),
});

// ── refactor_plans ────────────────────────────────────────────────────────────

export const refactorPlans = sqliteTable("refactor_plans", {
  id:                 text("id").primaryKey(),
  workspacePath:      text("workspace_path").notNull(),
  request:            text("request").notNull(),
  createdAt:          text("created_at").notNull(),
  impactedFilesJson:  text("impacted_files_json").notNull().default("[]"),
  stepsJson:          text("steps_json").notNull().default("[]"),
  summary:            text("summary").notNull().default(""),
});

// ── refactor_jobs ─────────────────────────────────────────────────────────────

export const refactorJobs = sqliteTable("refactor_jobs", {
  id:           text("id").primaryKey(),
  planId:       text("plan_id").notNull().references(() => refactorPlans.id, { onDelete: "cascade" }),
  model:        text("model").notNull(),
  status:       text("status").notNull().default("queued"),
  createdAt:    text("created_at").notNull(),
  startedAt:    text("started_at"),
  finishedAt:   text("finished_at"),
  stepsJson:    text("steps_json").notNull().default("[]"),
  error:        text("error"),
});

// ── async_jobs ────────────────────────────────────────────────────────────────

export const asyncJobs = sqliteTable("async_jobs", {
  id:           text("id").primaryKey(),
  name:         text("name").notNull(),
  type:         text("type").notNull(),
  status:       text("status").notNull().default("queued"),
  progress:     integer("progress").notNull().default(0),
  message:      text("message").notNull().default(""),
  error:        text("error"),
  resultJson:   text("result_json"),
  metadataJson: text("metadata_json"),
  capability:   text("capability"),
  createdAt:    text("created_at").notNull(),
  startedAt:    text("started_at"),
  finishedAt:   text("finished_at"),
});

// ── benchmark_runs ────────────────────────────────────────────────────────────

export const benchmarkRuns = sqliteTable("benchmark_runs", {
  id:          text("id").primaryKey(),
  prompt:      text("prompt").notNull(),
  createdAt:   text("created_at").notNull(),
  judgeModel:  text("judge_model").notNull(),
  resultsJson: text("results_json").notNull().default("[]"),
});

// ── pinboard_items ────────────────────────────────────────────────────────────

export const pinboardItems = sqliteTable("pinboard_items", {
  id:            text("id").primaryKey(),
  kind:          text("kind").notNull().default("text"),   // text | file | snippet
  title:         text("title").notNull(),
  content:       text("content").notNull(),
  filePath:      text("file_path"),
  workspacePath: text("workspace_path"),
  createdAt:     text("created_at").notNull(),
});

// ── rag_collections / rag_sources / rag_chunks ───────────────────────────────

export const ragCollections = sqliteTable("rag_collections", {
  id:                 text("id").primaryKey(),
  name:               text("name").notNull(),
  createdAt:          text("created_at").notNull(),
  updatedAt:          text("updated_at"),
  vectorProvider:     text("vector_provider").notNull().default("hnswlib"),
  providerStatusJson: text("provider_status_json").notNull().default("{}"),
});

export const ragSources = sqliteTable("rag_sources", {
  id:                   text("id").primaryKey(),
  collectionId:         text("collection_id").notNull(),
  source:               text("source").notNull(),
  sourcePath:           text("source_path"),
  sourceHash:           text("source_hash").notNull(),
  parserUsed:           text("parser_used").notNull(),
  chunkCount:           integer("chunk_count").notNull().default(0),
  citationMetadataJson: text("citation_metadata_json").notNull().default("{}"),
  providerStatusJson:   text("provider_status_json").notNull().default("{}"),
  status:               text("status").notNull().default("indexed"),
  updatedAt:            text("updated_at").notNull(),
  deletedAt:            text("deleted_at"),
});

export const ragChunks = sqliteTable("rag_chunks", {
  id:                   text("id").primaryKey(),
  collectionId:         text("collection_id").notNull(),
  sourceId:             text("source_id"),
  label:                integer("label").notNull(),
  source:               text("source").notNull(),
  chunkIndex:           integer("chunk_index").notNull(),
  text:                 text("text").notNull(),
  embeddingJson:        text("embedding_json"),
  citationMetadataJson: text("citation_metadata_json").notNull().default("{}"),
  providerStatusJson:   text("provider_status_json").notNull().default("{}"),
  stale:                integer("stale", { mode: "boolean" }).notNull().default(false),
  createdAt:            text("created_at").notNull(),
  updatedAt:            text("updated_at"),
  deletedAt:            text("deleted_at"),
});

// ── inventory / project-to-reality ───────────────────────────────────────────

export const inventoryItems = sqliteTable("inventory_items", {
  id:                    text("id").primaryKey(),
  name:                  text("name").notNull(),
  itemType:              text("item_type").notNull().default("other"),
  category:              text("category").notNull().default("uncategorized"),
  location:              text("location").notNull().default("unknown"),
  bin:                   text("bin").notNull().default("unknown"),
  quantity:              real("quantity"),
  unit:                  text("unit").notNull().default("each"),
  projectLink:           text("project_link"),
  reorderThreshold:      real("reorder_threshold"),
  supplierLink:          text("supplier_link"),
  notes:                 text("notes").notNull().default(""),
  availabilityStatus:    text("availability_status").notNull().default("unknown"),
  quantityStatus:        text("quantity_status").notNull().default("unknown"),
  suitabilityStatus:     text("suitability_status").notNull().default("unknown"),
  privacyClassification: text("privacy_classification").notNull().default("private"),
  sourceRefsJson:        text("source_refs_json").notNull().default("[]"),
  evidenceRefsJson:      text("evidence_refs_json").notNull().default("[]"),
  makerProjectId:        text("maker_project_id"),
  digitalTwinEntityId:   text("digital_twin_entity_id"),
  providerStatus:        text("provider_status").notNull().default("local"),
  createdAt:             text("created_at").notNull(),
  updatedAt:             text("updated_at").notNull(),
  deletedAt:             text("deleted_at"),
});

export const projectRealityPipelines = sqliteTable("project_reality_pipelines", {
  id:                  text("id").primaryKey(),
  title:               text("title").notNull(),
  projectId:           text("project_id"),
  makerProjectId:      text("maker_project_id"),
  digitalTwinEntityId: text("digital_twin_entity_id"),
  currentStage:        text("current_stage").notNull().default("idea"),
  stagesJson:          text("stages_json").notNull().default("[]"),
  inventoryChecksJson: text("inventory_checks_json").notNull().default("[]"),
  purchaseListJson:    text("purchase_list_json").notNull().default("[]"),
  labelPlanJson:       text("label_plan_json").notNull().default("{}"),
  approvalStatus:      text("approval_status").notNull().default("proposal"),
  status:              text("status").notNull().default("proposal"),
  createdAt:           text("created_at").notNull(),
  updatedAt:           text("updated_at").notNull(),
});

export const inventoryActionProposals = sqliteTable("inventory_action_proposals", {
  id:               text("id").primaryKey(),
  actionType:       text("action_type").notNull(),
  status:           text("status").notNull(),
  approvalRequired: integer("approval_required", { mode: "boolean" }).notNull().default(true),
  approvalId:       text("approval_id"),
  itemIdsJson:      text("item_ids_json").notNull().default("[]"),
  pipelineId:       text("pipeline_id"),
  reason:           text("reason").notNull(),
  metadataJson:     text("metadata_json").notNull().default("{}"),
  createdAt:        text("created_at").notNull(),
});

// ── automotive diagnostics / Master Tech ─────────────────────────────────────

export const automotiveVehicleProfiles = sqliteTable("automotive_vehicle_profiles", {
  id:                    text("id").primaryKey(),
  name:                  text("name").notNull(),
  year:                  text("year").notNull().default("unknown"),
  make:                  text("make").notNull().default("unknown"),
  model:                 text("model").notNull().default("unknown"),
  body:                  text("body").notNull().default("unknown"),
  drivetrain:            text("drivetrain").notNull().default("unknown"),
  engine:                text("engine").notNull().default("unknown"),
  transmission:          text("transmission").notNull().default("unknown"),
  ecu:                   text("ecu").notNull().default("unknown"),
  modsJson:              text("mods_json").notNull().default("[]"),
  wiringNotesJson:       text("wiring_notes_json").notNull().default("[]"),
  calibrationNotesJson:  text("calibration_notes_json").notNull().default("[]"),
  partsListJson:         text("parts_list_json").notNull().default("[]"),
  linkedEvidenceRefsJson:text("linked_evidence_refs_json").notNull().default("[]"),
  maintenanceLogJson:    text("maintenance_log_json").notNull().default("[]"),
  repairLogJson:         text("repair_log_json").notNull().default("[]"),
  dtcHistoryJson:        text("dtc_history_json").notNull().default("[]"),
  liveDataSnapshotsJson: text("live_data_snapshots_json").notNull().default("[]"),
  factStatus:            text("fact_status").notNull().default("unknown"),
  privacyClassification: text("privacy_classification").notNull().default("private"),
  digitalTwinEntityId:   text("digital_twin_entity_id"),
  providerStatus:        text("provider_status").notNull().default("local"),
  createdAt:             text("created_at").notNull(),
  updatedAt:             text("updated_at").notNull(),
});

export const automotiveDiagnosticCases = sqliteTable("automotive_diagnostic_cases", {
  id:                 text("id").primaryKey(),
  vehicleId:          text("vehicle_id").notNull(),
  title:              text("title").notNull(),
  symptomSummary:     text("symptom_summary").notNull().default(""),
  intakeStatus:       text("intake_status").notNull().default("proposal"),
  evidenceRefsJson:   text("evidence_refs_json").notNull().default("[]"),
  dtcsJson:           text("dtcs_json").notNull().default("[]"),
  freezeFrameStatus:  text("freeze_frame_status").notNull().default("not_configured"),
  liveDataStatus:     text("live_data_status").notNull().default("not_configured"),
  workflowJson:       text("workflow_json").notNull().default("[]"),
  likelyCausesJson:   text("likely_causes_json").notNull().default("[]"),
  confirmedFaultsJson:text("confirmed_faults_json").notNull().default("[]"),
  testPlanJson:       text("test_plan_json").notNull().default("[]"),
  assumptionsJson:    text("assumptions_json").notNull().default("[]"),
  partsCannonWarning: text("parts_cannon_warning").notNull().default(""),
  repairLogRefsJson:  text("repair_log_refs_json").notNull().default("[]"),
  createdAt:          text("created_at").notNull(),
  updatedAt:          text("updated_at").notNull(),
});

export const automotiveActionProposals = sqliteTable("automotive_action_proposals", {
  id:               text("id").primaryKey(),
  vehicleId:        text("vehicle_id").notNull(),
  caseId:           text("case_id"),
  actionType:       text("action_type").notNull(),
  status:           text("status").notNull(),
  approvalRequired: integer("approval_required", { mode: "boolean" }).notNull().default(false),
  approvalId:       text("approval_id"),
  reason:           text("reason").notNull(),
  metadataJson:     text("metadata_json").notNull().default("{}"),
  createdAt:        text("created_at").notNull(),
});

// ── recovery / backup / restore ──────────────────────────────────────────────

export const recoveryBackupManifests = sqliteTable("recovery_backup_manifests", {
  id:                 text("id").primaryKey(),
  status:             text("status").notNull(),
  dryRun:             integer("dry_run", { mode: "boolean" }).notNull().default(true),
  scopeJson:          text("scope_json").notNull().default("[]"),
  destinationJson:    text("destination_json").notNull().default("{}"),
  retentionJson:      text("retention_json").notNull().default("{}"),
  verificationJson:   text("verification_json").notNull().default("{}"),
  rollbackNotesJson:  text("rollback_notes_json").notNull().default("[]"),
  providerStatusJson: text("provider_status_json").notNull().default("[]"),
  manifestHash:       text("manifest_hash").notNull(),
  jobId:              text("job_id"),
  createdAt:          text("created_at").notNull(),
  updatedAt:          text("updated_at").notNull(),
});

export const recoveryRestorePlans = sqliteTable("recovery_restore_plans", {
  id:                 text("id").primaryKey(),
  manifestId:         text("manifest_id").notNull(),
  status:             text("status").notNull(),
  dryRun:             integer("dry_run", { mode: "boolean" }).notNull().default(true),
  approvalId:         text("approval_id"),
  dryRunResultJson:   text("dry_run_result_json").notNull().default("{}"),
  rollbackPointJson:  text("rollback_point_json").notNull().default("{}"),
  executed:           integer("executed", { mode: "boolean" }).notNull().default(false),
  jobId:              text("job_id"),
  createdAt:          text("created_at").notNull(),
  updatedAt:          text("updated_at").notNull(),
});

// ── session_token_budgets ─────────────────────────────────────────────────────

export const sessionTokenBudgets = sqliteTable("session_token_budgets", {
  sessionId:    text("session_id").primaryKey(),
  budgetTokens: integer("budget_tokens").notNull(),
  usedTokens:   integer("used_tokens").notNull().default(0),
  updatedAt:    text("updated_at").notNull(),
});

// ── Durable platform foundation ──────────────────────────────────────────────

export const workspaceRoots = sqliteTable("workspace_roots", {
  id:        text("id").primaryKey(),
  label:     text("label").notNull(),
  rootPath:  text("root_path").notNull(),
  source:    text("source").notNull().default("system"),
  enabled:   integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const localProfiles = sqliteTable("local_profiles", {
  id:           text("id").primaryKey(),
  scope:        text("scope").notNull(),
  name:         text("name").notNull(),
  settingsJson: text("settings_json").notNull().default("{}"),
  createdAt:    text("created_at").notNull(),
  updatedAt:    text("updated_at").notNull(),
});

export const integrationState = sqliteTable("integration_state", {
  id:           text("id").primaryKey(),
  stateJson:    text("state_json").notNull().default("{}"),
  installed:    integer("installed", { mode: "boolean" }).notNull().default(false),
  running:      integer("running", { mode: "boolean" }).notNull().default(false),
  pinned:       integer("pinned", { mode: "boolean" }).notNull().default(false),
  lastCheckedAt:text("last_checked_at"),
  lastError:    text("last_error"),
  updatedAt:    text("updated_at").notNull(),
});

export const pluginState = sqliteTable("plugin_state", {
  id:            text("id").primaryKey(),
  enabled:       integer("enabled", { mode: "boolean" }).notNull().default(true),
  installed:     integer("installed", { mode: "boolean" }).notNull().default(false),
  permissionsJson:text("permissions_json").notNull().default("{}"),
  stateJson:     text("state_json").notNull().default("{}"),
  updatedAt:     text("updated_at").notNull(),
});

export const permissionPolicies = sqliteTable("permission_policies", {
  id:         text("id").primaryKey(),
  scope:      text("scope").notNull(),
  subject:    text("subject").notNull().default("*"),
  action:     text("action").notNull(),
  effect:     text("effect").notNull().default("allow"),
  reason:     text("reason"),
  createdAt:  text("created_at").notNull(),
  updatedAt:  text("updated_at").notNull(),
});

export const durableJobs = sqliteTable("durable_jobs", {
  id:             text("id").primaryKey(),
  kind:           text("kind").notNull(),
  state:          text("state").notNull().default("queued"),
  priority:       integer("priority").notNull().default(0),
  payloadJson:    text("payload_json").notNull().default("{}"),
  checkpointJson: text("checkpoint_json").notNull().default("{}"),
  retryCount:     integer("retry_count").notNull().default(0),
  resultJson:     text("result_json"),
  error:          text("error"),
  sessionId:      text("session_id"),
  workspaceId:    text("workspace_id"),
  leaseOwner:     text("lease_owner"),
  leaseExpiresAt: text("lease_expires_at"),
  startedAt:      text("started_at"),
  finishedAt:     text("finished_at"),
  createdAt:      text("created_at").notNull(),
  updatedAt:      text("updated_at").notNull(),
});

export const approvalRequests = sqliteTable("approval_requests", {
  id:              text("id").primaryKey(),
  type:            text("type").notNull(),
  title:           text("title").notNull(),
  summary:         text("summary").notNull(),
  riskTier:        text("risk_tier").notNull(),
  physicalTier:    text("physical_tier"),
  requestedAction: text("requested_action").notNull(),
  payloadHash:     text("payload_hash").notNull(),
  payloadJson:     text("payload_json").notNull().default("{}"),
  status:          text("status").notNull().default("waiting_for_approval"),
  jobId:           text("job_id"),
  auditId:         text("audit_id"),
  requestedAt:     text("requested_at").notNull(),
  approvedAt:      text("approved_at"),
  deniedAt:        text("denied_at"),
  cancelledAt:     text("cancelled_at"),
  expiresAt:       text("expires_at"),
  resultJson:      text("result_json"),
});

export const jobEvents = sqliteTable("job_events", {
  id:           text("id").primaryKey(),
  jobId:        text("job_id").notNull(),
  eventType:    text("event_type").notNull(),
  message:      text("message").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt:    text("created_at").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id:           text("id").primaryKey(),
  eventType:    text("event_type").notNull(),
  action:       text("action").notNull(),
  actor:        text("actor").notNull().default("local-user"),
  target:       text("target"),
  result:       text("result").notNull().default("success"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt:    text("created_at").notNull(),
});

export const artifactRecords = sqliteTable("artifact_records", {
  id:           text("id").primaryKey(),
  kind:         text("kind").notNull(),
  name:         text("name").notNull(),
  path:         text("path"),
  workspaceId:  text("workspace_id"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt:    text("created_at").notNull(),
  updatedAt:    text("updated_at").notNull(),
});

// ── meeting_sessions / follow_up_drafts ──────────────────────────────────────

export const meetingSessions = sqliteTable("meeting_sessions", {
  id:              text("id").primaryKey(),
  status:          text("status").notNull().default("idle"),
  captureMode:     text("capture_mode").notNull().default("push_to_talk"),
  startedAt:       text("started_at"),
  stoppedAt:       text("stopped_at"),
  wordCount:       integer("word_count").notNull().default(0),
  summaryText:     text("summary_text").notNull().default(""),
  decisionsJson:   text("decisions_json").notNull().default("[]"),
  actionItemsJson: text("action_items_json").notNull().default("[]"),
  createdAt:       text("created_at").notNull(),
  updatedAt:       text("updated_at").notNull(),
});

export const followUpDrafts = sqliteTable("follow_up_drafts", {
  id:          text("id").primaryKey(),
  meetingId:   text("meeting_id").notNull().references(() => meetingSessions.id, { onDelete: "cascade" }),
  type:        text("type").notNull(),
  subject:     text("subject").notNull(),
  bodyPreview: text("body_preview").notNull().default(""),
  status:      text("status").notNull().default("draft"),
  approvalId:  text("approval_id"),
  createdAt:   text("created_at").notNull(),
  updatedAt:   text("updated_at").notNull(),
});

// ── business_drafts ──────────────────────────────────────────────────────────

export const businessDrafts = sqliteTable("business_drafts", {
  id:               text("id").primaryKey(),
  moduleId:         text("module_id").notNull(),
  type:             text("type").notNull(),
  status:           text("status").notNull().default("draft"),
  adapterId:        text("adapter_id"),
  inboundSummary:   text("inbound_summary").notNull().default(""),
  suggestedResponse:text("suggested_response").notNull().default(""),
  crmNote:          text("crm_note").notNull().default(""),
  calendarSlotJson: text("calendar_slot_json").notNull().default("{}"),
  approvalId:       text("approval_id"),
  source:           text("source").notNull().default("manual"),
  privacyJson:      text("privacy_json").notNull().default("{}"),
  metadataJson:     text("metadata_json").notNull().default("{}"),
  createdAt:        text("created_at").notNull(),
  updatedAt:        text("updated_at").notNull(),
});

// ── it_support_artifacts ─────────────────────────────────────────────────────

export const itSupportArtifacts = sqliteTable("it_support_artifacts", {
  id:                    text("id").primaryKey(),
  workflowType:          text("workflow_type").notNull(),
  status:                text("status").notNull().default("draft"),
  title:                 text("title").notNull(),
  requestSummary:        text("request_summary").notNull().default(""),
  scriptLanguage:        text("script_language"),
  scriptBody:            text("script_body").notNull().default(""),
  safetyContractJson:    text("safety_contract_json").notNull().default("{}"),
  integrationStatusJson: text("integration_status_json").notNull().default("[]"),
  approvalId:            text("approval_id"),
  executionMode:         text("execution_mode").notNull().default("review"),
  commandPreview:        text("command_preview").notNull().default(""),
  outputPreview:         text("output_preview").notNull().default(""),
  metadataJson:          text("metadata_json").notNull().default("{}"),
  createdAt:             text("created_at").notNull(),
  updatedAt:             text("updated_at").notNull(),
});

// ── maker_studio ──────────────────────────────────────────────────────────────

export const makerProjects = sqliteTable("maker_projects", {
  id:               text("id").primaryKey(),
  name:             text("name").notNull(),
  type:             text("type").notNull(),
  status:           text("status").notNull().default("draft"),
  safetyTier:       text("safety_tier").notNull().default("simulate"),
  physicalTier:     text("physical_tier").notNull().default("p1_suggest"),
  relatedFilesJson: text("related_files_json").notNull().default("[]"),
  cadFilesJson:     text("cad_files_json").notNull().default("[]"),
  slicedFilesJson:  text("sliced_files_json").notNull().default("[]"),
  targetJson:       text("target_json").notNull().default("{}"),
  materialJson:     text("material_json").notNull().default("{}"),
  traceabilityJson: text("traceability_json").notNull().default("{}"),
  approvalId:       text("approval_id"),
  metadataJson:     text("metadata_json").notNull().default("{}"),
  createdAt:        text("created_at").notNull(),
  updatedAt:        text("updated_at").notNull(),
});

export const makerMaterials = sqliteTable("maker_materials", {
  id:              text("id").primaryKey(),
  name:            text("name").notNull(),
  category:        text("category").notNull().default("unknown"),
  propertiesJson:  text("properties_json").notNull().default("{}"),
  safetyNotesJson: text("safety_notes_json").notNull().default("[]"),
  source:          text("source").notNull().default("manual"),
  createdAt:       text("created_at").notNull(),
  updatedAt:       text("updated_at").notNull(),
});

export const makerCadArtifacts = sqliteTable("maker_cad_artifacts", {
  id:           text("id").primaryKey(),
  projectId:    text("project_id").notNull(),
  artifactType: text("artifact_type").notNull(),
  name:         text("name").notNull(),
  path:         text("path"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  safetyTier:   text("safety_tier").notNull().default("read_only"),
  status:       text("status").notNull().default("proposal"),
  createdAt:    text("created_at").notNull(),
  updatedAt:    text("updated_at").notNull(),
});

// ── digital_twin ─────────────────────────────────────────────────────────────

export const digitalTwinEntities = sqliteTable("digital_twin_entities", {
  id:                    text("id").primaryKey(),
  type:                  text("type").notNull(),
  name:                  text("name").notNull(),
  description:           text("description").notNull().default(""),
  metadataJson:          text("metadata_json").notNull().default("{}"),
  sourceRefsJson:        text("source_refs_json").notNull().default("[]"),
  privacyClassification: text("privacy_classification").notNull().default("normal"),
  sensitivity:           text("sensitivity").notNull().default("normal"),
  stateConfidence:       text("state_confidence").notNull().default("unknown"),
  providerStatus:        text("provider_status").notNull().default("local"),
  createdAt:             text("created_at").notNull(),
  updatedAt:             text("updated_at").notNull(),
  archivedAt:            text("archived_at"),
});

export const digitalTwinRelationships = sqliteTable("digital_twin_relationships", {
  id:             text("id").primaryKey(),
  sourceEntityId: text("source_entity_id").notNull(),
  relationType:   text("relation_type").notNull(),
  targetEntityId: text("target_entity_id").notNull(),
  confidence:     real("confidence").notNull().default(0),
  status:         text("status").notNull().default("unknown"),
  provenanceJson: text("provenance_json").notNull().default("{}"),
  createdAt:      text("created_at").notNull(),
  updatedAt:      text("updated_at").notNull(),
  deletedAt:      text("deleted_at"),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type ChatSession      = typeof chatSessions.$inferSelect;
export type NewChatSession   = typeof chatSessions.$inferInsert;
export type ChatMessage      = typeof chatMessages.$inferSelect;
export type NewChatMessage   = typeof chatMessages.$inferInsert;

export type AppSettingRow    = typeof appSettings.$inferSelect;
export type ServicePolicyRow = typeof servicePolicies.$inferSelect;
export type RoleAssignment   = typeof roleAssignments.$inferSelect;
export type UsageMetricRow   = typeof usageMetrics.$inferSelect;
export type ThoughtLogRow    = typeof thoughtLogTable.$inferSelect;
export type WorkspaceRow     = typeof workspaceRegistry.$inferSelect;
export type ModelPullRow     = typeof modelPullHistory.$inferSelect;
export type AuditLogRow      = typeof auditLog.$inferSelect;
export type RefactorPlanRow  = typeof refactorPlans.$inferSelect;
export type RefactorJobRow   = typeof refactorJobs.$inferSelect;
export type AsyncJobRow      = typeof asyncJobs.$inferSelect;
export type BenchmarkRunRow  = typeof benchmarkRuns.$inferSelect;
export type PinboardItemRow  = typeof pinboardItems.$inferSelect;
export type RagCollectionRow = typeof ragCollections.$inferSelect;
export type RagSourceRow     = typeof ragSources.$inferSelect;
export type RagChunkRow      = typeof ragChunks.$inferSelect;
export type SessionBudgetRow = typeof sessionTokenBudgets.$inferSelect;
export type WorkspaceRootRow = typeof workspaceRoots.$inferSelect;
export type LocalProfileRow  = typeof localProfiles.$inferSelect;
export type DurableJobRow    = typeof durableJobs.$inferSelect;
export type JobEventRow      = typeof jobEvents.$inferSelect;
export type AuditEventRow    = typeof auditEvents.$inferSelect;
export type ArtifactRecordRow = typeof artifactRecords.$inferSelect;
export type BusinessDraftRow = typeof businessDrafts.$inferSelect;
export type ItSupportArtifactRow = typeof itSupportArtifacts.$inferSelect;
export type MakerProjectRow = typeof makerProjects.$inferSelect;
export type MakerMaterialRow = typeof makerMaterials.$inferSelect;
export type MakerCadArtifactRow = typeof makerCadArtifacts.$inferSelect;
export type DigitalTwinEntityRow = typeof digitalTwinEntities.$inferSelect;
export type DigitalTwinRelationshipRow = typeof digitalTwinRelationships.$inferSelect;
export type AutomotiveVehicleProfileRow = typeof automotiveVehicleProfiles.$inferSelect;
export type AutomotiveDiagnosticCaseRow = typeof automotiveDiagnosticCases.$inferSelect;
export type AutomotiveActionProposalRow = typeof automotiveActionProposals.$inferSelect;
export type RecoveryBackupManifestRow = typeof recoveryBackupManifests.$inferSelect;
export type RecoveryRestorePlanRow = typeof recoveryRestorePlans.$inferSelect;
