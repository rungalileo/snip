import React, { useState, useMemo, useEffect } from 'react';
import { Story } from '../../types';
import { Member } from '../../types';
import { api } from '../../api';
import { StoryRow } from '../StoryRow';
import './UpcomingTickets.css';

const DATE_FILTERS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
];

const COMPLETED_STATES = [
  'Merged to Main',
  'Completed / In Prod',
  'Duplicate / Unneeded',
  'Needs Verification',
  'In Review',
];

interface EpicWithStories {
  id: number;
  name: string;
  app_url?: string;
  stories: Story[];
  story_count: number;
}

interface UpcomingTicketsProps {
  epics: EpicWithStories[];
  onStorySelect: (story: Story, allStories: Story[]) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const isCompletedStory = (story: Story): boolean => {
  return story.workflow_state?.name
    ? COMPLETED_STATES.includes(story.workflow_state.name)
    : false;
};

// Capitalize first letter of each word (for customer display)
const toInitCap = (str: string): string => {
  return str
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const CUSTOMER_LABEL_PREFIX = 'customer/';

// Extract customer from labels (format "customer/xxx" -> xxx, e.g. "customer/american-express" -> "american-express")
const extractCustomerFromLabels = (story: Story): string | null => {
  const customerLabel = story.labels?.find((label) =>
    label.name.toLowerCase().startsWith(CUSTOMER_LABEL_PREFIX)
  );
  if (customerLabel) {
    const value = customerLabel.name.slice(CUSTOMER_LABEL_PREFIX.length).trim();
    return value || null;
  }
  return null;
};

// Returns true if story has a customer label matching the given key (case-insensitive).
const storyMatchesCustomer = (story: Story, customerKey: string): boolean => {
  const customer = extractCustomerFromLabels(story);
  return !!customer && customer.toLowerCase() === customerKey.toLowerCase();
};

export const UpcomingTickets: React.FC<UpcomingTicketsProps> = ({
  epics,
  onStorySelect,
  onRefresh,
  refreshing = false,
}) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<number | null>(null);
  const [showCompletedByEpic, setShowCompletedByEpic] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const loadMembers = async () => {
      try {
        const data = await api.getMembers();
        setMembers(data);
      } catch (err) {
        console.error('Failed to load members:', err);
      }
    };
    loadMembers();
  }, []);

  const toggleShowCompleted = (epicId: number) => {
    setShowCompletedByEpic((prev) => ({
      ...prev,
      [epicId]: !prev[epicId],
    }));
  };

  // Unique owner IDs that appear in any story
  const ownerIdsInStories = useMemo(() => {
    const set = new Set<string>();
    epics.forEach((epic) => {
      epic.stories.forEach((s) => {
        s.owner_ids?.forEach((id) => set.add(id));
      });
    });
    return set;
  }, [epics]);

  // Owners that appear in stories (for dropdown), sorted by name
  const ownersForDropdown = useMemo(() => {
    return members
      .filter((m) => ownerIdsInStories.has(m.id))
      .sort((a, b) =>
        (a.profile?.name ?? '').localeCompare(b.profile?.name ?? '')
      );
  }, [members, ownerIdsInStories]);

  // Unique customers from story labels (customer/xxx), sorted
  const customersForDropdown = useMemo(() => {
    const set = new Set<string>();
    epics.forEach((epic) => {
      epic.stories.forEach((s) => {
        const customer = extractCustomerFromLabels(s);
        if (customer) set.add(customer);
      });
    });
    return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [epics]);

  // For each epic, filter its stories by owner, customer, date, and completed
  const epicsWithFilteredStories = useMemo(() => {
    return epics.map((epic) => {
      let stories = epic.stories;

      // Owner filter
      if (selectedOwnerId !== 'all') {
        stories = stories.filter(
          (s) => s.owner_ids && s.owner_ids.includes(selectedOwnerId)
        );
      }

      // Customer filter: only stories with label customer/<selectedCustomer> (e.g. customer/american-express)
      if (selectedCustomer !== 'all') {
        stories = stories.filter((s) => storyMatchesCustomer(s, selectedCustomer));
      }

      // Date filter
      if (selectedDateFilter !== null) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - selectedDateFilter);
        stories = stories.filter((s) => new Date(s.created_at) >= cutoffDate);
      }

      // Sort by created date (newest first)
      stories = [...stories].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Show completed toggle per epic
      const showCompleted = showCompletedByEpic[epic.id] ?? false;
      if (!showCompleted) {
        stories = stories.filter((s) => !isCompletedStory(s));
      }

      return { ...epic, stories };
    });
  }, [
    epics,
    selectedOwnerId,
    selectedCustomer,
    selectedDateFilter,
    showCompletedByEpic,
  ]);

  return (
    <div className="upcoming-tickets">
      <div className="upcoming-tickets-header">
        <h2>Upcoming Tickets</h2>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className={`refresh-btn ${refreshing ? 'refreshing' : ''}`}
            title="Refresh tickets"
            disabled={refreshing}
          >
            ↻ Refresh
          </button>
        )}
      </div>

      <div className="upcoming-tickets-filters">
        <div className="filter-group">
          <label htmlFor="owner-select">Owner:</label>
          <select
            id="owner-select"
            value={selectedOwnerId}
            onChange={(e) => setSelectedOwnerId(e.target.value)}
            className="owner-dropdown"
          >
            <option value="all">All</option>
            {ownersForDropdown.map((member) => (
              <option key={member.id} value={member.id}>
                {member.profile?.name ?? 'Unknown'}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="customer-select">Customer:</label>
          <select
            id="customer-select"
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            className="customer-dropdown"
          >
            <option value="all">All</option>
            {customersForDropdown.map((customer) => (
              <option key={customer} value={customer}>
                {toInitCap(customer)}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group date-filters">
          <label>Date Range:</label>
          <div className="date-filter-buttons">
            {DATE_FILTERS.map((filter) => (
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

      {(selectedOwnerId !== 'all' || selectedCustomer !== 'all' || selectedDateFilter !== null) && (
        <div className="upcoming-tickets-active-filters" role="status">
          {selectedCustomer !== 'all' && (
            <span className="filter-tag">
              Customer: <strong>{toInitCap(selectedCustomer)}</strong>
              <span className="filter-tag-hint"> (label: customer/{selectedCustomer})</span>
            </span>
          )}
          {selectedOwnerId !== 'all' && (
            <span className="filter-tag">
              Owner: <strong>{ownersForDropdown.find((m) => m.id === selectedOwnerId)?.profile?.name ?? selectedOwnerId}</strong>
            </span>
          )}
          {selectedDateFilter !== null && (
            <span className="filter-tag">
              Date: <strong>{DATE_FILTERS.find((f) => f.days === selectedDateFilter)?.label ?? `Last ${selectedDateFilter} days`}</strong>
            </span>
          )}
        </div>
      )}

      <div className="upcoming-tickets-sections">
        {epicsWithFilteredStories.map((epic) => (
          <section key={epic.id} className="ticket-section">
            <h3 className="section-header epic-section-header">
              <span className="section-title">
                <a
                  href={epic.app_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="epic-section-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {epic.name}
                </a>
                <span className="section-count">{epic.stories.length}</span>
              </span>
              <label className="show-completed-toggle">
                <input
                  type="checkbox"
                  checked={showCompletedByEpic[epic.id] ?? false}
                  onChange={() => toggleShowCompleted(epic.id)}
                />
                <span className="toggle-label">Show completed</span>
              </label>
            </h3>
            {epic.stories.length === 0 ? (
              <div className="no-tickets">No tickets</div>
            ) : (
              <div className="tickets-table">
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
                {epic.stories.map((story) => (
                  <StoryRow
                    key={story.id}
                    story={story}
                    onClick={() => onStorySelect(story, epic.stories)}
                    formatDate={formatDate}
                    showStatus
                    showAllOwners
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
};
