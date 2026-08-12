import { apiRequest } from "@/lib/api/client";

export interface MobilePushStatus {
  configured: boolean;
  provider: string;
  project_id_present: boolean;
  credentials_file_present: boolean;
  storage_ready?: boolean;
  enabled_devices: number;
  pending: number;
  retry: number;
  dead: number;
}

export interface RegisterMobilePushInput {
  installation_id: string;
  token: string;
  platform: "android";
  app_version: string;
}

export function fetchMobilePushStatus(): Promise<MobilePushStatus> {
  return apiRequest<MobilePushStatus>("/mobile/push/status");
}

export function registerMobilePushDevice(
  input: RegisterMobilePushInput,
): Promise<{ ok: boolean; configured: boolean }> {
  return apiRequest("/mobile/push/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function unregisterMobilePushDevice(
  installationId: string,
): Promise<{ ok: boolean; disabled: boolean }> {
  return apiRequest("/mobile/push/unregister", {
    method: "POST",
    body: JSON.stringify({ installation_id: installationId }),
  });
}
