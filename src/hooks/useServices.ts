import { useState, useEffect, useCallback } from "react";
import { useSession } from "./useSession";
import * as servicesApi from "@/lib/api/services";
import type { Service } from "@/types";

/**
 * Hook for managing services in the Services hub.
 * Fetches available services and their connection status.
 */
export function useServices() {
  const { sessionId } = useSession();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await servicesApi.getServices(sessionId);
      setServices(response.services);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load services";
      setError(errorMsg);
      console.error("Fetch services error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const connectService = useCallback(
    async (serviceId: string) => {
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
    [sessionId, fetchServices]
  );

  const disconnectService = useCallback(
    async (serviceId: string) => {
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
    [sessionId, fetchServices]
  );

  return {
    services,
    isLoading,
    error,
    fetchServices,
    connectService,
    disconnectService,
  };
}
