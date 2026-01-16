import React from 'react';
import { Story } from '../types';
import { StoryRow } from './StoryRow';
import './StoriesTableModal.css';

interface StoriesTableModalProps {
  stories: Story[];
  title: string;
  onClose: () => void;
  onStorySelect: (story: Story, stories: Story[]) => void;
  bookmarkedIds: Set<number>;
  onStoryUpdate?: (updatedStory: Story) => void;
}

export const StoriesTableModal: React.FC<StoriesTableModalProps> = ({
  stories,
  title,
  onClose,
  onStorySelect,
  bookmarkedIds,
  onStoryUpdate,
}) => {
  const [copiedLinks, setCopiedLinks] = React.useState(false);

  // Sort stories by created date (most recent first)
  const sortedStories = React.useMemo(() => {
    return [...stories].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [stories]);

  // Handle escape key to close modal
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCopyLinks = () => {
    const allLinks = sortedStories.map(story => story.app_url).join('\n');
    navigator.clipboard.writeText(allLinks);
    setCopiedLinks(true);
    setTimeout(() => setCopiedLinks(false), 2000);
  };

  return (
    <div className="stories-table-modal-backdrop" onClick={handleBackdropClick}>
      <div className="stories-table-modal">
        <div className="stories-table-modal-header">
          <h2>{title}</h2>
          <div className="stories-table-modal-header-actions">
            <button
              className="copy-links-btn"
              onClick={handleCopyLinks}
              disabled={sortedStories.length === 0}
            >
              {copiedLinks ? '✓ Copied' : 'Copy Links'}
            </button>
            <button className="stories-table-modal-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="stories-table-modal-content">
          {sortedStories.length === 0 ? (
            <div className="no-stories-message">No stories found</div>
          ) : (
            <div className="stories-table-container">
              <div className="stories-table-header">
                <div className="col-priority">Priority</div>
                <div className="col-title">Title</div>
                <div className="col-owner">Owner</div>
                <div className="col-labels">Labels</div>
                <div className="col-date">Created</div>
                <div className="col-link">Link</div>
              </div>
              <div className="stories-table-body">
                {sortedStories.map((story) => (
                  <StoryRow
                    key={story.id}
                    story={story}
                    onClick={() => onStorySelect(story, sortedStories)}
                    formatDate={formatDate}
                    isBookmarked={bookmarkedIds.has(story.id)}
                    onStoryUpdate={onStoryUpdate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
