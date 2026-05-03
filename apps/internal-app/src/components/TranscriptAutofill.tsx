import { useState } from "react";
import { extractTranscriptFields } from "../api/transcript.api.js";
import type { ExtractedCRMField } from "@turtle/types";

type Status = "idle" | "loading" | "done" | "error";

interface EditableField {
  key:        string;
  value:      string;
  confidence: number;
}

interface FormErrors {
  clientId?:   string;
  clientName?: string;
  transcript?: string;
}

function validate(clientId: string, clientName: string, transcript: string): FormErrors {
  const e: FormErrors = {};
  if (!clientId.trim())                      e.clientId   = "Required";
  if (!clientName.trim())                    e.clientName = "Required";
  if (!transcript.trim())                    e.transcript = "Required";
  else if (transcript.trim().length < 50)    e.transcript = "Too short — paste the full transcript (min 50 chars)";
  return e;
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct   = Math.round(score * 100);
  const color = pct >= 80 ? "bg-green-100 text-green-700"
              : pct >= 50 ? "bg-yellow-100 text-yellow-700"
              :              "bg-red-100 text-red-700";
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {pct}%
    </span>
  );
}

function FieldInput({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

interface Props {
  devMode: boolean;
}

export function TranscriptAutofill({ devMode }: Props) {
  const [clientId,   setClientId]   = useState("");
  const [clientName, setClientName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [errors,     setErrors]     = useState<FormErrors>({});
  const [status,     setStatus]     = useState<Status>("idle");
  const [apiError,   setApiError]   = useState("");
  const [fields,     setFields]     = useState<EditableField[]>([]);
  const [saved,      setSaved]      = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(clientId, clientName, transcript);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStatus("loading");
    setApiError("");
    setSaved(false);

    try {
      const result = await extractTranscriptFields({ clientId, clientName, transcript });
      setFields(
        Object.entries(result.extractedFields).map(
          ([key, field]: [string, ExtractedCRMField]) => ({
            key,
            value:      field.value,
            confidence: field.confidence,
          })
        )
      );
      setStatus("done");
    } catch {
      setApiError("Extraction failed — check that the AI service is running.");
      setStatus("error");
    }
  }

  function updateField(index: number, value: string) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, value } : f)));
    setSaved(false);
  }

  function handleReset() {
    setClientId("");
    setClientName("");
    setTranscript("");
    setErrors({});
    setStatus("idle");
    setFields([]);
    setApiError("");
    setSaved(false);
  }

  // ── Auto mode (Fireflies) placeholder ────────────────────────────────────
  if (!devMode) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
        <p className="text-sm text-gray-400">Awaiting transcript from Fireflies</p>
        <p className="text-xs text-gray-300 mt-1">
          Auto-triggered when a <code className="bg-gray-100 px-1 rounded">call.transcript.ready</code> event arrives
        </p>
      </div>
    );
  }

  // ── DEV MODE ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Input form — hidden once extraction is done */}
      {status !== "done" && (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FieldInput label="Client Name" error={errors.clientName}>
              <input
                type="text"
                value={clientName}
                onChange={(e) => { setClientName(e.target.value); setErrors((p) => ({ ...p, clientName: undefined })); }}
                placeholder="Jane Smith"
                className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400 ${
                  errors.clientName ? "border-red-300 bg-red-50" : "border-gray-200"
                }`}
              />
            </FieldInput>

            <FieldInput label="Client ID" error={errors.clientId}>
              <input
                type="text"
                value={clientId}
                onChange={(e) => { setClientId(e.target.value); setErrors((p) => ({ ...p, clientId: undefined })); }}
                placeholder="c_123abc"
                className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400 ${
                  errors.clientId ? "border-red-300 bg-red-50" : "border-gray-200"
                }`}
              />
            </FieldInput>
          </div>

          <FieldInput label="Call Transcript" error={errors.transcript}>
            <textarea
              value={transcript}
              onChange={(e) => { setTranscript(e.target.value); setErrors((p) => ({ ...p, transcript: undefined })); }}
              rows={7}
              placeholder="Paste the full call transcript here…"
              className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none ${
                errors.transcript ? "border-red-300 bg-red-50" : "border-gray-200"
              }`}
            />
          </FieldInput>

          {status === "error" && (
            <p className="text-sm text-red-500">{apiError}</p>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing…
              </>
            ) : (
              "Process Transcript"
            )}
          </button>
        </form>
      )}

      {/* Extracted fields */}
      {status === "done" && fields.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 w-1/3">Field</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5">Value</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-2.5 w-24">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fields.map((field, i) => (
                  <tr key={field.key} className="bg-white hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{field.key}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        value={field.value}
                        onChange={(e) => updateField(i, e.target.value)}
                        className="w-full text-sm text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-gray-300 rounded px-1"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <ConfidenceBadge score={field.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            {saved ? (
              <span className="text-sm text-green-600 font-medium">✓ Confirmed</span>
            ) : (
              <button
                type="button"
                onClick={() => setSaved(true)}
                className="bg-gray-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Confirm &amp; Save
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
