import { useDevMode } from "../hooks/useDevMode.js";
import { TranscriptAutofill } from "../components/TranscriptAutofill.js";

export function AutofillPage() {
  const { devMode, toggle } = useDevMode();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">AI Field Autofill</h1>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {devMode ? "Manual input" : "Auto (Fireflies)"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={devMode}
            onClick={toggle}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              devMode ? "bg-gray-800" : "bg-gray-300"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                devMode ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <TranscriptAutofill devMode={devMode} />
      </div>
    </div>
  );
}
