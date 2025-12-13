import axios from 'axios';
import { Epic, Story, Member, Iteration, Group } from './types';

const API_BASE = '/api';

export const api = {
  async getEpics(): Promise<Epic[]> {
    const response = await axios.get(`${API_BASE}/epics`);
    return response.data;
  },

  async getIterations(includeAll: boolean = false): Promise<Iteration[]> {
    const response = await axios.get(`${API_BASE}/iterations`, {
      params: { includeAll: includeAll.toString() }
    });
    return response.data;
  },

  async getStoriesForIteration(iterationId: number): Promise<Story[]> {
    const response = await axios.get(`${API_BASE}/iterations/${iterationId}/stories`);
    return response.data;
  },

  async getStoriesForEpic(epicId: number): Promise<Story[]> {
    const response = await axios.get(`${API_BASE}/epics/${epicId}/stories`);
    return response.data;
  },

  async getStory(storyId: number): Promise<Story> {
    const response = await axios.get(`${API_BASE}/stories/${storyId}`);
    return response.data;
  },

  async getMember(memberId: string): Promise<Member> {
    const response = await axios.get(`${API_BASE}/members/${memberId}`);
    return response.data;
  },

  async getGroups(): Promise<Group[]> {
    const response = await axios.get(`${API_BASE}/groups`);
    return response.data;
  },

  async getGroup(groupId: string): Promise<Group> {
    const response = await axios.get(`${API_BASE}/groups/${groupId}`);
    return response.data;
  },

  async addLabelToStory(storyId: number, labelName: string): Promise<Story> {
    const response = await axios.post(`${API_BASE}/stories/${storyId}/labels`, {
      labelName,
    });
    return response.data;
  },

  async removeLabelFromStory(storyId: number, labelId: number): Promise<Story> {
    const response = await axios.delete(`${API_BASE}/stories/${storyId}/labels/${labelId}`);
    return response.data;
  },

  async updateStoryPriority(storyId: number, priority: string): Promise<Story> {
    const response = await axios.put(`${API_BASE}/stories/${storyId}/priority`, {
      priority,
    });
    return response.data;
  },

  async addCommentToStory(storyId: number, text: string): Promise<void> {
    await axios.post(`${API_BASE}/stories/${storyId}/comments`, {
      text,
    });
  },

  // Bookmark APIs
  async getBookmarks(): Promise<Story[]> {
    const response = await axios.get(`${API_BASE}/bookmarks`);
    return response.data;
  },

  async checkBookmark(storyId: number): Promise<boolean> {
    const response = await axios.get(`${API_BASE}/bookmarks/check/${storyId}`);
    return response.data.isBookmarked;
  },

  async addBookmark(story: Story): Promise<void> {
    await axios.post(`${API_BASE}/bookmarks`, story);
  },

  async removeBookmark(storyId: number): Promise<void> {
    await axios.delete(`${API_BASE}/bookmarks/${storyId}`);
  },

  // Epic Bookmark APIs
  async getEpicBookmarks(): Promise<Epic[]> {
    const response = await axios.get(`${API_BASE}/epics/bookmarks`);
    return response.data;
  },

  async checkEpicBookmark(epicId: number): Promise<boolean> {
    const response = await axios.get(`${API_BASE}/epics/bookmarks/check/${epicId}`);
    return response.data.isBookmarked;
  },

  async addEpicBookmark(epic: Epic): Promise<void> {
    await axios.post(`${API_BASE}/epics/bookmarks`, epic);
  },

  async removeEpicBookmark(epicId: number): Promise<void> {
    await axios.delete(`${API_BASE}/epics/bookmarks/${epicId}`);
  },

  // AI Report APIs
  async generateReport(iterationId: number, stories: Story[], openaiKey: string): Promise<{
    report: string;
    metrics: any;
    team_metrics: any[];
    generated_at: string;
  }> {
    const response = await axios.post(`${API_BASE}/report/generate`, {
      iterationId,
      stories,
      openaiKey,
    });
    return response.data; // Now returns { report, metrics, team_metrics, generated_at }
  },

  async getReport(iterationId: number): Promise<{
    iteration_id: number;
    iteration_name: string;
    report_content: string;
    metrics: any;
    team_metrics: any[];
    generated_at: string;
  }> {
    const response = await axios.get(`${API_BASE}/report/${iterationId}`);
    return response.data;
  },

  async getReportHistory(iterationId: number, limit: number = 10): Promise<{
    iteration_id: number;
    reports: Array<{
      report_content: string;
      metrics: any;
      team_metrics: any[];
      generated_at: string;
    }>;
    total_count: number;
  }> {
    const response = await axios.get(`${API_BASE}/report/${iterationId}/history?limit=${limit}`);
    return response.data;
  },

  async getIteration(iterationId: number): Promise<Iteration> {
    const response = await axios.get(`${API_BASE}/iterations/${iterationId}`);
    return response.data;
  },
};
