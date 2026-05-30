import toast from "react-hot-toast";

/**
 * Unified error toast for any API / DB / network failure.
 *
 * Usage:
 *   try { await someApi(...) }
 *   catch (err) { showApiError(err, "Could not save meeting"); }
 *
 * Extraction order:
 *   1. FastAPI/Pydantic   → err.response.data.detail        (string or {error, message})
 *   2. Node/Fastify       → err.response.data.message / .error
 *   3. Axios network err  → err.message  (e.g. "Network Error")
 *   4. Anything else      → fallback param, then "Something went wrong"
 */
export function showApiError(err: any, fallback?: string): string {
  const msg = extractErrorMessage(err, fallback);
  toast.error(msg, {
    duration: 5000,
    style: {
      maxWidth: "480px",
      fontSize: "0.9rem",
      lineHeight: "1.35",
    },
  });
  return msg;
}

export function extractErrorMessage(err: any, fallback?: string): string {
  const data = err?.response?.data;

  if (data) {
    if (typeof data === "string") return data;

    // FastAPI default: { detail: "..." } OR { detail: { error, message } }
    const detail = data.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      if (typeof detail.message === "string") return detail.message;
      if (typeof detail.error === "string")   return detail.error;
      try { return JSON.stringify(detail); } catch { /* noop */ }
    }

    // Pydantic validation: { detail: [{ msg, loc }] }
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (first?.msg) return `${first.msg}${first.loc ? ` (${first.loc.join('.')})` : ""}`;
    }

    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string")   return data.error;
  }

  if (typeof err?.message === "string" && err.message) return err.message;
  return fallback ?? "Something went wrong. Please try again.";
}
