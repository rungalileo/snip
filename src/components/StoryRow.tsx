import React, { useState, useRef, useEffect } from 'react';
import { Story } from '../types';
import { useOwnerName } from '../hooks/useOwnerName';
import { getPriority } from '../utils/storyUtils';
import { api } from '../api';

const LABEL_OPTIONS = [
  { name: 'CUSTOMER ESCALATION', color: '#e53935' },
  { name: 'BUG', color: '#fb8c00' },
  { name: 'FOUNDATIONAL WORK', color: '#43a047' },
  { name: 'PRODUCT FEATURE', color: '#1e88e5' },
  { name: 'TASK', color: '#9c27b0' },
  { name: 'SMALL IMPROVEMENT', color: '#00897b' },
  { name: 'CUSTOMER FEATURE REQUEST', color: '#7c4dff' },
  { name: 'NICE TO HAVE', color: '#78909c' },
  { name: 'OPTIMIZATION', color: '#00acc1' },
  { name: 'INTEGRATION WORK', color: '#ec407a' },
  { name: 'OPERATIONS', color: '#795548' },
  { name: 'INTERNAL TOOLS', color: '#5c6bc0' },
];

interface StoryRowProps {
  story: Story;
  onClick: () => void;
  formatDate: (date: string) => string;
  isBookmarked?: boolean;
  onStoryUpdate?: (updatedStory: Story) => void;
  customer?: string;
  showStatus?: boolean;
  showCheckbox?: boolean;
  isSelected?: boolean;
  onCheckboxChange?: (storyId: number) => void;
  /** When true, show all owners (story.owner_ids); otherwise only the first owner */
  showAllOwners?: boolean;
}

const OwnerNameChip: React.FC<{ ownerId: string }> = ({ ownerId }) => {
  const name = useOwnerName(ownerId);
  return <span className="owner-chip">{name}</span>;
};

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

const COMPLETED_STATES = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];

export const StoryRow: React.FC<StoryRowProps> = ({ story, onClick, formatDate, isBookmarked, onStoryUpdate, customer, showStatus, showCheckbox, isSelected, onCheckboxChange, showAllOwners }) => {
  const ownerId = story.owner_ids && story.owner_ids.length > 0 ? story.owner_ids[0] : undefined;
  const ownerName = useOwnerName(ownerId);
  const priority = getPriority(story);
  const ownerIds = story.owner_ids ?? [];
  const priorityColor = getPriorityColor(priority);

  const [showLabelPopup, setShowLabelPopup] = useState(false);
  const [addingLabel, setAddingLabel] = useState<string | null>(null);
  const [isHoveringLabels, setIsHoveringLabels] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });
  const popupRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleAddIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Calculate position based on button location
    if (addButtonRef.current) {
      const rect = addButtonRef.current.getBoundingClientRect();
      setPopupPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }

    setShowLabelPopup(true);
  };

  const hasLabel = (labelName: string) => {
    return story.labels?.some((label) => label.name === labelName);
  };

  const handleAddLabel = async (e: React.MouseEvent, labelName: string) => {
    e.stopPropagation();
    if (hasLabel(labelName) || addingLabel) return;

    try {
      setAddingLabel(labelName);
      const updatedStory = await api.addLabelToStory(story.id, labelName);
      if (onStoryUpdate) {
        onStoryUpdate(updatedStory);
      }
    } catch (error: any) {
      console.error('Failed to add label:', error);
      const errorMsg = error.response?.data?.details || error.message || 'Unknown error';
      alert(`Failed to add label "${labelName}". Error: ${errorMsg}`);
    } finally {
      setAddingLabel(null);
    }
  };

  // Close popup on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showLabelPopup) {
        setShowLabelPopup(false);
      }
    };

    if (showLabelPopup) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [showLabelPopup]);

  return (
    <div className="story-row" onClick={onClick}>
      {showCheckbox && (
        <div className="col-checkbox" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected || false}
            onChange={() => onCheckboxChange?.(story.id)}
          />
        </div>
      )}
      <div className="col-priority" style={{ color: priorityColor }}>{priority}</div>
      {customer !== undefined && (
        <div className="col-customer">{customer}</div>
      )}
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
        {showAllOwners && ownerIds.length > 0 ? (
          <div className="owner-chips-wrap">
            {ownerIds.map((id) => (
              <OwnerNameChip key={id} ownerId={id} />
            ))}
          </div>
        ) : (
          <span className="owner-chip">{ownerName}</span>
        )}
      </div>
      {showStatus && (
        <div className={`col-status ${story.workflow_state && COMPLETED_STATES.includes(story.workflow_state.name) ? 'status-completed' : ''}`}>
          {story.workflow_state?.name || '—'}
        </div>
      )}
      <div
        className="col-labels"
        onMouseEnter={() => setIsHoveringLabels(true)}
        onMouseLeave={() => setIsHoveringLabels(false)}
      >
        <div className="labels-content">
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
          {isHoveringLabels && !showLabelPopup && (
            <button
              ref={addButtonRef}
              className="add-label-icon"
              onClick={handleAddIconClick}
              title="Add label"
            >
              +
            </button>
          )}
        </div>
        {showLabelPopup && (
          <div
            className="label-popup"
            ref={popupRef}
            onClick={(e) => e.stopPropagation()}
            onMouseLeave={() => setShowLabelPopup(false)}
            style={{
              position: 'fixed',
              top: popupPosition.top,
              left: popupPosition.left,
            }}
          >
            <div className="label-popup-title">Add Label</div>
            <div className="label-popup-chips">
              {LABEL_OPTIONS.map((option) => (
                <button
                  key={option.name}
                  className={`label-popup-chip ${hasLabel(option.name) ? 'chip-added' : ''}`}
                  style={{ backgroundColor: option.color }}
                  onClick={(e) => handleAddLabel(e, option.name)}
                  disabled={hasLabel(option.name) || addingLabel !== null}
                >
                  {addingLabel === option.name ? (
                    <span className="label-spinner"></span>
                  ) : (
                    <>
                      {option.name}
                      {hasLabel(option.name) && ' ✓'}
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
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
