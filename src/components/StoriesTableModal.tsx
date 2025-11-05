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
}

export const StoriesTableModal: React.FC<StoriesTableModalProps> = ({
  stories,
  title,
  onClose,
  onStorySelect,
  bookmarkedIds,
}) => {
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

  return (
    <div className="stories-table-modal-backdrop" onClick={handleBackdropClick}>
      <div className="stories-table-modal">
        <div className="stories-table-modal-header">
          <h2>{title}</h2>
          <button className="stories-table-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="stories-table-modal-content">
          {stories.length === 0 ? (
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
                {stories.map((story) => (
                  <StoryRow
                    key={story.id}
                    story={story}
                    onClick={() => onStorySelect(story, stories)}
                    formatDate={formatDate}
                    isBookmarked={bookmarkedIds.has(story.id)}
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
