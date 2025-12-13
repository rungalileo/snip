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
  async generateReport(
    iterationId: number,
    stories: Story[],
    openaiKey: string,
    selectedTeams: string[],
    onProgress?: (progress: { stage: string; teamName?: string; current?: number; total?: number }) => void
  ): Promise<{
    report: string;
    metrics: any;
    team_metrics: any[];
    generated_at: string;
  }> {
    return new Promise((resolve, reject) => {
      // Use fetch with streaming for SSE support with POST
      fetch(`${API_BASE}/report/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          iterationId,
          stories,
          openaiKey,
          selectedTeams,
        }),
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          if (!reader) {
            throw new Error('Response body is not readable');
          }

          let buffer = '';

          const processStream = (): Promise<void> => {
            return reader.read().then(({ done, value }) => {
              if (done) {
                if (buffer.trim()) {
                  // Process remaining buffer
                  const lines = buffer.split('\n');
                  for (const line of lines) {
                    if (line.startsWith('data: ')) {
                      try {
                        const data = JSON.parse(line.slice(6));
                        if (data.error) {
                          reject(new Error(data.error + (data.details ? `: ${data.details}` : '')));
                          return Promise.resolve();
                        }
                        // Check if final data contains report
                        if (data.report) {
                          resolve({
                            report: data.report,
                            metrics: data.metrics,
                            team_metrics: data.team_metrics,
                            generated_at: data.generated_at,
                          });
                          return Promise.resolve();
                        }
                      } catch (e) {
                        console.error('Error parsing final SSE data:', e);
                      }
                    }
                  }
                }
                // If stream ends without report data, reject
                reject(new Error('Stream ended without receiving report data'));
                return Promise.resolve();
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    
                    if (data.error) {
                      reject(new Error(data.error + (data.details ? `: ${data.details}` : '')));
                      return Promise.resolve();
                    }

                    // If we receive report data, resolve the promise (final result)
                    if (data.report) {
                      resolve({
                        report: data.report,
                        metrics: data.metrics,
                        team_metrics: data.team_metrics,
                        generated_at: data.generated_at,
                      });
                      return Promise.resolve();
                    }

                    // Send progress updates
                    if (onProgress && data.stage) {
                      onProgress({
                        stage: data.stage,
                        teamName: data.teamName,
                        current: data.current,
                        total: data.total,
                      });
                    }
                  } catch (e) {
                    console.error('Error parsing SSE data:', e, line);
                  }
                }
              }

              return processStream();
            });
          };

          return processStream();
        })
        .catch(reject);
    });
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
