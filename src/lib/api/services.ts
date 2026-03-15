import { apiRequest } from "./client";
import type { Service } from "@/types";

/**
 * SERVICES API SERVICE LAYER
 *
 * Handles generic service operations for the Services hub.
 * This provides a backend contract for managing third-party service integrations.
 *
 * ⚠️ CRITICAL: These endpoints are NOT yet implemented in the backend.
 * This API layer is a contract definition that REQUIRES backend completion before use.
 * DO NOT treat these endpoints as stable until backend implementation is verified.
 *
 * Expected endpoints (PENDING BACKEND IMPLEMENTATION):
 * - GET /services - List available services and their connection status
 * - GET /services/:serviceId - Get details of a specific service
 * - POST /services/:serviceId/connect - Connect a service
 * - POST /services/:serviceId/disconnect - Disconnect a service
 *
 * The UI MUST fail gracefully if these endpoints are unavailable.
 * The UI MUST NOT fake service connection states or break chat functionality.
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
  return apiRequest<{ auth_url?: string; success: boolean }>(
    `/services/${serviceId}/connect`,
    {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
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
