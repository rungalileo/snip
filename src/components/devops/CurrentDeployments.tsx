import React, { useState, useEffect } from 'react';
import { Story } from '../../types';
import { api } from '../../api';
import { StoryRow } from '../StoryRow';
import './CurrentDeployments.css';

const CURRENT_DEPLOYMENTS_EPIC_ID = 36354;
const EPIC_APP_URL = 'https://app.shortcut.com/galileo/epic/36354';

interface CurrentDeploymentsProps {
  onStorySelect: (story: Story, allStories: Story[]) => void;
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const CurrentDeployments: React.FC<CurrentDeploymentsProps> = ({
  onStorySelect,
}) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStories = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await api.getStoriesForEpic(CURRENT_DEPLOYMENTS_EPIC_ID);
      const sorted = (data || []).sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setStories(sorted);
    } catch (err: any) {
      console.error('Failed to load Current Deployments:', err);
      setError(err.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStories();
  }, []);

  if (loading) {
    return (
      <div className="current-deployments">
        <div className="current-deployments-loading">
          Loading Current Deployments...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="current-deployments">
        <div className="current-deployments-error">
          <p>{error}</p>
          <button onClick={() => loadStories()} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="current-deployments">
      <div className="current-deployments-header">
        <h2>Current Deployments</h2>
        <a
          href={EPIC_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="epic-link-header"
        >
          View Epic in Shortcut →
        </a>
        <button
          onClick={() => loadStories(true)}
          className={`refresh-btn ${refreshing ? 'refreshing' : ''}`}
          title="Refresh"
          disabled={refreshing}
        >
          ↻ Refresh
        </button>
      </div>

      <p className="current-deployments-intro">
        Tickets from the Current Deployments epic (
        <a
          href={EPIC_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="epic-link-inline"
        >
          Epic 36354
        </a>
        ). {stories.length} ticket{stories.length !== 1 ? 's' : ''}.
      </p>

      {stories.length === 0 ? (
        <div className="no-tickets">No tickets in this epic.</div>
      ) : (
        <div className="current-deployments-table tickets-table">
          <div className="tickets-table-header">
            <div className="col-priority">Priority</div>
            <div className="col-title">Title</div>
            <div className="col-owner">Owners</div>
            <div className="col-status">Status</div>
            <div className="col-labels-header" aria-hidden="true">
              Labels
            </div>
            <div className="col-date">Created</div>
            <div className="col-link">Link</div>
          </div>
          {stories.map((story) => (
            <StoryRow
              key={story.id}
              story={story}
              onClick={() => onStorySelect(story, stories)}
              formatDate={formatDate}
              showStatus
            />
          ))}
        </div>
      )}
    </div>
  );
};
