import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Objective, EpicWithDetails } from '../types';
import './MajorInitiatives.css';

interface MajorInitiativeWithEpics extends Objective {
  epics: EpicWithDetails[];
}

const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
};

const getStatusColor = (status: string | undefined): string => {
  if (!status) return '#666';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('complete') || statusLower.includes('done')) return '#28a745';
  if (statusLower.includes('in progress') || statusLower.includes('active')) return '#007bff';
  if (statusLower.includes('not started') || statusLower.includes('planned')) return '#ffc107';
  return '#666';
};

// Convert URLs in text to clickable links
const renderDescriptionWithLinks = (text: string): React.ReactNode => {
  // Regex to match URLs (http://, https://, or www.)
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    // Add the URL as a link
    const url = match[0];
    const href = url.startsWith('http') ? url : `https://${url}`;
    parts.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="description-link"
      >
        {url}
      </a>
    );

    lastIndex = match.index + url.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  // If no URLs found, return original text
  if (parts.length === 0) {
    return text;
  }

  return parts;
};

export const MajorInitiatives: React.FC = () => {
  const [initiatives, setInitiatives] = useState<MajorInitiativeWithEpics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [executiveSummaries, setExecutiveSummaries] = useState<Map<number, { summary: string; generated_at: string }>>(new Map());
  const [generatingSummary, setGeneratingSummary] = useState<Set<number>>(new Set());
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState<Map<number, boolean>>(new Map());

  useEffect(() => {
    loadMajorInitiatives();
  }, []);

  const toggleCard = (initiativeId: number) => {
    setExpandedCards((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(initiativeId)) {
        newSet.delete(initiativeId);
      } else {
        newSet.add(initiativeId);
      }
      return newSet;
    });
  };

  const handleGenerateSummary = async (initiativeId: number) => {
    // Show API key input if not already set
    if (!openaiKey) {
      setShowApiKeyInput((prev) => {
        const newMap = new Map(prev);
        newMap.set(initiativeId, true);
        return newMap;
      });
      return;
    }

    try {
      setGeneratingSummary((prev) => {
        const newSet = new Set(prev);
        newSet.add(initiativeId);
        return newSet;
      });

      const result = await api.generateExecutiveSummary(initiativeId, openaiKey);
      
      setExecutiveSummaries((prev) => {
        const newMap = new Map(prev);
        newMap.set(initiativeId, result);
        return newMap;
      });

      // Hide API key input after successful generation
      setShowApiKeyInput((prev) => {
        const newMap = new Map(prev);
        newMap.set(initiativeId, false);
        return newMap;
      });
    } catch (err: any) {
      console.error('Failed to generate executive summary:', err);
      alert(err.response?.data?.error || err.message || 'Failed to generate executive summary');
    } finally {
      setGeneratingSummary((prev) => {
        const newSet = new Set(prev);
        newSet.delete(initiativeId);
        return newSet;
      });
    }
  };

  const handleApiKeySubmit = (initiativeId: number) => {
    if (!openaiKey.trim()) {
      alert('Please enter your OpenAI API key');
      return;
    }
    handleGenerateSummary(initiativeId);
  };

  const loadMajorInitiatives = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getMajorInitiatives();
      setInitiatives(data);
    } catch (err: any) {
      console.error('Failed to load major initiatives:', err);
      setError(err.message || 'Failed to load major initiatives');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="major-initiatives">
        <div className="major-initiatives-loading">Loading Major Initiatives...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="major-initiatives">
        <div className="major-initiatives-error">
          <p>Error: {error}</p>
          <button onClick={loadMajorInitiatives} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (initiatives.length === 0) {
    return (
      <div className="major-initiatives">
        <div className="major-initiatives-empty">
          <p>No Major Initiatives found.</p>
          <p className="hint">Make sure Objectives have "Major Initiative" in their Categories field.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="major-initiatives">
      <div className="major-initiatives-header">
        <h2>Major Initiatives / Projects</h2>
        <button onClick={loadMajorInitiatives} className="refresh-button" title="Refresh">
          ↻
        </button>
      </div>

      <div className="major-initiatives-grid">
        {initiatives.map((initiative) => {
          const isExpanded = expandedCards.has(initiative.id);
          return (
            <div key={initiative.id} className="major-initiative-card">
              <div className="card-header">
                <div className="card-title-section">
                  <span className="card-label">Major Initiative</span>
                  <h3 className="card-title">{initiative.name}</h3>
                </div>
                <div className="card-header-actions">
                  {!initiative.target_date && (
                    <span className="red-flag" title="This Major Initiative is missing a Target Date. Please set a target date in Shortcut.">🚩</span>
                  )}
                  <button
                    className="collapse-toggle"
                    onClick={() => toggleCard(initiative.id)}
                    title={isExpanded ? 'Click to collapse card details' : 'Click to expand card details'}
                    aria-label={isExpanded ? 'Collapse card' : 'Expand card'}
                  >
                    <span className="collapse-icon">{isExpanded ? '▼' : '▶'}</span>
                    <span className="collapse-text">{isExpanded ? 'Collapse' : 'Expand'}</span>
                  </button>
                </div>
              </div>

              {/* Executive Summary Section */}
              <div className="executive-summary-section">
                <div className="executive-summary-header">
                  <h4 className="executive-summary-title">Executive Summary</h4>
                  {!executiveSummaries.has(initiative.id) && (
                    <button
                      className="generate-summary-btn"
                      onClick={() => handleGenerateSummary(initiative.id)}
                      disabled={generatingSummary.has(initiative.id)}
                    >
                      {generatingSummary.has(initiative.id) ? 'Generating...' : 'Generate Exec Summary'}
                    </button>
                  )}
                </div>

                {showApiKeyInput.get(initiative.id) && (
                  <div className="api-key-input-container">
                    <input
                      type="password"
                      className="api-key-input"
                      placeholder="Enter OpenAI API key (sk-...)"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleApiKeySubmit(initiative.id);
                        }
                      }}
                    />
                    <div className="api-key-actions">
                      <button
                        className="btn-submit-api-key"
                        onClick={() => handleApiKeySubmit(initiative.id)}
                        disabled={!openaiKey.trim() || generatingSummary.has(initiative.id)}
                      >
                        Generate
                      </button>
                      <button
                        className="btn-cancel-api-key"
                        onClick={() => {
                          setShowApiKeyInput((prev) => {
                            const newMap = new Map(prev);
                            newMap.set(initiative.id, false);
                            return newMap;
                          });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="api-key-hint">
                      Your API key will be used to generate the summary and will not be stored.
                    </div>
                  </div>
                )}

                {generatingSummary.has(initiative.id) && (
                  <div className="summary-loading">
                    <div className="spinner-small"></div>
                    <span>Generating executive summary...</span>
                  </div>
                )}

                {executiveSummaries.has(initiative.id) && (
                  <div className="executive-summary-content">
                    <div className="summary-text">
                      {executiveSummaries.get(initiative.id)?.summary.split('\n').map((line, index) => (
                        <p key={index}>{line || <br />}</p>
                      ))}
                    </div>
                    <div className="summary-footer">
                      <small>
                        Generated: {new Date(executiveSummaries.get(initiative.id)?.generated_at || '').toLocaleString()}
                      </small>
                      <button
                        className="regenerate-summary-btn"
                        onClick={() => {
                          setExecutiveSummaries((prev) => {
                            const newMap = new Map(prev);
                            newMap.delete(initiative.id);
                            return newMap;
                          });
                          handleGenerateSummary(initiative.id);
                        }}
                        disabled={generatingSummary.has(initiative.id)}
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>
                )}

                {!executiveSummaries.has(initiative.id) && !generatingSummary.has(initiative.id) && !showApiKeyInput.get(initiative.id) && (
                  <div className="summary-placeholder">
                    Click "Generate Exec Summary" to create an AI-generated executive summary for this Major Initiative.
                  </div>
                )}
              </div>

              {isExpanded && (
                <>
                  <div className="card-meta">
                    <div className="meta-row">
                      <span className="meta-label">Start Date:</span>
                      <span className="meta-value">{formatDate(initiative.start_date)}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Target Date:</span>
                      <span className={`meta-value ${!initiative.target_date ? 'missing' : ''}`}>
                        {formatDate(initiative.target_date) || 'Not Set'}
                      </span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-label">Status:</span>
                      <span
                        className="meta-value status-badge"
                        style={{ color: getStatusColor(initiative.status) }}
                      >
                        {initiative.status || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  {initiative.description && (
                    <div className="card-description">
                      <p>{renderDescriptionWithLinks(initiative.description)}</p>
                    </div>
                  )}

                  <div className="card-epics">
                    <h4 className="epics-header">
                      Epics ({initiative.epics.length})
                    </h4>
                    {initiative.epics.length === 0 ? (
                      <p className="no-epics">No epics found for this initiative.</p>
                    ) : (
                      <div className="epics-list">
                        {initiative.epics.map((epic) => (
                          <div key={epic.id} className="epic-item">
                            <div className="epic-header">
                              <a
                                href={epic.app_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="epic-link"
                              >
                                {epic.name}
                              </a>
                              {!epic.target_date && (
                                <span className="red-flag small" title="This Epic is missing a Target Date. Please set a target date in Shortcut.">🚩</span>
                              )}
                            </div>

                            <div className="epic-meta">
                              <div className="epic-meta-row">
                                <span className="epic-meta-label">Start:</span>
                                <span className="epic-meta-value">{formatDate(epic.start_date)}</span>
                              </div>
                              <div className="epic-meta-row">
                                <span className="epic-meta-label">Target:</span>
                                <span className={`epic-meta-value ${!epic.target_date ? 'missing' : ''}`}>
                                  {formatDate(epic.target_date) || 'Not Set'}
                                </span>
                              </div>
                              <div className="epic-meta-row">
                                <span className="epic-meta-label">Status:</span>
                                <span
                                  className="epic-meta-value status-badge"
                                  style={{ color: getStatusColor(epic.status) }}
                                >
                                  {epic.status || 'Unknown'}
                                </span>
                              </div>
                            </div>

                            {(epic.teams && epic.teams.length > 0) || (epic.owners && epic.owners.length > 0) ? (
                              <div className="epic-teams-owners">
                                {epic.teams && epic.teams.length > 0 && (
                                  <div className="teams-section">
                                    <span className="section-label">Teams:</span>
                                    <div className="tags-list">
                                      {epic.teams.map((team) => (
                                        <span key={team.id} className="tag team-tag">
                                          {team.name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {epic.owners && epic.owners.length > 0 && (
                                  <div className="owners-section">
                                    <span className="section-label">Owners:</span>
                                    <div className="tags-list">
                                      {epic.owners.map((owner) => (
                                        <span key={owner.id} className="tag owner-tag">
                                          {owner.name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="epic-teams-owners">
                                <span className="no-teams-owners">No teams or owners assigned</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="card-footer">
                    <a
                      href={initiative.app_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-in-shortcut"
                    >
                      View in Shortcut →
                    </a>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
