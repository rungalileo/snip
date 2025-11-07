import React, { useState } from 'react';
import { Story } from '../types';
import { api } from '../api';
import { useOwnerName } from '../hooks/useOwnerName';
import { getPriority } from '../utils/storyUtils';
import './StoryModal.css';

interface StoryModalProps {
  story: Story;
  allStories: Story[];
  onClose: () => void;
  onStoryChange: (newStory: Story) => void;
}

const LABEL_OPTIONS = [
  { name: 'CUSTOMER ESCALATION', color: '#e53935' },
  { name: 'BUG', color: '#fb8c00' },
  { name: 'FOUNDATIONAL WORK', color: '#43a047' },
  { name: 'PRODUCT FEATURE', color: '#1e88e5' },
  { name: 'TASK', color: '#9c27b0' },
  { name: 'SMALL IMPROVEMENT', color: '#00897b' },
  { name: 'CUSTOMER FEATURE REQUEST', color: '#7c4dff' },
  { name: 'NICE TO HAVE', color: '#78909c' },
];

export const StoryModal: React.FC<StoryModalProps> = ({
  story,
  allStories,
  onClose,
  onStoryChange,
}) => {
  const [currentStory, setCurrentStory] = useState(story);
  const [addingLabel, setAddingLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPriority, setSelectedPriority] = useState<string>('');
  const [changingPriority, setChangingPriority] = useState(false);
  const [commentText, setCommentText] = useState<string>('');
  const [addingComment, setAddingComment] = useState(false);
  const [commentSuccess, setCommentSuccess] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showTitleTooltip, setShowTitleTooltip] = useState(false);
  const [showLinkTooltip, setShowLinkTooltip] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);

  const currentIndex = allStories.findIndex((s) => s.id === currentStory.id);
  const ownerId = currentStory.owner_ids && currentStory.owner_ids.length > 0 ? currentStory.owner_ids[0] : undefined;
  const ownerName = useOwnerName(ownerId);
  const requesterName = useOwnerName(currentStory.requested_by_id);
  const priority = getPriority(currentStory);

  const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];
  const isCompletedState = currentStory.workflow_state?.name && completedStates.includes(currentStory.workflow_state.name);

  const getPriorityColor = (priority: string): string => {
    switch (priority.toLowerCase()) {
      case 'highest':
        return '#b71c1c'; // Deep red
      case 'high':
        return '#d32f2f'; // Red
      case 'medium':
        return '#f9a825'; // Yellow
      case 'low':
        return '#1976d2'; // Blue
      default:
        return '#999'; // Gray for no priority
    }
  };

  // Fetch full story details when modal opens or story changes
  React.useEffect(() => {
    const fetchFullStory = async () => {
      try {
        setLoading(true);
        const fullStory = await api.getStory(currentStory.id);
        setCurrentStory(fullStory);
      } catch (error) {
        console.error('Error fetching full story:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFullStory();
  }, [currentStory.id]);

  // Check bookmark status when story changes
  React.useEffect(() => {
    const checkBookmarkStatus = async () => {
      try {
        const bookmarked = await api.checkBookmark(currentStory.id);
        setIsBookmarked(bookmarked);
      } catch (error) {
        console.error('Error checking bookmark status:', error);
      }
    };

    checkBookmarkStatus();
  }, [currentStory.id]);

  const goToPrevious = () => {
    if (currentIndex > 0) {
      const prevStory = allStories[currentIndex - 1];
      setCurrentStory(prevStory);
      onStoryChange(prevStory);
    }
  };

  const goToNext = () => {
    if (currentIndex < allStories.length - 1) {
      const nextStory = allStories[currentIndex + 1];
      setCurrentStory(nextStory);
      onStoryChange(nextStory);
    }
  };

  const handleAddLabel = async (labelName: string) => {
    try {
      setAddingLabel(labelName);
      const updatedStory = await api.addLabelToStory(currentStory.id, labelName);
      setCurrentStory(updatedStory);
    } catch (error: any) {
      console.error('Failed to add label:', error);
      const errorMsg = error.response?.data?.details || error.message || 'Unknown error';
      alert(`Failed to add label "${labelName}". Error: ${errorMsg}`);
    } finally {
      setAddingLabel(null);
    }
  };

  const hasLabel = (labelName: string) => {
    return currentStory.labels?.some((label) => label.name === labelName);
  };

  const handleChangePriority = async () => {
    if (!selectedPriority || selectedPriority === priority) {
      return;
    }

    try {
      setChangingPriority(true);
      const updatedStory = await api.updateStoryPriority(currentStory.id, selectedPriority);
      setCurrentStory(updatedStory);
      onStoryChange(updatedStory);
      setSelectedPriority('');
    } catch (error: any) {
      console.error('Failed to change priority:', error);
      const errorMsg = error.response?.data?.details || error.message || 'Unknown error';
      alert(`Failed to change priority. Error: ${errorMsg}`);
    } finally {
      setChangingPriority(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) {
      return;
    }

    try {
      setAddingComment(true);
      await api.addCommentToStory(currentStory.id, commentText);
      setCommentText('');
      setCommentSuccess(true);

      // Fade out after 5 seconds
      setTimeout(() => {
        setCommentSuccess(false);
      }, 5000);
    } catch (error: any) {
      console.error('Failed to add comment:', error);
      const errorMsg = error.response?.data?.details || error.message || 'Unknown error';
      alert(`Failed to add comment. Error: ${errorMsg}`);
    } finally {
      setAddingComment(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDescription = (description: string) => {
    // Replace URLs with "Link" anchors
    const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
    const formatted = description.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="description-link">Link</a>`;
    });
    return formatted;
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCopyTitle = () => {
    navigator.clipboard.writeText(currentStory.name);
    setCopiedTitle(true);
    setTimeout(() => setCopiedTitle(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentStory.app_url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleToggleBookmark = async () => {
    try {
      setBookmarking(true);
      if (isBookmarked) {
        await api.removeBookmark(currentStory.id);
        setIsBookmarked(false);
      } else {
        await api.addBookmark(currentStory);
        setIsBookmarked(true);
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      alert('Failed to update bookmark');
    } finally {
      setBookmarking(false);
    }
  };

  const handleIterationClick = () => {
    if (currentStory.iteration) {
      const iterationName = encodeURIComponent(currentStory.iteration.name);
      window.history.pushState({}, '', `?iteration=${iterationName}`);
      // Trigger a popstate event to update the app
      window.dispatchEvent(new PopStateEvent('popstate'));
      // Close the modal
      onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Check if the active element is an input or textarea
    const activeElement = document.activeElement;
    const isInputFocused = activeElement?.tagName === 'INPUT' ||
                          activeElement?.tagName === 'TEXTAREA' ||
                          activeElement?.tagName === 'SELECT';

    // Only handle arrow keys if not in an input field
    if (e.key === 'ArrowLeft' && !isInputFocused) {
      goToPrevious();
    } else if (e.key === 'ArrowRight' && !isInputFocused) {
      goToNext();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex]);

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        <div className="modal-navigation">
          <button
            className="nav-btn nav-prev"
            onClick={goToPrevious}
            disabled={currentIndex === 0}
            title="Previous story (←)"
          >
            ←
          </button>
          <button
            className="nav-btn nav-next"
            onClick={goToNext}
            disabled={currentIndex === allStories.length - 1}
            title="Next story (→)"
          >
            →
          </button>
        </div>

        <div className="modal-header">
          <div className="story-counter-top">
            Story {currentIndex + 1} of {allStories.length}
          </div>
          <div className="modal-header-top">
            <h2 className="story-title">{currentStory.name}</h2>
            {priority !== '—' && (
              <span
                className="priority-badge"
                style={{ backgroundColor: getPriorityColor(priority) }}
              >
                {priority}
              </span>
            )}
            <button
              onClick={handleToggleBookmark}
              className={`bookmark-btn ${isBookmarked ? 'bookmarked' : ''}`}
              disabled={bookmarking}
              title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </button>
          </div>
          <div className="story-meta">
            <div className="meta-left">
              <div className="meta-item">
                <span className="meta-label">Owner:</span>
                <span className="meta-value">{ownerName}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Requester:</span>
                <span className="meta-value">{requesterName}</span>
              </div>
            </div>
            <div className="meta-center">
              <span className="story-date">{formatDate(currentStory.created_at)}</span>
              {currentStory.workflow_state && (
                <span className={`story-state-chip ${isCompletedState ? 'completed' : ''}`}>
                  {currentStory.workflow_state.name}
                </span>
              )}
              {currentStory.iteration && (
                <span
                  className="story-iteration-chip clickable"
                  onClick={handleIterationClick}
                  title="View iteration in Execution"
                >
                  {currentStory.iteration.name}
                </span>
              )}
            </div>
            <div className="meta-right">
              <div className="copy-buttons">
                <div
                  className="copy-btn-wrapper"
                  onMouseEnter={() => setShowTitleTooltip(true)}
                  onMouseLeave={() => setShowTitleTooltip(false)}
                >
                  <button
                    onClick={handleCopyTitle}
                    className="copy-btn"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                  {showTitleTooltip && (
                    <div className="copy-tooltip">
                      {copiedTitle ? "Copied!" : "Copy title"}
                    </div>
                  )}
                </div>
                <div
                  className="copy-btn-wrapper"
                  onMouseEnter={() => setShowLinkTooltip(true)}
                  onMouseLeave={() => setShowLinkTooltip(false)}
                >
                  <button
                    onClick={handleCopyLink}
                    className="copy-btn"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                  </button>
                  {showLinkTooltip && (
                    <div className="copy-tooltip">
                      {copiedLink ? "Copied!" : "Copy Shortcut link"}
                    </div>
                  )}
                </div>
              </div>
              <a
                href={currentStory.app_url}
                target="_blank"
                rel="noopener noreferrer"
                className="modal-shortcut-link"
                title="Open in Shortcut"
              >
                ↗
              </a>
            </div>
          </div>
        </div>

        <div className="modal-body">
          <div className="story-description">
            {loading ? (
              <p className="loading-description">Loading description...</p>
            ) : currentStory.description ? (
              <div dangerouslySetInnerHTML={{ __html: formatDescription(currentStory.description) }} />
            ) : (
              <p className="no-description">No description provided</p>
            )}
          </div>

          <div className="existing-labels">
            {currentStory.labels && currentStory.labels.length > 0 && (
              <>
                <div className="existing-labels-title">Current Labels:</div>
                <div className="existing-labels-list">
                  {currentStory.labels.map((label) => (
                    <span
                      key={label.id}
                      className="existing-label"
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="label-chips">
            <div className="label-chips-title">Add Label:</div>
            <div className="chips-container">
              {LABEL_OPTIONS.map((option) => (
                <button
                  key={option.name}
                  className={`chip ${hasLabel(option.name) ? 'chip-added' : ''}`}
                  style={{ backgroundColor: option.color }}
                  onClick={() => !hasLabel(option.name) && handleAddLabel(option.name)}
                  disabled={hasLabel(option.name) || addingLabel === option.name}
                >
                  {addingLabel === option.name ? 'Adding...' : option.name}
                  {hasLabel(option.name) && ' ✓'}
                </button>
              ))}
            </div>
          </div>

          <div className="actions-section">
            <div className="priority-subsection">
              <div className="subsection-title">Change Priority:</div>
              <div className="priority-controls">
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="priority-select"
                >
                  <option value="">Select...</option>
                  <option value="Highest">Highest</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
                <button
                  className="change-priority-btn"
                  onClick={handleChangePriority}
                  disabled={!selectedPriority || selectedPriority === priority || changingPriority}
                >
                  {changingPriority ? 'Changing...' : 'Change'}
                </button>
              </div>
            </div>

            <div className="comment-subsection">
              <div className="subsection-title">Add Comment:</div>
              <div className="comment-controls">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Type comment..."
                  className="comment-input"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                />
                <button
                  className="add-comment-btn"
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || addingComment}
                  title="Add comment"
                >
                  {addingComment ? '...' : '💬'}
                </button>
              </div>
              {commentSuccess && (
                <div className="comment-success-message">
                  Comment added!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
