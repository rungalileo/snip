import React from 'react';
import { Story } from '../types';
import { useOwnerName } from '../hooks/useOwnerName';
import { getPriority } from '../utils/storyUtils';

interface StoryRowProps {
  story: Story;
  onClick: () => void;
  formatDate: (date: string) => string;
  isBookmarked?: boolean;
}

// Helper function to get priority color
const getPriorityColor = (priority: string): string => {
  switch (priority.toLowerCase()) {
    case 'highest':
      return '#c62828'; // Deep red
    case 'high':
      return '#ef5350'; // Red
    case 'medium':
      return '#ff9800'; // Orange
    case 'low':
      return '#2196f3'; // Blue
    default:
      return '#666'; // Default gray
  }
};

export const StoryRow: React.FC<StoryRowProps> = ({ story, onClick, formatDate, isBookmarked }) => {
  const ownerId = story.owner_ids && story.owner_ids.length > 0 ? story.owner_ids[0] : undefined;
  const ownerName = useOwnerName(ownerId);
  const priority = getPriority(story);
  const priorityColor = getPriorityColor(priority);

  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="story-row" onClick={onClick}>
      <div className="col-priority" style={{ color: priorityColor }}>{priority}</div>
      <div className="col-title">
        {isBookmarked && (
          <span className="bookmark-indicator" title="Bookmarked">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
          </span>
        )}
        {story.name}
      </div>
      <div className="col-owner">
        <span className="owner-chip">{ownerName}</span>
      </div>
      <div className="col-labels">
        {story.labels && story.labels.length > 0 ? (
          <div className="label-chips-row">
            {story.labels.map((label) => (
              <span
                key={label.id}
                className="label-chip-small"
              >
                {label.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="no-labels">—</span>
        )}
      </div>
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
