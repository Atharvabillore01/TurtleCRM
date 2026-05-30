import { meetingAxios } from "./axios.js";

export interface RawField {
  value: any;
  confidence: number;
  confidence_level: string;
  source: string;
  agent: string | null;
  attribute: string;
  touch_point: string;
}

export interface Extraction {
  id: string;
  client_id: string;
  meeting_id: string;
  extraction_job_id: string;
  provider: string;
  model: string;
  extracted_at: string;
  duration_seconds: number;
  total_fields: number;
  raw_data: Record<string, RawField>;
  // Joined names from the meeting row — present when fetched via /extractions.
  meeting_title?: string;
  meeting_start_time?: string;
  meeting_agenda?: string;
  client_names?: string[];
  adviser_names?: string[];
  // Optimistic-concurrency marker. Passed back to sp_patch_extraction_fields
  // as expected_version on each edit; bumped on every successful patch.
  version?: number;
  validated: boolean;
  validated_by: string | null;
  validated_at: string | null;
  validation_notes: string | null;
  created_at: string;
}

export interface MeetingRecord {
  id: string;
  title: string;
  agenda: string;
  client_id: string;
  client_name: string;
  advisor_id: string;
  advisor_name: string;
  advisor_ids: string[];
  advisor_names: string[];
  member: string;
  guests: string[];
  notes: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  meeting_url: string;
  firefly_meeting_id: string;
  extraction_status: string;
  created_by: string;
  created_at: string;
}

export async function fetchMeetings(): Promise<MeetingRecord[]> {
  const res = await meetingAxios.get<MeetingRecord[]>("/api/meetings/");
  return res.data;
}

export interface ClientOption {
  id: string;
  // client_users.id — what sp_schedule_meeting wants for meeting_attendees FK.
  // `id` above is clients.id (lead row), kept for display/lookup compatibility.
  client_user_id: string | null;
  name: string;
  email: string;
  segment: string;
}

export interface AdvisorOption {
  id: string;
  // adviser_users.id — used as the adviser attendee FK in sp_schedule_meeting.
  adviser_user_id: string;
  name: string;
  email: string;
  specialization: string;
}

export interface ScheduleMeetingPayload {
  client_id: string;
  advisor_id: string;
  scheduled_at: string;
  duration_minutes: number;
  agenda: string;
  meeting_url?: string;
  created_by: string;
  title: string;
  client_name: string;
  advisor_name: string;
  client_email: string;
  advisor_email: string;
  // multi-advisor fields
  advisor_ids: string[];
  advisor_names: string[];
  advisor_emails: string[];
  // Auth-side UUIDs the SP actually wires into meeting_attendees.
  client_user_ids: string[];
  adviser_user_ids: string[];
  member: string;
  guests: string[];
  notes: string;
  agents_to_use?: string[];
}

export interface AgentOption {
  name: string;
  touch_point: string;
  phase: number;
}

export async function fetchAvailableAgents(): Promise<AgentOption[]> {
  const res = await meetingAxios.get<AgentOption[]>("/api/meetings/agents");
  return res.data;
}

export async function fetchClients(): Promise<ClientOption[]> {
  const res = await meetingAxios.get<ClientOption[]>("/api/clients");
  return res.data;
}

export async function fetchAdvisors(): Promise<AdvisorOption[]> {
  const res = await meetingAxios.get<AdvisorOption[]>("/api/advisors");
  return res.data;
}

export async function scheduleMeeting(payload: ScheduleMeetingPayload): Promise<{ meeting_id: string }> {
  const res = await meetingAxios.post<{ meeting_id: string }>("/api/meetings/schedule", payload);
  return res.data;
}

// ─── Lifecycle: cancel / reschedule / status / no-show / complete / state ────

export interface CancelMeetingPayload {
  reason?: string;
  idempotency_key?: string;
}

export interface RescheduleMeetingPayload {
  new_start_time: string;   // ISO-8601
  new_end_time:   string;   // ISO-8601
  new_google_meet_link?: string;
  reason?: string;
  idempotency_key?: string;
}

export interface MeetingLifecycleState {
  meeting_id: string;
  status: string;
  derived_state:
    | "scheduled" | "in_progress" | "completed"
    | "transcribed" | "extracted" | "validated"
    | "cancelled" | "no_show" | "unknown";
  reschedule_count: number;
  is_no_show: boolean;
  follow_up_required: boolean;
  has_transcript: boolean;
  transcript_count: number;
  has_extraction: boolean;
  extraction_count: number;
  latest_extraction_id: string | null;
  latest_extraction_validated: boolean | null;
  start_time: string;
  end_time: string;
  elapsed_minutes: number | null;
}

export async function cancelMeeting(meetingId: string, payload: CancelMeetingPayload = {}): Promise<any> {
  const res = await meetingAxios.post(`/api/meetings/${meetingId}/cancel`, payload);
  return res.data;
}

export async function rescheduleMeeting(meetingId: string, payload: RescheduleMeetingPayload): Promise<any> {
  const res = await meetingAxios.post(`/api/meetings/${meetingId}/reschedule`, payload);
  return res.data;
}

export async function markMeetingNoShow(meetingId: string, reason?: string): Promise<any> {
  const res = await meetingAxios.post(`/api/meetings/${meetingId}/no-show`,
    null, { params: reason ? { reason } : undefined });
  return res.data;
}

export async function completeMeeting(meetingId: string): Promise<any> {
  const res = await meetingAxios.post(`/api/meetings/${meetingId}/complete`);
  return res.data;
}

export async function getMeetingLifecycleState(meetingId: string): Promise<MeetingLifecycleState> {
  const res = await meetingAxios.get<MeetingLifecycleState>(`/api/meetings/${meetingId}/lifecycle`);
  return res.data;
}

// UUIDv4 — used as the idempotency_key on schedule / reschedule / cancel.
// Browser-native crypto API. No external dep.
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  // Fallback for very old browsers: RFC4122-ish.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function fetchExtractions(validated?: boolean): Promise<Extraction[]> {
  const url = validated !== undefined
    ? `/api/extractions/?validated=${validated}`
    : `/api/extractions/`;
  const res = await meetingAxios.get<Extraction[]>(url);
  return res.data;
}

// `validated_by` no longer goes in the body — the meeting-service derives it
// from the JWT (Authorization: Bearer ... / access_token cookie). The frontend
// just hits the endpoint; field edits go through patchExtractionFields below.
export async function validateExtraction(
  extractionId: string,
  notes?: string,
): Promise<{ extraction_id: string; validated: boolean; version: number }> {
  const res = await meetingAxios.post<{ extraction_id: string; validated: boolean; version: number }>(
    `/api/extractions/${extractionId}/validate`,
    { validation_notes: notes ?? null },
  );
  return res.data;
}

export interface FieldEdit {
  field_id: string;
  value: unknown;
  confidence?: number;
  confidence_level?: string;
  source?: string;
  reason?: string;
}

// Per-field reviewer edits. `changed_by` comes from the JWT on the server side.
// expected_version is the version the reviewer saw when loading the page —
// server returns 409 with current_version if a concurrent edit raced past us.
export async function patchExtractionFields(
  extractionId: string,
  expectedVersion: number,
  updates: FieldEdit[],
): Promise<{ extraction_id: string; version: number; fields_changed: number }> {
  try {
    const res = await meetingAxios.post<{ extraction_id: string; version: number; fields_changed: number }>(
      `/api/extractions/${extractionId}/fields`,
      { expected_version: expectedVersion, updates },
    );
    return res.data;
  } catch (err: any) {
    if (err?.response?.status === 409) {
      throw new Error(
        `version_mismatch: extraction was edited elsewhere (server says ${err.response.data?.detail ?? "reload"})`
      );
    }
    throw new Error(`meeting-service patch fields ${err?.response?.status ?? "error"}`);
  }
}

// Maps numeric 174-field IDs to the attribute string IDs used by the validation UI
export const FIELD_ID_TO_ATTR_ID: Record<number, string> = {
  2: "clientName",
  3: "clientGender",
  4: "clientAge",
  5: "maritalStatus",
  6: "spouseName",
  7: "spouseGender",
  8: "spouseAge",
  9: "taxResidencySelf",
  10: "citizenshipSelf",
  13: "childrenCount",
  48: "annualIncome",
  46: "liabilitiesHomeLoan",
  50: "rentPaidMonthly",
  61: "nreAccount",
  78: "epfBalance",
  82: "planningGoalPrimary",
  84: "employmentType",
  86: "employmentType",
  100: "communicationPreference",
};

export function extractionToMeetingValues(raw: Record<string, RawField>): Record<string, any> {
  const values: Record<string, any> = {};
  for (const [fieldId, field] of Object.entries(raw)) {
    const attrId = FIELD_ID_TO_ATTR_ID[Number(fieldId)];
    if (attrId && field.value !== null && field.value !== undefined) {
      values[attrId] = String(field.value);
    }
  }
  return values;
}
