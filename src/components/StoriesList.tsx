import React, { useState, useEffect, useMemo } from 'react';
import { Epic, Story } from '../types';
import { api } from '../api';
import { StoryRow } from './StoryRow';
import { OwnerFilterChip } from './OwnerFilterChip';
import { getPriority } from '../utils/storyUtils';
import { useOwnerName } from '../hooks/useOwnerName';
import './StoriesList.css';

interface StoriesListProps {
  epic: Epic;
  onStorySelect: (story: Story, allStories: Story[]) => void;
  onClose: () => void;
  updatedStories: Story[];
}

export const StoriesList: React.FC<StoriesListProps> = ({ epic, onStorySelect, onClose, updatedStories }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'owner' | 'priority'>('owner');
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Get owner name for filter description
  const selectedOwnerName = useOwnerName(selectedOwnerId === 'unassigned' ? undefined : selectedOwnerId || undefined);

  useEffect(() => {
    loadStories();
  }, [epic.id]);

  // Update stories when updatedStories changes
  useEffect(() => {
    if (updatedStories.length > 0) {
      setStories(updatedStories);
    }
  }, [updatedStories]);

  const loadStories = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const data = await api.getStoriesForEpic(epic.id);

      // Filter out stories with excluded workflow states
      const excludedStates = [
        'Merged to Main',
        'Completed / In Prod',
        'Duplicate / Unneeded',
        'Done'
      ];

      const filteredStories = data.filter(story => {
        if (story.workflow_state?.name) {
          return !excludedStates.includes(story.workflow_state.name);
        }
        return true; // Include stories without workflow_state info
      });

      // Fetch bookmarks to determine which stories are bookmarked
      const bookmarks = await api.getBookmarks();
      const bookmarkedSet = new Set(bookmarks.map(b => b.id));
      setBookmarkedIds(bookmarkedSet);

      // Sort: bookmarked stories first, then by created date (newest first)
      const sortedStories = filteredStories.sort((a, b) => {
        const aBookmarked = bookmarkedSet.has(a.id);
        const bBookmarked = bookmarkedSet.has(b.id);

        // If one is bookmarked and the other isn't, bookmarked comes first
        if (aBookmarked && !bBookmarked) return -1;
        if (!aBookmarked && bBookmarked) return 1;

        // Both bookmarked or both not bookmarked: sort by date
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setStories(sortedStories);
    } catch (err) {
      setError('Failed to load stories');
      console.error(err);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Get unique owner IDs and their story counts
  const ownerStats = useMemo(() => {
    const stats = new Map<string, number>();

    // Filter stories by selected priority if applicable
    const relevantStories = selectedPriority
      ? stories.filter((story) => getPriority(story) === selectedPriority)
      : stories;

    relevantStories.forEach((story) => {
      const ownerId = story.owner_ids && story.owner_ids.length > 0
        ? story.owner_ids[0]
        : 'unassigned';
      stats.set(ownerId, (stats.get(ownerId) || 0) + 1);
    });

    return Array.from(stats.entries())
      .map(([ownerId, count]) => ({ ownerId, count }))
      .sort((a, b) => b.count - a.count);
  }, [stories, selectedPriority]);

  // Get unique priorities and their story counts
  const priorityStats = useMemo(() => {
    const stats = new Map<string, number>();

    // Filter stories by selected owner if applicable
    const relevantStories = selectedOwnerId
      ? stories.filter((story) => {
          const storyOwnerId = story.owner_ids && story.owner_ids.length > 0
            ? story.owner_ids[0]
            : 'unassigned';
          return storyOwnerId === selectedOwnerId;
        })
      : stories;

    relevantStories.forEach((story) => {
      const priority = getPriority(story);
      stats.set(priority, (stats.get(priority) || 0) + 1);
    });

    // Sort priorities in a meaningful order (not just by count)
    const priorityOrder = ['Critical', 'High', 'Medium', 'Low', '—'];
    return Array.from(stats.entries())
      .map(([priority, count]) => ({ priority, count }))
      .sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a.priority);
        const bIndex = priorityOrder.indexOf(b.priority);
        const aOrder = aIndex === -1 ? 999 : aIndex;
        const bOrder = bIndex === -1 ? 999 : bIndex;
        return aOrder - bOrder;
      });
  }, [stories, selectedOwnerId]);

  // Filter stories based on selected owner, priority, and search query
  const filteredStories = useMemo(() => {
    let filtered = stories;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter((story) =>
        story.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedOwnerId) {
      filtered = filtered.filter((story) => {
        const storyOwnerId = story.owner_ids && story.owner_ids.length > 0
          ? story.owner_ids[0]
          : 'unassigned';
        return storyOwnerId === selectedOwnerId;
      });
    }

    if (selectedPriority) {
      filtered = filtered.filter((story) => {
        return getPriority(story) === selectedPriority;
      });
    }

    return filtered;
  }, [stories, selectedOwnerId, selectedPriority, searchQuery]);

  const handleOwnerFilter = (ownerId: string) => {
    setSelectedOwnerId(selectedOwnerId === ownerId ? null : ownerId);
  };

  const handlePriorityFilter = (priority: string) => {
    setSelectedPriority(selectedPriority === priority ? null : priority);
  };

  const handleRefresh = () => {
    loadStories(true); // Pass true to indicate this is a refresh
    // Filters (selectedOwnerId and selectedPriority) are preserved
  };

  // Generate filter description
  const getFilterDescription = () => {
    const filters = [];

    if (searchQuery) {
      filters.push(`matching "${searchQuery}"`);
    }

    if (selectedOwnerId) {
      filters.push(`assigned to ${selectedOwnerName}`);
    }

    if (selectedPriority) {
      filters.push(`${selectedPriority} priority`);
    }

    if (filters.length === 0) {
      return null;
    }

    return (
      <>
        Stories {filters.join(', ')}
      </>
    );
  };

  const filterDescription = getFilterDescription();

  return (
    <div className="stories-list">
      <div className="stories-header">
        <div className="stories-header-top">
          <div className="epic-title-group">
            <h2>{epic.name}</h2>
            <a
              href={epic.app_url}
              target="_blank"
              rel="noopener noreferrer"
              className="epic-link"
              title="Open epic in Shortcut"
            >
              ↗
            </a>
          </div>
          <button onClick={onClose} className="drawer-close-btn" title="Close (Esc)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="stories-count">
          {selectedOwnerId || selectedPriority || searchQuery
            ? `${filteredStories.length} of ${stories.length} stories`
            : `${stories.length} stories`}
        </div>
      </div>

      {filterDescription && (
        <div className="filter-description">
          {filterDescription}
        </div>
      )}

      {loading ? (
        <div className="stories-list-loading">Loading stories...</div>
      ) : error ? (
        <div className="stories-list-error">{error}</div>
      ) : stories.length === 0 ? (
        <div className="no-stories">No stories found for this epic</div>
      ) : (
        <div className="stories-content">
          <aside className="owner-filters">
            <div className="filter-tabs">
              <button
                className={`filter-tab ${activeTab === 'owner' ? 'active' : ''}`}
                onClick={() => setActiveTab('owner')}
              >
                Owner
              </button>
              <button
                className={`filter-tab ${activeTab === 'priority' ? 'active' : ''}`}
                onClick={() => setActiveTab('priority')}
              >
                Priority
              </button>
            </div>

            {activeTab === 'owner' && (
              <>
                <div className="owner-filters-list">
                  {ownerStats.map(({ ownerId, count }) => (
                    <OwnerFilterChip
                      key={ownerId}
                      ownerId={ownerId}
                      count={count}
                      isSelected={selectedOwnerId === ownerId}
                      onClick={() => handleOwnerFilter(ownerId)}
                    />
                  ))}
                </div>
                {selectedOwnerId && (
                  <button className="clear-filter-btn" onClick={() => setSelectedOwnerId(null)}>
                    Clear Owner
                  </button>
                )}
              </>
            )}

            {activeTab === 'priority' && (
              <>
                <div className="priority-filters-list">
                  {priorityStats.map(({ priority, count }) => (
                    <button
                      key={priority}
                      className={`priority-filter-chip ${selectedPriority === priority ? 'selected' : ''}`}
                      onClick={() => handlePriorityFilter(priority)}
                      title={`${priority} (${count} stories)`}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
                {selectedPriority && (
                  <button className="clear-filter-btn" onClick={() => setSelectedPriority(null)}>
                    Clear Priority
                  </button>
                )}
              </>
            )}
          </aside>

          <div className="stories-table-wrapper">
            <div className="table-actions">
              <div className="stories-search-bar">
                <input
                  type="text"
                  placeholder="Search stories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="stories-search-input"
                />
                {searchQuery && (
                  <button
                    className="clear-stories-search-btn"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              <button
                onClick={handleRefresh}
                className={`refresh-btn ${refreshing ? 'refreshing' : ''}`}
                title="Refresh stories"
                disabled={refreshing}
              >
                ↻ Refresh
              </button>
            </div>
            <div className={`stories-table ${refreshing ? 'table-refreshing' : ''}`}>
              {refreshing && (
                <div className="table-refresh-overlay">
                  <div className="refresh-spinner">↻</div>
                  <div className="refresh-text">Reloading...</div>
                </div>
              )}
              <div className="stories-table-header">
                <div className="col-priority">Priority</div>
                <div className="col-title">Title</div>
                <div className="col-owner">Owner</div>
                <div className="col-labels">Labels</div>
                <div className="col-date">Created</div>
                <div className="col-link">Link</div>
              </div>
              {filteredStories.map((story) => (
                <StoryRow
                  key={story.id}
                  story={story}
                  onClick={() => onStorySelect(story, filteredStories)}
                  formatDate={formatDate}
                  isBookmarked={bookmarkedIds.has(story.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
