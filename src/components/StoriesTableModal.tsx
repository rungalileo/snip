import React from 'react';
import { Story } from '../types';
import { StoryRow } from './StoryRow';
import { api } from '../api';
import { getOwnerNameFromCache } from '../hooks/useOwnerName';
import './StoriesTableModal.css';

type SortColumn = 'created' | 'owner' | 'status';
type SortDirection = 'asc' | 'desc';

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
  { name: 'TESTING', color: '#26a69a' },
  { name: 'DOCUMENTATION', color: '#ffb300' },
];

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
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [showLabelPicker, setShowLabelPicker] = React.useState(false);
  const [selectedLabels, setSelectedLabels] = React.useState<Set<string>>(new Set());
  const [applyingLabels, setApplyingLabels] = React.useState(false);
  const [sortColumn, setSortColumn] = React.useState<SortColumn>('created');
  const [sortDirection, setSortDirection] = React.useState<SortDirection>('desc');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'created' ? 'desc' : 'asc');
    }
  };

  const getOwnerName = (story: Story): string => {
    const ownerId = story.owner_ids && story.owner_ids.length > 0 ? story.owner_ids[0] : undefined;
    return getOwnerNameFromCache(ownerId);
  };

  const getStatusName = (story: Story): string => {
    return story.workflow_state?.name || '';
  };

  const sortedStories = React.useMemo(() => {
    const sorted = [...stories].sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case 'owner':
          comparison = getOwnerName(a).localeCompare(getOwnerName(b));
          break;
        case 'status':
          comparison = getStatusName(a).localeCompare(getStatusName(b));
          break;
        case 'created':
        default:
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [stories, sortColumn, sortDirection]);

  // Handle escape key to close modal
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLabelPicker) {
          setShowLabelPicker(false);
          setSelectedLabels(new Set());
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, showLabelPicker]);

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

  const handleCheckboxChange = (storyId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(storyId)) {
        next.delete(storyId);
      } else {
        next.add(storyId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === sortedStories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedStories.map((s) => s.id)));
    }
  };

  const handleToggleLabel = (labelName: string) => {
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(labelName)) {
        next.delete(labelName);
      } else {
        next.add(labelName);
      }
      return next;
    });
  };

  const handleApplyLabels = async () => {
    if (selectedLabels.size === 0 || selectedIds.size === 0) return;

    setApplyingLabels(true);
    try {
      for (const storyId of selectedIds) {
        for (const labelName of selectedLabels) {
          const story = sortedStories.find((s) => s.id === storyId);
          const alreadyHas = story?.labels?.some((l) => l.name === labelName);
          if (!alreadyHas) {
            const updatedStory = await api.addLabelToStory(storyId, labelName);
            if (onStoryUpdate) {
              onStoryUpdate(updatedStory);
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to apply labels:', error);
      const errorMsg = error.response?.data?.details || error.message || 'Unknown error';
      alert(`Failed to apply labels. Error: ${errorMsg}`);
    } finally {
      setApplyingLabels(false);
      setShowLabelPicker(false);
      setSelectedLabels(new Set());
      setSelectedIds(new Set());
    }
  };

  const handleLabelPickerBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setShowLabelPicker(false);
      setSelectedLabels(new Set());
    }
  };

  return (
    <div className="stories-table-modal-backdrop" onClick={handleBackdropClick}>
      <div className="stories-table-modal">
        <div className="stories-table-modal-header">
          <h2>{title}</h2>
          <div className="stories-table-modal-header-actions">
            {selectedIds.size > 0 && (
              <button
                className="bulk-add-label-btn"
                onClick={() => setShowLabelPicker(true)}
              >
                Add Label ({selectedIds.size})
              </button>
            )}
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
              <div className="stories-table-header has-checkbox">
                <div className="col-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sortedStories.length && sortedStories.length > 0}
                    onChange={handleSelectAll}
                  />
                </div>
                <div className="col-labels">Labels</div>
                <div className="col-priority">Priority</div>
                <div className="col-title">Title</div>
                <div
                  className={`col-owner sortable ${sortColumn === 'owner' ? 'sorted' : ''}`}
                  onClick={() => handleSort('owner')}
                >
                  Owner {sortColumn === 'owner' && (sortDirection === 'asc' ? '↑' : '↓')}
                </div>
                <div
                  className={`col-status sortable ${sortColumn === 'status' ? 'sorted' : ''}`}
                  onClick={() => handleSort('status')}
                >
                  Status {sortColumn === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </div>
                <div
                  className={`col-date sortable ${sortColumn === 'created' ? 'sorted' : ''}`}
                  onClick={() => handleSort('created')}
                >
                  Created {sortColumn === 'created' && (sortDirection === 'asc' ? '↑' : '↓')}
                </div>
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
                    showStatus={true}
                    showCheckbox={true}
                    isSelected={selectedIds.has(story.id)}
                    onCheckboxChange={handleCheckboxChange}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showLabelPicker && (
        <div className="label-picker-backdrop" onClick={handleLabelPickerBackdropClick}>
          <div className="label-picker-modal">
            <div className="label-picker-header">
              <h3>Add Labels to {selectedIds.size} {selectedIds.size === 1 ? 'story' : 'stories'}</h3>
              <button
                className="label-picker-close"
                onClick={() => { setShowLabelPicker(false); setSelectedLabels(new Set()); }}
              >
                ×
              </button>
            </div>
            <div className="label-picker-body">
              {LABEL_OPTIONS.map((option) => (
                <button
                  key={option.name}
                  className={`label-picker-chip ${selectedLabels.has(option.name) ? 'chip-selected' : ''}`}
                  style={{ backgroundColor: option.color }}
                  onClick={() => handleToggleLabel(option.name)}
                  disabled={applyingLabels}
                >
                  {option.name}
                  {selectedLabels.has(option.name) && ' ✓'}
                </button>
              ))}
            </div>
            <div className="label-picker-footer">
              <button
                className="label-picker-cancel"
                onClick={() => { setShowLabelPicker(false); setSelectedLabels(new Set()); }}
                disabled={applyingLabels}
              >
                Cancel
              </button>
              <button
                className="label-picker-apply"
                onClick={handleApplyLabels}
                disabled={selectedLabels.size === 0 || applyingLabels}
              >
                {applyingLabels ? 'Applying...' : `Apply ${selectedLabels.size > 0 ? `(${selectedLabels.size})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
