import React, { useState, useEffect } from 'react';
import { Epic } from '../types';
import { api } from '../api';
import './EpicSelector.css';

interface EpicSelectorProps {
  onEpicSelect: (epic: Epic) => void;
}

const EPICS_PER_PAGE = 10;
const EPICS_CACHE_KEY = 'shortcut_epics_cache';

const getRelativeTimeString = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
};

const getUpdateAgeClass = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (days <= 5) return 'update-recent';
  if (days <= 15) return 'update-medium';
  return 'update-old';
};

export const EpicSelector: React.FC<EpicSelectorProps> = ({ onEpicSelect }) => {
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'bookmarked'>('all');
  const [bookmarkedEpics, setBookmarkedEpics] = useState<Epic[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadEpicsFromCache();
    loadBookmarkedEpics();
  }, []);

  const loadBookmarkedEpics = async () => {
    try {
      const bookmarks = await api.getEpicBookmarks();

      // Ensure bookmarks is an array
      if (!Array.isArray(bookmarks)) {
        console.error('API returned non-array bookmarks:', bookmarks);
        setBookmarkedEpics([]);
        setBookmarkedIds(new Set());
        return;
      }

      // Sort by updated_at date (most recent first)
      const sortedBookmarks = bookmarks.sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setBookmarkedEpics(sortedBookmarks);
      setBookmarkedIds(new Set(sortedBookmarks.map(e => e.id)));
    } catch (err) {
      console.error('Error loading bookmarked epics:', err);
      setBookmarkedEpics([]);
      setBookmarkedIds(new Set());
    }
  };

  const loadEpicsFromCache = () => {
    try {
      const cachedData = localStorage.getItem(EPICS_CACHE_KEY);
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        // Ensure cached data is an array
        if (Array.isArray(parsedData)) {
          setEpics(parsedData);
          setLoading(false);
        } else {
          console.error('Cached data is not an array, clearing cache');
          localStorage.removeItem(EPICS_CACHE_KEY);
          loadEpics(false);
        }
      } else {
        // No cache, fetch from backend
        loadEpics(false);
      }
    } catch (err) {
      console.error('Error loading from cache:', err);
      localStorage.removeItem(EPICS_CACHE_KEY);
      loadEpics(false);
    }
  };

  const loadEpics = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const data = await api.getEpics();

      // Ensure data is an array
      if (!Array.isArray(data)) {
        console.error('API returned non-array data:', data);
        setError('Failed to load epics: Invalid data format');
        return;
      }

      // Filter out completed epics and sort by updated date
      const activeEpics = data
        .filter(epic => !epic.completed)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      setEpics(activeEpics);

      // Cache the data
      localStorage.setItem(EPICS_CACHE_KEY, JSON.stringify(activeEpics));
    } catch (err) {
      setError('Failed to load epics');
      console.error(err);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const handleRefresh = () => {
    loadEpics(true);
    loadBookmarkedEpics();
  };

  const handleToggleBookmark = async (epic: Epic, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent epic selection
    try {
      if (bookmarkedIds.has(epic.id)) {
        await api.removeEpicBookmark(epic.id);
      } else {
        await api.addEpicBookmark(epic);
      }
      // Reload bookmarked epics
      await loadBookmarkedEpics();
    } catch (err) {
      console.error('Error toggling epic bookmark:', err);
      alert('Failed to update bookmark');
    }
  };

  // Get epics to display based on active tab
  const displayEpics = activeTab === 'all' ? epics : bookmarkedEpics;

  // Filter epics based on search query
  const filteredEpics = displayEpics.filter(epic =>
    epic.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredEpics.length / EPICS_PER_PAGE);
  const startIndex = currentPage * EPICS_PER_PAGE;
  const endIndex = startIndex + EPICS_PER_PAGE;
  const currentEpics = filteredEpics.slice(startIndex, endIndex);

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery]);

  const goToNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  if (loading) {
    return <div className="epic-selector-loading">Loading epics...</div>;
  }

  if (error) {
    return <div className="epic-selector-error">{error}</div>;
  }

  return (
    <div className="epic-selector">
      <h2>Select an Epic</h2>

      <div className="epic-tabs">
        <button
          className={`epic-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('all');
            setCurrentPage(0);
          }}
        >
          All Epics
        </button>
        <button
          className={`epic-tab ${activeTab === 'bookmarked' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('bookmarked');
            setCurrentPage(0);
          }}
        >
          Bookmarked ({bookmarkedEpics.length})
        </button>
      </div>

      <div className="search-and-refresh">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search epics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <button
          onClick={handleRefresh}
          className={`epic-refresh-btn ${refreshing ? 'refreshing' : ''}`}
          title="Refresh epics"
          disabled={refreshing}
        >
          ↻
        </button>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={goToPreviousPage}
            disabled={currentPage === 0}
            className="pagination-btn"
          >
            ← Previous
          </button>
          <span className="pagination-info">
            Page {currentPage + 1} of {totalPages} ({filteredEpics.length} epics)
          </span>
          <button
            onClick={goToNextPage}
            disabled={currentPage === totalPages - 1}
            className="pagination-btn"
          >
            Next →
          </button>
        </div>
      )}

      {currentEpics.length === 0 ? (
        <div className="no-results">No epics found matching "{searchQuery}"</div>
      ) : (
        <div className="epic-list">
        {currentEpics.map((epic) => (
          <div
            key={epic.id}
            className={`epic-item ${bookmarkedIds.has(epic.id) ? 'epic-item-bookmarked' : ''}`}
            onClick={() => onEpicSelect(epic)}
          >
            <div className="epic-item-content">
              <div className="epic-name">{epic.name}</div>
              <div className="epic-meta">
                <div className="epic-dates">
                  <div>Created: {new Date(epic.created_at).toLocaleDateString()}</div>
                  <div className={getUpdateAgeClass(epic.updated_at)}>
                    Updated: {getRelativeTimeString(epic.updated_at)}
                  </div>
                </div>
                {epic.active_story_count !== undefined && (
                  <span className="epic-story-count">Stories: {epic.active_story_count}</span>
                )}
              </div>
            </div>
            <button
              className={`epic-bookmark-btn ${bookmarkedIds.has(epic.id) ? 'bookmarked' : ''}`}
              onClick={(e) => handleToggleBookmark(epic, e)}
              title={bookmarkedIds.has(epic.id) ? 'Remove bookmark' : 'Bookmark epic'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={bookmarkedIds.has(epic.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </div>
        ))}
        </div>
      )}
    </div>
  );
};
