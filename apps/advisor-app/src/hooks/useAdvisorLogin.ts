import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { advisorLogin } from "../api/auth.api.js";

export function parseApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string } | undefined;
    if (error.response?.status === 429) return "Too many attempts. Please try again later.";
    return data?.error ?? error.message;
  }
  return "An unexpected error occurred. Please try again.";
}

export function useAdvisorLogin() {
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      advisorLogin(username, password),
  });
}
