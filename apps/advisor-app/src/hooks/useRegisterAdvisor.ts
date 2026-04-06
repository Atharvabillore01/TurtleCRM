import { useMutation } from "@tanstack/react-query";
import { registerAdvisor, type RegisterAdvisorPayload } from "../api/auth.api.js";
import { parseApiError } from "./useAdvisorLogin.js";

export { parseApiError };

export function useRegisterAdvisor() {
  return useMutation({
    mutationFn: (payload: RegisterAdvisorPayload) => registerAdvisor(payload),
  });
}
