import React, { useState, useEffect, useMemo } from 'react';
import { Iteration, Story } from '../types';
import { api } from '../api';
import { BarChart } from './BarChart';
import { StackedBarChart } from './StackedBarChart';
import { StoriesTableModal } from './StoriesTableModal';
import { useOwnerName } from '../hooks/useOwnerName';
import './Execution.css';

// Label categories from StoryModal
const LABEL_CATEGORIES = [
  'CUSTOMER ESCALATION',
  'BUG',
  'FOUNDATIONAL WORK',
  'PRODUCT FEATURE',
  'TASK',
  'VIBE-CODEABLE',
  'CUSTOMER FEATURE REQUEST',
  'NICE TO HAVE',
];

// Helper to get initials from a name
const getInitials = (name: string): string => {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();
};

interface ExecutionProps {
  onStorySelect: (story: Story, stories: Story[]) => void;
}

export const Execution: React.FC<ExecutionProps> = ({ onStorySelect }) => {
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [selectedIterationId, setSelectedIterationId] = useState<number | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStories, setLoadingStories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [modalStories, setModalStories] = useState<Story[]>([]);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadIterations();
  }, []);

  useEffect(() => {
    if (selectedIterationId) {
      loadStories(selectedIterationId);
    }
  }, [selectedIterationId]);

  const loadIterations = async () => {
    try {
      setLoading(true);
      const data = await api.getIterations();

      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);

      // Filter iterations to show:
      // 1. Present sprints (current date is between start and end)
      // 2. Future sprints (start date is after current date)
      // 3. Past sprints from last 30 days (end date is within last 30 days)
      const filteredIterations = data.filter(iteration => {
        const startDate = new Date(iteration.start_date);
        const endDate = new Date(iteration.end_date);

        // Present sprint: current date is between start and end
        const isPresent = now >= startDate && now <= endDate;

        // Future sprint: start date is after now
        const isFuture = startDate > now;

        // Recent past sprint: ended within last 30 days
        const isRecentPast = endDate < now && endDate >= thirtyDaysAgo;

        return isPresent || isFuture || isRecentPast;
      });

      // Sort iterations by start date (most recent first)
      const sortedIterations = filteredIterations.sort((a, b) =>
        new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      );

      setIterations(sortedIterations);

      // Auto-select the first iteration if available
      if (sortedIterations.length > 0) {
        setSelectedIterationId(sortedIterations[0].id);
      }
    } catch (err) {
      setError('Failed to load iterations');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadStories = async (iterationId: number) => {
    try {
      setLoadingStories(true);
      const data = await api.getStoriesForIteration(iterationId);
      setStories(data);

      // Load bookmarks
      const bookmarks = await api.getBookmarks();
      setBookmarkedIds(new Set(bookmarks.map(b => b.id)));
    } catch (err) {
      console.error('Error loading stories for iteration:', err);
      setStories([]);
    } finally {
      setLoadingStories(false);
    }
  };

  const handleBarClick = (label: string, ownerId?: string, ownerName?: string) => {
    // Filter stories by label and optionally by owner
    const filteredStories = stories.filter(story => {
      // Check if story has the label
      const hasLabel = story.labels?.some(l => l.name === label);
      if (!hasLabel) return false;

      // If ownerId is specified, check owner matches
      if (ownerId !== undefined) {
        const storyOwnerId = story.owner_ids && story.owner_ids.length > 0
          ? story.owner_ids[0]
          : 'unassigned';
        return storyOwnerId === ownerId;
      }

      return true;
    });

    // Set modal data
    const ownerSuffix = ownerName ? ` - ${ownerName}` : '';

    setModalTitle(`${label}${ownerSuffix} (${filteredStories.length} stories)`);
    setModalStories(filteredStories);
    setIsModalOpen(true);
  };

  const handleStackedBarClick = (ownerId: string, label: string) => {
    // Get owner name for the modal title
    const ownerData = ownerLabelCounts.find(o => o.ownerId === ownerId);
    if (!ownerData) return;

    handleBarClick(label, ownerId, undefined);
  };

  const handleIterationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const iterationId = parseInt(e.target.value);
    setSelectedIterationId(iterationId);
  };

  const selectedIteration = iterations.find(it => it.id === selectedIterationId);
  const currentIterationIndex = iterations.findIndex(it => it.id === selectedIterationId);

  const handlePreviousIteration = () => {
    if (currentIterationIndex < iterations.length - 1) {
      setSelectedIterationId(iterations[currentIterationIndex + 1].id);
    }
  };

  const handleNextIteration = () => {
    if (currentIterationIndex > 0) {
      setSelectedIterationId(iterations[currentIterationIndex - 1].id);
    }
  };

  // Calculate label counts for all stories
  const overallLabelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    LABEL_CATEGORIES.forEach(label => {
      counts[label] = 0;
    });

    stories.forEach(story => {
      if (story.labels && story.labels.length > 0) {
        story.labels.forEach(label => {
          if (LABEL_CATEGORIES.includes(label.name)) {
            counts[label.name] = (counts[label.name] || 0) + 1;
          }
        });
      }
    });

    return LABEL_CATEGORIES.map(label => ({
      label,
      count: counts[label] || 0,
    }));
  }, [stories]);

  // Calculate label counts per owner
  const ownerLabelCounts = useMemo(() => {
    const ownerData: Record<string, Record<string, number>> = {};

    stories.forEach(story => {
      const ownerId = story.owner_ids && story.owner_ids.length > 0
        ? story.owner_ids[0]
        : 'unassigned';

      if (!ownerData[ownerId]) {
        ownerData[ownerId] = {};
        LABEL_CATEGORIES.forEach(label => {
          ownerData[ownerId][label] = 0;
        });
      }

      if (story.labels && story.labels.length > 0) {
        story.labels.forEach(label => {
          if (LABEL_CATEGORIES.includes(label.name)) {
            ownerData[ownerId][label.name] = (ownerData[ownerId][label.name] || 0) + 1;
          }
        });
      }
    });

    // Convert to array format for rendering
    return Object.entries(ownerData).map(([ownerId, counts]) => ({
      ownerId,
      data: LABEL_CATEGORIES.map(label => ({
        label,
        count: counts[label] || 0,
      })),
    }));
  }, [stories]);

  // Get max count across all charts for consistent scale
  const maxCount = useMemo(() => {
    const allCounts = [
      ...overallLabelCounts.map(d => d.count),
      ...ownerLabelCounts.flatMap(owner => owner.data.map(d => d.count)),
    ];
    return Math.max(...allCounts, 1);
  }, [overallLabelCounts, ownerLabelCounts]);

  if (loading) {
    return (
      <div className="execution-view">
        <div className="execution-loading">Loading iterations...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="execution-view">
        <div className="execution-error">{error}</div>
      </div>
    );
  }

  const handleRefresh = () => {
    if (selectedIterationId) {
      loadStories(selectedIterationId);
    }
  };

  return (
    <div className="execution-view">
      <div className="execution-header">
        <div className="iteration-navigator">
          <button
            className="nav-arrow-btn"
            onClick={handlePreviousIteration}
            disabled={currentIterationIndex >= iterations.length - 1 || loadingStories}
            title="Previous iteration"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <div className="current-iteration">
            {selectedIteration ? (
              <span className="iteration-name">{selectedIteration.name}</span>
            ) : (
              <span className="iteration-name">No iterations available</span>
            )}
          </div>
          <button
            className="nav-arrow-btn"
            onClick={handleNextIteration}
            disabled={currentIterationIndex <= 0 || loadingStories}
            title="Next iteration"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
        <button
          className="refresh-button"
          onClick={handleRefresh}
          disabled={!selectedIterationId || loadingStories}
          title="Refresh stories"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>

      {selectedIteration && (
        <div className="execution-content">
          <div className="iteration-details">
            <h2>{selectedIteration.name}</h2>
            {selectedIteration.description && (
              <p className="iteration-description">{selectedIteration.description}</p>
            )}
            <div className="iteration-meta">
              <span className="iteration-dates">
                {new Date(selectedIteration.start_date).toLocaleDateString()} - {new Date(selectedIteration.end_date).toLocaleDateString()}
              </span>
              <span className="iteration-status">{selectedIteration.status}</span>
              {!loadingStories && (
                <span className="iteration-story-count">{stories.length} stories</span>
              )}
            </div>
          </div>

          {loadingStories ? (
            <div className="loading-stories">Loading stories...</div>
          ) : (
            <div className="charts-side-by-side">
              {/* Overall iteration chart */}
              <div className="overall-chart-container">
                <BarChart
                  data={overallLabelCounts}
                  title="By Category"
                  maxCount={maxCount}
                  onBarClick={(label) => handleBarClick(label)}
                />
              </div>

              {/* Owner stacked chart */}
              {ownerLabelCounts.length > 0 && (
                <div className="owner-stacked-section">
                  <OwnerStackedChartWrapper
                    ownerLabelCounts={ownerLabelCounts}
                    onBarClick={handleStackedBarClick}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stories table modal */}
      {isModalOpen && (
        <StoriesTableModal
          stories={modalStories}
          title={modalTitle}
          onClose={() => setIsModalOpen(false)}
          onStorySelect={onStorySelect}
          bookmarkedIds={bookmarkedIds}
        />
      )}
    </div>
  );
};

// Component to display stacked bar chart with owner names
const OwnerStackedChartWrapper: React.FC<{
  ownerLabelCounts: Array<{
    ownerId: string;
    data: { label: string; count: number }[];
  }>;
  onBarClick: (ownerId: string, label: string) => void;
}> = ({ ownerLabelCounts, onBarClick }) => {
  // Call useOwnerName for each owner (hooks must be called in consistent order)
  const ownerNames = ownerLabelCounts.map(({ ownerId }) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useOwnerName(ownerId === 'unassigned' ? undefined : ownerId)
  );

  // Transform data for stacked bar chart
  const stackedData = ownerLabelCounts.map(({ ownerId, data }, index) => {
    const ownerName = ownerNames[index];
    const totalCount = data.reduce((sum, item) => sum + item.count, 0);
    const initials = getInitials(ownerName);

    return {
      ownerId,
      ownerName,
      initials,
      labelCounts: data,
      totalCount,
    };
  });

  return (
    <StackedBarChart
      data={stackedData}
      title="By Owner"
      onBarClick={onBarClick}
    />
  );
};
