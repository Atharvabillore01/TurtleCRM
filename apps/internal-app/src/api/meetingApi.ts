const BASE_URL = (import.meta as any).env?.VITE_MEETING_SERVICE_URL ?? "http://localhost:4004";

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
  const res = await fetch(`${BASE_URL}/api/meetings/`);
  if (!res.ok) throw new Error(`meeting-service meetings ${res.status}`);
  return res.json();
}

export interface ClientOption {
  id: string;
  name: string;
  email: string;
  segment: string;
}

export interface AdvisorOption {
  id: string;
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
  meeting_url: string;
  created_by: string;
  title: string;
  client_name: string;
  advisor_name: string;
  client_email: string;
  advisor_email: string;
  member: string;
  guests: string[];
  notes: string;
}

export async function fetchClients(): Promise<ClientOption[]> {
  const res = await fetch(`${BASE_URL}/api/clients`);
  if (!res.ok) throw new Error(`meeting-service clients ${res.status}`);
  return res.json();
}

export async function fetchAdvisors(): Promise<AdvisorOption[]> {
  const res = await fetch(`${BASE_URL}/api/advisors`);
  if (!res.ok) throw new Error(`meeting-service advisors ${res.status}`);
  return res.json();
}

export async function scheduleMeeting(payload: ScheduleMeetingPayload): Promise<{ meeting_id: string }> {
  const res = await fetch(`${BASE_URL}/api/meetings/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`schedule meeting failed: ${err}`);
  }
  return res.json();
}

export async function fetchExtractions(validated?: boolean): Promise<Extraction[]> {
  const url = validated !== undefined
    ? `${BASE_URL}/api/extractions/?validated=${validated}`
    : `${BASE_URL}/api/extractions/`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`meeting-service ${res.status}`);
  return res.json();
}

export async function validateExtraction(
  extractionId: string,
  validatedBy: string,
  changes: { field_id: number; new_value: any }[],
  notes?: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/extractions/${extractionId}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ validated_by: validatedBy, validation_notes: notes, changes }),
  });
  if (!res.ok) throw new Error(`meeting-service validate ${res.status}`);
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
