import { apiRequest } from "./client";
import type { Service } from "@/types";

/**
 * SERVICES API SERVICE LAYER
 *
 * Handles generic service operations for the Services hub.
 * This provides a backend contract for managing third-party service integrations.
 *
 * Backend: services_hub/router.py (Drive, GitHub, Calendar, Slack integrations).
 *
 * Active endpoints:
 * - GET /services - List available services and their connection status
 * - GET /services/:serviceId - Get details of a specific service
 * - POST /services/:serviceId/connect - Connect a service
 * - POST /services/:serviceId/disconnect - Disconnect a service
 */

export interface ServicesResponse {
  services: Service[];
}

export interface ServiceDetailResponse extends Service {
  connected_at?: string;
  last_used?: string;
}

/** Get all available services and their connection status */
export async function getServices(sessionId: string) {
  return apiRequest<ServicesResponse>(`/services?session_id=${sessionId}`);
}

/** Get details of a specific service */
export async function getServiceDetails(serviceId: string, sessionId: string) {
  return apiRequest<ServiceDetailResponse>(`/services/${serviceId}?session_id=${sessionId}`);
}

/** Connect a service (initiate OAuth or connection flow) */
export async function connectService(serviceId: string, sessionId: string) {
  // Build redirect_uri pointing back to OUR frontend callback route
  const redirectUri = `${window.location.origin}/services/callback`;
  return apiRequest<{ auth_url?: string; success: boolean; message?: string; error?: string }>(
    `/services/${serviceId}/connect`,
    {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, redirect_uri: redirectUri }),
    }
  );
}

/** Disconnect a service */
export async function disconnectService(serviceId: string, sessionId: string) {
  return apiRequest<{ success: boolean }>(`/services/${serviceId}/disconnect`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

/** Store token received from OAuth callback */
export async function storeServiceToken(
  serviceId: string,
  token: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    account_label?: string;
    token_type?: string;
  }
) {
  return apiRequest<{ ok: boolean }>(`/services/${serviceId}/token`, {
    method: "POST",
    body: JSON.stringify(token),
  });
}

/** Get Drive files (requires connected Drive service) */
export async function getDriveFiles(pageSize = 20) {
  return apiRequest<{ files: Record<string, unknown>[] }>(`/services/drive/files?page_size=${pageSize}`);
}

/** Get Calendar events (requires connected Calendar service) */
export async function getCalendarEvents(maxResults = 10) {
  return apiRequest<{ events: Record<string, unknown>[] }>(`/services/calendar/events?max_results=${maxResults}`);
}

/** Get GitHub repos (requires connected GitHub service) */
export async function getGitHubRepos(perPage = 30) {
  return apiRequest<{ repos: Record<string, unknown>[] }>(`/services/github/repos?per_page=${perPage}`);
}
