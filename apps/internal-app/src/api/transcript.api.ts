import { userAxios } from "./axios.js";
import type { ExtractedCRMField } from "@turtle/types";

export interface TranscriptExtractRequest {
  clientId:   string;
  clientName: string;
  transcript: string;
}

export interface TranscriptExtractResponse {
  id:              string;
  extractedFields: Record<string, ExtractedCRMField>;
}

export async function extractTranscriptFields(
  req: TranscriptExtractRequest,
): Promise<TranscriptExtractResponse> {
  const res = await userAxios.post<TranscriptExtractResponse>("/transcript/extract", req);
  return res.data;
}
