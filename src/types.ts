export interface Epic {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  completed: boolean;
  app_url: string;
  active_story_count?: number;
}

export interface CustomField {
  field_id: string;
  value?: string;
  value_id?: string;
}

export interface WorkflowState {
  id: number;
  name: string;
  type: string;
}

export interface Story {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  workflow_state_id: number;
  workflow_state?: WorkflowState;
  iteration_id?: number;
  iteration?: Iteration;
  owner_ids: string[];
  requested_by_id: string;
  epic_id: number;
  group_id?: string;
  app_url: string;
  completed: boolean;
  completed_at?: string;
  labels: Label[];
  custom_fields?: CustomField[];
}

export interface Label {
  id: number;
  name: string;
  color?: string;
  description?: string;
}

export interface Member {
  id: string;
  profile: {
    name: string;
    email_address: string;
  };
}

export interface Group {
  id: string;
  name: string;
  mention_name: string;
  member_ids?: string[];
}

export interface Iteration {
  id: number;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  app_url?: string;
}

export interface PlanningStats {
  planned: {
    count: number;
    percent: number;
    storyIds: number[];
    completedCount: number;
    completionRate: number;
  };
  unplanned: {
    count: number;
    percent: number;
    storyIds: number[];
    completedCount: number;
    completionRate: number;
  };
  iterationStartDate: string;
}

export interface Objective {
  id: number;
  name: string;
  description: string;
  start_date?: string;
  target_date?: string;
  status: string;
  app_url: string;
  created_at: string;
  updated_at: string;
  custom_fields?: CustomField[];
}

export interface EpicWithDetails extends Epic {
  start_date?: string;
  target_date?: string;
  status?: string;
  teams?: Group[];
  owners?: Member[];
}
