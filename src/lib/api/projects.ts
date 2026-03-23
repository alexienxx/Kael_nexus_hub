import { apiRequest } from "./client";

/**
 * PROJECTS & GOALS API SERVICE LAYER
 *
 * VERIFIED BACKEND ENDPOINTS:
 * - GET /projects — List user projects
 * - GET /goals — List user goals
 *
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


export interface ProjectsResponse {
  projects: Project[];
}

export interface GoalsResponse {
  goals: Goal[];
}


/** Get all user projects */
export async function getProjects(sessionId: string) {
  return apiRequest<ProjectsResponse>(`/projects?session_id=${sessionId}`);
}

/** Get all user goals */
export async function getGoals(sessionId: string) {
  return apiRequest<GoalsResponse>(`/goals?session_id=${sessionId}`);
}


