import React, { useState, useEffect } from 'react';
import { Story } from '../types';
import { api } from '../api';
import { useOwnerName } from '../hooks/useOwnerName';
import { getPriority } from '../utils/storyUtils';
import './BookmarkedStories.css';

interface BookmarkedStoriesProps {
  onStorySelect: (story: Story, allStories: Story[]) => void;
  onBack: () => void;
}

export const BookmarkedStories: React.FC<BookmarkedStoriesProps> = ({ onStorySelect, onBack }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    try {
      setLoading(true);
      const data = await api.getBookmarks();
      setStories(data);
    } catch (err) {
      setError('Failed to load bookmarked stories');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const BookmarkedStoryRow: React.FC<{ story: Story; onClick: () => void }> = ({ story, onClick }) => {
    const ownerId = story.owner_ids && story.owner_ids.length > 0 ? story.owner_ids[0] : undefined;
    const ownerName = useOwnerName(ownerId);
    const priority = getPriority(story);

    const handleLinkClick = (e: React.MouseEvent) => {
      e.stopPropagation();
    };

    return (
      <div className="bookmarked-story-row" onClick={onClick}>
        <div className="col-title">{story.name}</div>
        <div className="col-owner">{ownerName}</div>
        <div className="col-priority">{priority}</div>
        <div className="col-date">{formatDate(story.created_at)}</div>
        <div className="col-link">
          <a
            href={story.app_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shortcut-link"
            onClick={handleLinkClick}
            title="Open in Shortcut"
          >
            ↗
          </a>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="bookmarked-stories-loading">Loading bookmarked stories...</div>;
  }

  if (error) {
    return <div className="bookmarked-stories-error">{error}</div>;
  }

  return (
    <div className="bookmarked-stories">
      <div className="bookmarked-header">
        <button onClick={onBack} className="back-btn">
          ← Back
        </button>
        <h2>Bookmarked Stories</h2>
        <div className="bookmarked-count">
          {stories.length} {stories.length === 1 ? 'story' : 'stories'}
        </div>
      </div>

      {stories.length === 0 ? (
        <div className="no-bookmarks">
          <p>No bookmarked stories yet</p>
          <p className="no-bookmarks-hint">Bookmark stories from the story modal to see them here</p>
        </div>
      ) : (
        <div className="bookmarked-table-wrapper">
          <div className="bookmarked-table">
            <div className="bookmarked-table-header">
              <div className="col-title">Title</div>
              <div className="col-owner">Owner</div>
              <div className="col-priority">Priority</div>
              <div className="col-date">Created</div>
              <div className="col-link">Link</div>
            </div>
            {stories.map((story) => (
              <BookmarkedStoryRow
                key={story.id}
                story={story}
                onClick={() => onStorySelect(story, stories)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
