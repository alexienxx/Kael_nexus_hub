import { useState, useEffect, useCallback } from "react";
import { useSession } from "./useSession";
import * as servicesApi from "@/lib/api/services";
import type { Service } from "@/types";

/**
 * Hook for managing services in the Services hub.
 * Fetches available services and their connection status.
 *
 * GRACEFUL DEGRADATION: If backend endpoints are not yet implemented,
 * returns empty services list and error state without breaking the UI.
 */
export function useServices() {
  const { sessionId } = useSession();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBackendAvailable, setIsBackendAvailable] = useState(true);

  const fetchServices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await servicesApi.getServices(sessionId);
      setServices(response.services);
      setIsBackendAvailable(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load services";
      setError(errorMsg);
      setIsBackendAvailable(false);
      // Fail gracefully: set empty services list, don't throw
      setServices([]);
      console.warn("Services backend not available:", err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // Listen for OAuth callback completion (from ServiceCallback page)
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === "kael-service-connected") {
        fetchServices();
      }
    }
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "kael-service-connected") {
        fetchServices();
      }
    }
    window.addEventListener("storage", handleStorage);
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("message", handleMessage);
    };
  }, [fetchServices]);

  const connectService = useCallback(
    async (serviceId: string) => {
      if (!isBackendAvailable) {
        throw new Error("Services backend is not available");
      }
      try {
        const response = await servicesApi.connectService(serviceId, sessionId);
        if (response.auth_url) {
          // Open OAuth URL if provided
          window.open(response.auth_url, "_blank");
        }
        // Refresh services list
        await fetchServices();
        return response;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to connect service";
        console.error("Connect service error:", err);
        throw new Error(errorMsg);
      }
    },
    [sessionId, fetchServices, isBackendAvailable]
  );

  const disconnectService = useCallback(
    async (serviceId: string) => {
      if (!isBackendAvailable) {
        throw new Error("Services backend is not available");
      }
      try {
        await servicesApi.disconnectService(serviceId, sessionId);
        // Refresh services list
        await fetchServices();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to disconnect service";
        console.error("Disconnect service error:", err);
        throw new Error(errorMsg);
      }
    },
    [sessionId, fetchServices, isBackendAvailable]
  );

  return {
    services,
    isLoading,
    error,
    isBackendAvailable,
    fetchServices,
    connectService,
    disconnectService,
  };
}
