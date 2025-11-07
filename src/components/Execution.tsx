import React, { useState, useEffect, useMemo } from 'react';
import { Iteration, Story } from '../types';
import { api } from '../api';
import { BarChart } from './BarChart';
import { StackedBarChart } from './StackedBarChart';
import { StatusStackedBarChart } from './StatusStackedBarChart';
import { StoriesTableModal } from './StoriesTableModal';
import { useOwnerName } from '../hooks/useOwnerName';
import './Execution.css';

// Label categories from StoryModal
const LABEL_CATEGORIES = [
  'CUSTOMER ESCALATION',
  'BUG',
  'PRODUCT FEATURE',
  'TASK',
  'SMALL IMPROVEMENT',
  'CUSTOMER FEATURE REQUEST',
  'NICE TO HAVE',
  'FOUNDATIONAL WORK',
];

// Add "Other" category for unlabeled or uncategorized stories
const LABEL_CATEGORIES_WITH_OTHER = [...LABEL_CATEGORIES, 'OTHER'];

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

// Helper to get first name from a full name
const getFirstName = (name: string): string => {
  const words = name.trim().split(/\s+/);
  return words[0];
};

interface ExecutionProps {
  onStorySelect: (story: Story, stories: Story[]) => void;
  selectedIterationName?: string | null;
}

export const Execution: React.FC<ExecutionProps> = ({ onStorySelect, selectedIterationName }) => {
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
  const [copiedDeepLink, setCopiedDeepLink] = useState(false);
  const [showShareTooltip, setShowShareTooltip] = useState(false);

  useEffect(() => {
    loadIterations();
  }, [selectedIterationName]);

  useEffect(() => {
    if (selectedIterationId) {
      loadStories(selectedIterationId);
    }
  }, [selectedIterationId]);

  const loadIterations = async () => {
    try {
      setLoading(true);
      const data = await api.getIterations();

      // Ensure data is an array
      if (!Array.isArray(data)) {
        console.error('API returned non-array data for iterations:', data);
        setError('Failed to load iterations: Invalid data format');
        return;
      }

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

      // Auto-select iteration based on URL parameter or default behavior
      if (sortedIterations.length > 0) {
        let iterationToSelect = null;

        // If iteration name is provided in URL, find and select it
        if (selectedIterationName) {
          iterationToSelect = sortedIterations.find(
            iteration => iteration.name === selectedIterationName
          );
        }

        // If no URL parameter or iteration not found, use default auto-select logic
        if (!iterationToSelect) {
          // Find the current ongoing iteration
          const currentIteration = sortedIterations.find(iteration => {
            const startDate = new Date(iteration.start_date);
            const endDate = new Date(iteration.end_date);
            return now >= startDate && now <= endDate;
          });

          // Select current iteration if found, otherwise select the first (most recent)
          iterationToSelect = currentIteration || sortedIterations[0];
        }

        setSelectedIterationId(iterationToSelect.id);
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

      // Ensure data is an array
      if (!Array.isArray(data)) {
        console.error('API returned non-array data for stories:', data);
        setStories([]);
      } else {
        setStories(data);
      }

      // Load bookmarks
      const bookmarks = await api.getBookmarks();
      // Ensure bookmarks is an array
      if (Array.isArray(bookmarks)) {
        setBookmarkedIds(new Set(bookmarks.map(b => b.id)));
      } else {
        console.error('API returned non-array data for bookmarks:', bookmarks);
        setBookmarkedIds(new Set());
      }
    } catch (err) {
      console.error('Error loading stories for iteration:', err);
      setStories([]);
      setBookmarkedIds(new Set());
    } finally {
      setLoadingStories(false);
    }
  };

  const handleBarClick = (label: string, ownerId?: string, ownerName?: string) => {
    // Filter stories by label and optionally by owner
    const filteredStories = stories.filter(story => {
      // Special handling for "OTHER" category
      if (label === 'OTHER') {
        // Check if story has no matching labels
        const hasMatchingLabel = story.labels?.some(l => LABEL_CATEGORIES.includes(l.name));
        if (hasMatchingLabel) return false;
      } else {
        // Check if story has the label
        const hasLabel = story.labels?.some(l => l.name === label);
        if (!hasLabel) return false;
      }

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

  const handleStatusByOwnerClick = (ownerId: string, ownerName: string, status: 'completed' | 'inMotion' | 'notStarted') => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification'];
    const inMotionStates = ['In Development', 'In Review'];

    // Filter stories by owner and status
    const filteredStories = stories.filter(story => {
      // Check if story belongs to this owner
      const storyOwnerId = story.owner_ids && story.owner_ids.length > 0
        ? story.owner_ids[0]
        : 'unassigned';
      if (storyOwnerId !== ownerId) return false;

      // Check if story matches the status
      const stateName = story.workflow_state?.name || '';
      if (status === 'completed' && completedStates.includes(stateName)) return true;
      if (status === 'inMotion' && inMotionStates.includes(stateName)) return true;
      if (status === 'notStarted' && !completedStates.includes(stateName) && !inMotionStates.includes(stateName)) return true;

      return false;
    });

    // Set modal data
    const statusLabel = status === 'completed' ? 'Completed' : status === 'inMotion' ? 'In Motion' : 'Not Started';
    setModalTitle(`${ownerName} - ${statusLabel} (${filteredStories.length} stories)`);
    setModalStories(filteredStories);
    setIsModalOpen(true);
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
    LABEL_CATEGORIES_WITH_OTHER.forEach(label => {
      counts[label] = 0;
    });

    stories.forEach(story => {
      let hasMatchingLabel = false;
      if (story.labels && story.labels.length > 0) {
        story.labels.forEach(label => {
          if (LABEL_CATEGORIES.includes(label.name)) {
            counts[label.name] = (counts[label.name] || 0) + 1;
            hasMatchingLabel = true;
          }
        });
      }

      // If no matching label found, count as "OTHER"
      if (!hasMatchingLabel) {
        counts['OTHER'] = (counts['OTHER'] || 0) + 1;
      }
    });

    return LABEL_CATEGORIES_WITH_OTHER.map(label => ({
      label,
      count: counts[label] || 0,
    }));
  }, [stories]);

  // Calculate category percentages for all categories
  const categoryPercentages = useMemo(() => {
    const totalStories = stories.length;
    const percentages: Record<string, number> = {};

    LABEL_CATEGORIES_WITH_OTHER.forEach(category => {
      const count = overallLabelCounts.find(item => item.label === category)?.count || 0;
      percentages[category] = totalStories > 0 ? Math.round((count / totalStories) * 100) : 0;
    });

    return percentages;
  }, [stories, overallLabelCounts]);

  // Calculate status breakdown for each label category
  const statusByCategory = useMemo(() => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification'];
    const inMotionStates = ['In Development', 'In Review'];

    return LABEL_CATEGORIES.map(labelCategory => {
      // Filter stories with this label
      const labelStories = stories.filter(story =>
        story.labels?.some(l => l.name === labelCategory)
      );

      let completedCount = 0;
      let inMotionCount = 0;
      let notStartedCount = 0;

      labelStories.forEach(story => {
        const stateName = story.workflow_state?.name || '';
        if (completedStates.includes(stateName)) {
          completedCount++;
        } else if (inMotionStates.includes(stateName)) {
          inMotionCount++;
        } else {
          notStartedCount++;
        }
      });

      return {
        label: labelCategory,
        completedCount,
        inMotionCount,
        notStartedCount,
        totalCount: labelStories.length,
      };
    }).filter(item => item.totalCount > 0); // Only show categories with stories
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
        LABEL_CATEGORIES_WITH_OTHER.forEach(label => {
          ownerData[ownerId][label] = 0;
        });
      }

      // Check if story has any labels in our categories
      let hasMatchingLabel = false;
      if (story.labels && story.labels.length > 0) {
        story.labels.forEach(label => {
          if (LABEL_CATEGORIES.includes(label.name)) {
            ownerData[ownerId][label.name] = (ownerData[ownerId][label.name] || 0) + 1;
            hasMatchingLabel = true;
          }
        });
      }

      // If no matching label found, count as "OTHER"
      if (!hasMatchingLabel) {
        ownerData[ownerId]['OTHER'] = (ownerData[ownerId]['OTHER'] || 0) + 1;
      }
    });

    // Convert to array format for rendering
    return Object.entries(ownerData).map(([ownerId, counts]) => ({
      ownerId,
      data: LABEL_CATEGORIES_WITH_OTHER.map(label => ({
        label,
        count: counts[label] || 0,
      })),
    }));
  }, [stories]);

  // Calculate status breakdown for each owner (use same owner list as ownerLabelCounts)
  const statusByOwner = useMemo(() => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification'];
    const inMotionStates = ['In Development', 'In Review'];

    // Use the same owner IDs from ownerLabelCounts to ensure consistency
    return ownerLabelCounts.map(({ ownerId }) => {
      // Filter stories for this owner
      const ownerStories = stories.filter(story => {
        const storyOwnerId = story.owner_ids && story.owner_ids.length > 0
          ? story.owner_ids[0]
          : 'unassigned';
        return storyOwnerId === ownerId;
      });

      let completedCount = 0;
      let inMotionCount = 0;
      let notStartedCount = 0;

      ownerStories.forEach(story => {
        const stateName = story.workflow_state?.name || '';
        if (completedStates.includes(stateName)) {
          completedCount++;
        } else if (inMotionStates.includes(stateName)) {
          inMotionCount++;
        } else {
          notStartedCount++;
        }
      });

      return {
        ownerId,
        completedCount,
        inMotionCount,
        notStartedCount,
        totalCount: ownerStories.length,
      };
    }); // Don't filter - use same owners as ownerLabelCounts
  }, [stories, ownerLabelCounts]);

  // Get max count across all charts for consistent scale
  const maxCount = useMemo(() => {
    const allCounts = [
      ...overallLabelCounts.map(d => d.count),
      ...ownerLabelCounts.flatMap(owner => owner.data.map(d => d.count)),
    ];
    return Math.max(...allCounts, 1);
  }, [overallLabelCounts, ownerLabelCounts]);

  // Calculate progress percentages based on workflow states
  const progressStats = useMemo(() => {
    if (stories.length === 0) {
      return { completed: 0, inMotion: 0, notStarted: 0 };
    }

    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification'];
    const inMotionStates = ['In Development', 'In Review'];

    let completedCount = 0;
    let inMotionCount = 0;
    let notStartedCount = 0;

    stories.forEach(story => {
      const stateName = story.workflow_state?.name || '';
      if (completedStates.includes(stateName)) {
        completedCount++;
      } else if (inMotionStates.includes(stateName)) {
        inMotionCount++;
      } else {
        notStartedCount++;
      }
    });

    const total = stories.length;
    return {
      completed: Math.round((completedCount / total) * 100),
      inMotion: Math.round((inMotionCount / total) * 100),
      notStarted: Math.round((notStartedCount / total) * 100),
    };
  }, [stories]);

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

  const handleCopyDeepLink = () => {
    if (selectedIteration) {
      const iterationName = encodeURIComponent(selectedIteration.name);
      const url = `${window.location.origin}/iteration/${iterationName}`;
      navigator.clipboard.writeText(url);
      setCopiedDeepLink(true);
      setTimeout(() => setCopiedDeepLink(false), 2000);
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
        <div className="header-actions">
          <div
            className="share-button-wrapper"
            onMouseEnter={() => setShowShareTooltip(true)}
            onMouseLeave={() => setShowShareTooltip(false)}
          >
            <button
              className="share-button"
              onClick={handleCopyDeepLink}
              disabled={!selectedIteration}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              <span>Share</span>
            </button>
            {showShareTooltip && (
              <div className="share-tooltip">
                {copiedDeepLink ? "Link copied!" : "Copy link"}
              </div>
            )}
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
                <>
                  <span className="iteration-story-count">{stories.length} stories</span>
                  {stories.length > 0 && (
                    <div className="progress-stats">
                      <span className="progress-stat completed">
                        {progressStats.completed}% completed
                      </span>
                      <span className="progress-stat in-motion">
                        {progressStats.inMotion}% in motion
                      </span>
                      <span className="progress-stat not-started">
                        {progressStats.notStarted}% not started
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {loadingStories ? (
            <div className="loading-stories">Loading stories...</div>
          ) : (
            <>
              <div className="charts-side-by-side">
                {/* Overall iteration chart */}
                <div className="overall-chart-container">
                  <BarChart
                    data={overallLabelCounts}
                    title="Tickets by Category"
                    maxCount={maxCount}
                    onBarClick={(label) => handleBarClick(label)}
                    categoryPercentages={categoryPercentages}
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

              {/* Status breakdown charts */}
              <div className="charts-side-by-side">
                {/* Status by Category */}
                {statusByCategory.length > 0 && (
                  <div className="overall-chart-container">
                    <StatusStackedBarChart
                      data={statusByCategory}
                      title="Status by Category"
                    />
                  </div>
                )}

                {/* Status by Owner */}
                {statusByOwner.length > 0 && (
                  <div className="owner-stacked-section">
                    <StatusByOwnerWrapper
                      statusByOwner={statusByOwner}
                      onBarClick={handleStatusByOwnerClick}
                    />
                  </div>
                )}
              </div>
            </>
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
      title="Tickets by Owner"
      onBarClick={onBarClick}
    />
  );
};

// Component to display status breakdown by owner
const StatusByOwnerWrapper: React.FC<{
  statusByOwner: Array<{
    ownerId: string;
    completedCount: number;
    inMotionCount: number;
    notStartedCount: number;
    totalCount: number;
  }>;
  onBarClick: (ownerId: string, ownerName: string, status: 'completed' | 'inMotion' | 'notStarted') => void;
}> = ({ statusByOwner, onBarClick }) => {
  // Call useOwnerName for each owner (hooks must be called in consistent order)
  const ownerNames = statusByOwner.map(({ ownerId }) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useOwnerName(ownerId === 'unassigned' ? undefined : ownerId)
  );

  // Transform data for status stacked bar chart
  const statusData = statusByOwner.map(({ ownerId, completedCount, inMotionCount, notStartedCount, totalCount }, index) => {
    const ownerName = ownerNames[index];
    const initials = getInitials(ownerName);

    return {
      label: initials,
      fullName: ownerName,
      ownerId,
      completedCount,
      inMotionCount,
      notStartedCount,
      totalCount,
    };
  });

  const handleClick = (label: string, status: 'completed' | 'inMotion' | 'notStarted') => {
    const item = statusData.find(d => d.label === label);
    if (item) {
      onBarClick(item.ownerId, item.fullName, status);
    }
  };

  return (
    <StatusStackedBarChart
      data={statusData}
      title="Status by Owner"
      onBarClick={handleClick}
    />
  );
};
