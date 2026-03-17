import { apiRequest } from "./client";

/**
 * PROJECTS & GOALS API SERVICE LAYER
 *
 * VERIFIED BACKEND ENDPOINTS:
 * - GET /projects — List user projects
 * - GET /goals — List user goals
 *
 * PENDING BACKEND:
 * - /reflections — Not yet live
 */

export interface Project {
  id: string;
  title: string;
  description?: string;
  status: "active" | "completed" | "archived";
  created_at: string;
  updated_at?: string;
  progress?: number;
  tags?: string[];
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  status: "active" | "completed" | "paused";
  target_date?: string;
  created_at: string;
  progress?: number;
  milestones?: GoalMilestone[];
}

export interface GoalMilestone {
  id: string;
  title: string;
  completed: boolean;
}

export interface Reflection {
  id: string;
  title: string;
  content: string;
  mood?: string;
  created_at: string;
}

export interface ProjectsResponse {
  projects: Project[];
}

export interface GoalsResponse {
  goals: Goal[];
}

export interface ReflectionsResponse {
  reflections: Reflection[];
}

/** Get all user projects */
export async function getProjects(sessionId: string) {
  return apiRequest<ProjectsResponse>(`/projects?session_id=${sessionId}`);
}

/** Get all user goals */
export async function getGoals(sessionId: string) {
  return apiRequest<GoalsResponse>(`/goals?session_id=${sessionId}`);
}

/** Get reflections (PENDING — backend not yet live) */
export async function getReflections(sessionId: string) {
  return apiRequest<ReflectionsResponse>(`/reflections?session_id=${sessionId}`);
}
