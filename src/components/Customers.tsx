import React, { useState, useEffect, useMemo } from 'react';
import { Story } from '../types';
import { api } from '../api';
import { StoryRow } from './StoryRow';
import './Customers.css';

const CUSTOMER_TICKETS_EPIC_ID = 34714;

// Completed states for tickets
const COMPLETED_STATES = [
  'Merged to Main',
  'Completed / In Prod',
  'Duplicate / Unneeded',
  'Needs Verification',
  'In Review'
];

// Date filter options
const DATE_FILTERS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
];

interface CustomersProps {
  onStorySelect: (story: Story, allStories: Story[]) => void;
}

// Helper to capitalize first letter of each word
const toInitCap = (str: string): string => {
  return str
    .split(/[\s_-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Helper to check if a story has a label (case-insensitive)
const hasLabelCaseInsensitive = (story: Story, labelName: string): boolean => {
  return story.labels?.some(
    label => label.name.toLowerCase() === labelName.toLowerCase()
  ) ?? false;
};

// Helper to extract customer name from label (looks for "customer/xxx" label)
const extractCustomerFromLabels = (story: Story): string => {
  const customerLabel = story.labels?.find(
    label => label.name.toLowerCase().startsWith('customer/')
  );
  if (customerLabel) {
    return toInitCap(customerLabel.name.slice('customer/'.length));
  }
  return 'Unknown';
};

// Helper to check if a story is in a completed state
const isCompletedStory = (story: Story): boolean => {
  return story.workflow_state?.name
    ? COMPLETED_STATES.includes(story.workflow_state.name)
    : false;
};

export const Customers: React.FC<CustomersProps> = ({ onStorySelect }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<number | null>(null); // null = all time
  const [refreshing, setRefreshing] = useState(false);
  const [showCompletedEscalations, setShowCompletedEscalations] = useState(false);
  const [showCompletedAgreements, setShowCompletedAgreements] = useState(false);
  const [showCompletedFeatureRequests, setShowCompletedFeatureRequests] = useState(false);

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const data = await api.getStoriesForEpic(CUSTOMER_TICKETS_EPIC_ID);
      // Sort by created date (newest first)
      const sortedStories = data.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setStories(sortedStories);
    } catch (err) {
      setError('Failed to load customer tickets');
      console.error(err);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  // Extract unique customer names from stories
  const customers = useMemo(() => {
    const customerSet = new Set<string>();
    stories.forEach(story => {
      const customer = extractCustomerFromLabels(story);
      if (customer !== 'Unknown') {
        customerSet.add(customer);
      }
    });
    return Array.from(customerSet).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }, [stories]);

  // Filter stories by selected customer and date
  const filteredStories = useMemo(() => {
    let filtered = stories;

    // Filter by customer
    if (selectedCustomer !== 'all') {
      filtered = filtered.filter(story => {
        const customer = extractCustomerFromLabels(story);
        return customer.toLowerCase() === selectedCustomer.toLowerCase();
      });
    }

    // Filter by date
    if (selectedDateFilter !== null) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - selectedDateFilter);
      filtered = filtered.filter(story =>
        new Date(story.created_at) >= cutoffDate
      );
    }

    return filtered;
  }, [stories, selectedCustomer, selectedDateFilter]);

  // Categorize filtered stories
  const escalations = useMemo(() => {
    let stories = filteredStories.filter(story => hasLabelCaseInsensitive(story, 'customer escalation'));
    if (!showCompletedEscalations) {
      stories = stories.filter(story => !isCompletedStory(story));
    }
    return stories;
  }, [filteredStories, showCompletedEscalations]);

  const contractualAgreements = useMemo(() => {
    let stories = filteredStories.filter(story => hasLabelCaseInsensitive(story, 'customer commitment'));
    if (!showCompletedAgreements) {
      stories = stories.filter(story => !isCompletedStory(story));
    }
    return stories;
  }, [filteredStories, showCompletedAgreements]);

  const featureRequests = useMemo(() => {
    let stories = filteredStories.filter(story => hasLabelCaseInsensitive(story, 'customer feature request'));
    if (!showCompletedFeatureRequests) {
      stories = stories.filter(story => !isCompletedStory(story));
    }
    return stories;
  }, [filteredStories, showCompletedFeatureRequests]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleRefresh = () => {
    loadStories(true);
  };

  if (loading) {
    return <div className="customers-loading">Loading customer tickets...</div>;
  }

  if (error) {
    return <div className="customers-error">{error}</div>;
  }

  return (
    <div className="customers">
      <div className="customers-header">
        <h2>Customer Tickets</h2>
        <button
          onClick={handleRefresh}
          className={`refresh-btn ${refreshing ? 'refreshing' : ''}`}
          title="Refresh tickets"
          disabled={refreshing}
        >
          ↻ Refresh
        </button>
      </div>

      <div className="customers-filters">
        <div className="filter-group">
          <label htmlFor="customer-select">Customer:</label>
          <select
            id="customer-select"
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            className="customer-dropdown"
          >
            <option value="all">All</option>
            {customers.map(customer => (
              <option key={customer} value={customer}>
                {toInitCap(customer)}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group date-filters">
          <label>Date Range:</label>
          <div className="date-filter-buttons">
            {DATE_FILTERS.map(filter => (
              <button
                key={filter.label}
                className={`date-filter-btn ${selectedDateFilter === filter.days ? 'active' : ''}`}
                onClick={() => setSelectedDateFilter(filter.days)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="customers-sections">
        {/* Escalations Section */}
        <section className="ticket-section">
          <h3 className="section-header escalation-header">
            <span className="section-title">
              Escalations
              <span className="section-count">{escalations.length}</span>
            </span>
            <label className="show-completed-toggle">
              <input
                type="checkbox"
                checked={showCompletedEscalations}
                onChange={(e) => setShowCompletedEscalations(e.target.checked)}
              />
              <span className="toggle-label">Show completed</span>
            </label>
          </h3>
          {escalations.length === 0 ? (
            <div className="no-tickets">No tickets</div>
          ) : (
            <div className="tickets-table">
              <div className="tickets-table-header">
                <div className="col-priority">Priority</div>
                <div className="col-customer">Customer</div>
                <div className="col-title">Title</div>
                <div className="col-owner">Owner</div>
                <div className="col-status">Status</div>
                <div className="col-date">Created</div>
                <div className="col-link">Link</div>
              </div>
              {escalations.map(story => (
                <StoryRow
                  key={story.id}
                  story={story}
                  onClick={() => onStorySelect(story, escalations)}
                  formatDate={formatDate}
                  customer={extractCustomerFromLabels(story)}
                  showStatus
                />
              ))}
            </div>
          )}
        </section>

        {/* Contractual Agreements Section */}
        <section className="ticket-section">
          <h3 className="section-header commitment-header">
            <span className="section-title">
              Contractual Agreements
              <span className="section-count">{contractualAgreements.length}</span>
            </span>
            <label className="show-completed-toggle">
              <input
                type="checkbox"
                checked={showCompletedAgreements}
                onChange={(e) => setShowCompletedAgreements(e.target.checked)}
              />
              <span className="toggle-label">Show completed</span>
            </label>
          </h3>
          {contractualAgreements.length === 0 ? (
            <div className="no-tickets">No tickets</div>
          ) : (
            <div className="tickets-table">
              <div className="tickets-table-header">
                <div className="col-priority">Priority</div>
                <div className="col-customer">Customer</div>
                <div className="col-title">Title</div>
                <div className="col-owner">Owner</div>
                <div className="col-status">Status</div>
                <div className="col-date">Created</div>
                <div className="col-link">Link</div>
              </div>
              {contractualAgreements.map(story => (
                <StoryRow
                  key={story.id}
                  story={story}
                  onClick={() => onStorySelect(story, contractualAgreements)}
                  formatDate={formatDate}
                  customer={extractCustomerFromLabels(story)}
                  showStatus
                />
              ))}
            </div>
          )}
        </section>

        {/* Feature Requests Section */}
        <section className="ticket-section">
          <h3 className="section-header feature-header">
            <span className="section-title">
              Feature Requests
              <span className="section-count">{featureRequests.length}</span>
            </span>
            <label className="show-completed-toggle">
              <input
                type="checkbox"
                checked={showCompletedFeatureRequests}
                onChange={(e) => setShowCompletedFeatureRequests(e.target.checked)}
              />
              <span className="toggle-label">Show completed</span>
            </label>
          </h3>
          {featureRequests.length === 0 ? (
            <div className="no-tickets">No tickets</div>
          ) : (
            <div className="tickets-table">
              <div className="tickets-table-header">
                <div className="col-priority">Priority</div>
                <div className="col-customer">Customer</div>
                <div className="col-title">Title</div>
                <div className="col-owner">Owner</div>
                <div className="col-status">Status</div>
                <div className="col-date">Created</div>
                <div className="col-link">Link</div>
              </div>
              {featureRequests.map(story => (
                <StoryRow
                  key={story.id}
                  story={story}
                  onClick={() => onStorySelect(story, featureRequests)}
                  formatDate={formatDate}
                  customer={extractCustomerFromLabels(story)}
                  showStatus
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
