import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Story, Epic } from '../types';
import { OverallSummary } from './devops/OverallSummary';
import { UpcomingTickets } from './devops/UpcomingTickets';
import { CurrentDeployments } from './devops/CurrentDeployments';
import './DevOpsEngagement.css';

interface DevOpsEngagementProps {
  onStorySelect: (story: Story, allStories: Story[]) => void;
}

type SubTab = 'overall-summary' | 'upcoming-tickets' | 'devops-mapping' | 'current-deployments';

export const DevOpsEngagement: React.FC<DevOpsEngagementProps> = ({ onStorySelect }) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('overall-summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    objective: any;
    epics: Array<Epic & { stories: Story[]; story_count: number }>;
    all_stories: Story[];
    total_stories: number;
    total_epics: number;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getDevOpsEngagement();
      setData(response);
    } catch (err: any) {
      console.error('Failed to load DevOps Engagement data:', err);
      setError(err.message || 'Failed to load DevOps Engagement data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="devops-engagement">
        <div className="devops-loading">Loading DevOps Engagement data...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="devops-engagement">
        <div className="devops-error">
          <p>Error: {error || 'Failed to load data'}</p>
          <button onClick={loadData} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="devops-engagement">
      <div className="devops-header">
        <h2>DevOps Engagement</h2>
        <button onClick={loadData} className="refresh-button" title="Refresh">
          ↻
        </button>
      </div>

      <div className="devops-sub-tabs">
        <button
          className={`sub-tab-btn ${activeSubTab === 'overall-summary' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('overall-summary')}
        >
          Overall Summary
        </button>
        <button
          className={`sub-tab-btn ${activeSubTab === 'upcoming-tickets' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('upcoming-tickets')}
        >
          Upcoming Tickets
        </button>
        <button
          className={`sub-tab-btn ${activeSubTab === 'devops-mapping' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('devops-mapping')}
        >
          DevOps Mapping
        </button>
        <button
          className={`sub-tab-btn ${activeSubTab === 'current-deployments' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('current-deployments')}
        >
          Current Deployments
        </button>
      </div>

      <div className="devops-content">
        {activeSubTab === 'overall-summary' && (
          <OverallSummary data={data} />
        )}
        {activeSubTab === 'upcoming-tickets' && (
          <UpcomingTickets
            epics={data.epics}
            onStorySelect={onStorySelect}
            onRefresh={loadData}
            refreshing={false}
          />
        )}
        {activeSubTab === 'devops-mapping' && (
          <div className="devops-mapping-placeholder">
            <p className="devops-mapping-message">
              For DevOps Mapping, please head to the Aegis Dashboard.
            </p>
            <a
              href="https://aegis.platform.galileo.ai/clusters"
              target="_blank"
              rel="noopener noreferrer"
              className="devops-mapping-link"
            >
              Aegis Dashboard – Clusters
            </a>
          </div>
        )}
        {activeSubTab === 'current-deployments' && (
          <CurrentDeployments onStorySelect={onStorySelect} />
        )}
      </div>
    </div>
  );
};
