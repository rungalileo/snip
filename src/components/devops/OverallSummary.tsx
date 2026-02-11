import React from 'react';
import { Epic, Story } from '../../types';
import './OverallSummary.css';

interface OverallSummaryProps {
  data: {
    objective: any;
    epics: Array<Epic & { stories: Story[]; story_count: number }>;
    all_stories: Story[];
    total_stories: number;
    total_epics: number;
  };
}

const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
};

export const OverallSummary: React.FC<OverallSummaryProps> = ({ data }) => {
  const { objective, epics, total_stories, total_epics } = data;

  // Calculate aggregate metrics
  const completedStories = data.all_stories.filter(
    story => story.workflow_state?.type === 'done' || 
             story.workflow_state?.name?.toLowerCase().includes('complete') ||
             story.workflow_state?.name?.toLowerCase().includes('done')
  ).length;

  const inProgressStories = data.all_stories.filter(
    story => story.workflow_state?.type === 'started' ||
             story.workflow_state?.name?.toLowerCase().includes('in progress')
  ).length;

  const todoStories = total_stories - completedStories - inProgressStories;

  return (
    <div className="overall-summary">
      {/* Aggregate Metrics */}
      <div className="metrics-section">
        <h3 className="metrics-title">Aggregate Metrics</h3>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-value">{total_epics}</div>
            <div className="metric-label">Total Epics</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{total_stories}</div>
            <div className="metric-label">Total Stories</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{completedStories}</div>
            <div className="metric-label">Completed Stories</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{inProgressStories}</div>
            <div className="metric-label">In Progress</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{todoStories}</div>
            <div className="metric-label">To Do</div>
          </div>
        </div>
      </div>

      {/* Epic Cards */}
      <div className="epics-section">
        <h3 className="epics-title">Stories per Epic</h3>
        <div className="epics-grid">
          {epics.map((epic) => (
            <div key={epic.id} className="epic-card">
              <div className="epic-card-header">
                <h4 className="epic-card-title">
                  <a
                    href={epic.app_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="epic-link"
                  >
                    {epic.name}
                  </a>
                </h4>
                <div className="epic-story-count">{epic.story_count} {epic.story_count === 1 ? 'Story' : 'Stories'}</div>
              </div>
              {epic.description && (
                <div className="epic-card-description">
                  <p>{epic.description}</p>
                </div>
              )}
              <div className="epic-card-meta">
                {epic.planned_start_date && (
                  <div className="epic-meta-item">
                    <span className="epic-meta-label">Start:</span>
                    <span className="epic-meta-value">{formatDate(epic.planned_start_date)}</span>
                  </div>
                )}
                {(epic.planned_end_date || epic.deadline || epic.target_date) && (
                  <div className="epic-meta-item">
                    <span className="epic-meta-label">Target:</span>
                    <span className="epic-meta-value">
                      {formatDate(epic.planned_end_date || epic.deadline || epic.target_date)}
                    </span>
                  </div>
                )}
                {epic.state && (
                  <div className="epic-meta-item">
                    <span className="epic-meta-label">Status:</span>
                    <span className="epic-meta-value">{epic.state}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
