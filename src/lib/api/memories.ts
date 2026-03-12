import { apiRequest } from "./client";
import type { Memory } from "@/types";

export async function getMemories() {
  return apiRequest<{ memories: Memory[] }>("/memories");
}

export async function getTimeline() {
  return apiRequest<{ entries: Memory[] }>("/memories/timeline");
}

export async function getFavorites() {
  return apiRequest<{ memories: Memory[] }>("/memories/favorites");
}
