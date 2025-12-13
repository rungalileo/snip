import React, { useState, useEffect } from 'react';
import { Group } from '../types';
import { api } from '../api';
import './AIReportModal.css';

// Team priority order (matches server and Execution component)
const TEAM_PRIORITY_ORDER = [
  'Metrics / Core Workflows',
  'Offline / Evals',
  'Online / Monitoring',
  'API & SDK',
  'Applied Data Science',
  'Integrations',
  'Platform',
  'Developer Onboarding',
];

interface AIReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (apiKey: string, selectedTeams: string[], onProgress?: (progress: { stage: string; teamName?: string; current?: number; total?: number }) => void) => Promise<void>;
  onViewReport?: () => void;
  iterationName: string;
}

type GenerationStage =
  | 'idle'
  | 'preparing'
  | 'generating_teams'
  | 'generating_team'
  | 'generating_summary'
  | 'calculating'
  | 'storing'
  | 'complete'
  | 'error';

const STAGE_MESSAGES: Record<GenerationStage, string> = {
  idle: '',
  preparing: 'Preparing stories data...',
  generating_teams: 'Generating team reports...',
  generating_team: 'Generating report for team...',
  generating_summary: 'Generating executive summary...',
  calculating: 'Calculating metrics and team statistics...',
  storing: 'Storing report in database...',
  complete: 'Report generated successfully!',
  error: 'Error generating report',
};

export const AIReportModal: React.FC<AIReportModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  onViewReport,
  iterationName,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentStage, setCurrentStage] = useState<GenerationStage>('idle');
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [currentTeam, setCurrentTeam] = useState<string | null>(null);
  const [teamProgress, setTeamProgress] = useState<{ current: number; total: number } | null>(null);
  const [progressSteps, setProgressSteps] = useState<Array<{ label: string; completed: boolean }>>([]);

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Allow closing even during generation - generation will continue in background
        onClose();
        // Reset form state but don't interrupt generation
        if (!loading) {
          setApiKey('');
          setSuccess(false);
          setCurrentStage('idle');
          setCurrentTeam(null);
          setTeamProgress(null);
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, loading]);

  // Load teams when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccess(false);
      setCurrentStage('idle');
      setCurrentTeam(null);
      setTeamProgress(null);
      setProgressSteps([]);
      loadTeams();
    }
  }, [isOpen]);

  // Auto-close modal after successful report generation
  useEffect(() => {
    if (success && !loading) {
      const timer = setTimeout(() => {
        onClose();
        setApiKey('');
        setSuccess(false);
        setCurrentStage('idle');
        setCurrentTeam(null);
        setTeamProgress(null);
      }, 2000); // 2 second delay to show success message

      return () => clearTimeout(timer);
    }
  }, [success, loading, onClose]);

  const loadTeams = async () => {
    try {
      const allGroups = await api.getGroups();
      // Filter to only priority teams
      const priorityTeams = allGroups
        .filter((group: Group) => TEAM_PRIORITY_ORDER.includes(group.name))
        .map((group: Group) => group.name);
      
      setAvailableTeams(priorityTeams);
      // Select all teams by default
      setSelectedTeams(new Set(priorityTeams));
    } catch (err) {
      console.error('Error loading teams:', err);
      setError('Failed to load teams. Please try again.');
    }
  };

  const handleTeamToggle = (teamName: string) => {
    setSelectedTeams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamName)) {
        newSet.delete(teamName);
      } else {
        newSet.add(teamName);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedTeams(new Set(availableTeams));
  };

  const handleDeselectAll = () => {
    setSelectedTeams(new Set());
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      // Allow closing even during generation - generation will continue in background
      onClose();
      // Reset form state but don't interrupt generation
      if (!loading) {
        setApiKey('');
        setSuccess(false);
        setCurrentStage('idle');
        setCurrentTeam(null);
        setTeamProgress(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!apiKey.trim()) {
      setError('Please enter your OpenAI API key');
      return;
    }

    if (selectedTeams.size === 0) {
      setError('Please select at least one team to include in the report');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    // Initialize progress steps: one for each team + executive summary
    const selectedTeamsArray = Array.from(selectedTeams);
    const initialSteps = [
      ...selectedTeamsArray.map(team => ({ label: `Generate report for ${team}`, completed: false })),
      { label: 'Generate executive summary', completed: false }
    ];
    setProgressSteps(initialSteps);

    try {
      // Call with progress callback and selected teams
      await onGenerate(apiKey.trim(), selectedTeamsArray, (progress: { stage: string; teamName?: string; current?: number; total?: number }) => {
        setCurrentStage(progress.stage as GenerationStage);
        
        // Update progress steps based on stage and progress
        if (progress.stage === 'generating_team' && progress.teamName) {
          setCurrentTeam(progress.teamName);
          // When we start generating a team, mark the previous team as completed
          // progress.current is 1-indexed, so when current=2, we're on team 2, and team 1 (index 0) is done
          if (progress.current !== undefined && progress.current > 1) {
            const completedTeamIndex = progress.current - 2; // previous team (0-indexed)
            if (completedTeamIndex >= 0 && completedTeamIndex < selectedTeamsArray.length) {
              setProgressSteps(prev => 
                prev.map((step, index) => {
                  if (index === completedTeamIndex) {
                    return { ...step, completed: true };
                  }
                  return step;
                })
              );
            }
          }
        } else if (progress.stage === 'generating_summary') {
          // Mark all team steps as completed when starting summary (including the last one)
          setProgressSteps(prev => 
            prev.map((step, index) => {
              if (index < selectedTeamsArray.length) {
                return { ...step, completed: true };
              }
              return step;
            })
          );
        } else if (progress.stage === 'storing' || progress.stage === 'complete') {
          // Mark executive summary as completed
          setProgressSteps(prev => 
            prev.map((step, index) => {
              if (index === selectedTeamsArray.length) {
                return { ...step, completed: true };
              }
              return step;
            })
          );
        }
        
        if (progress.current !== undefined && progress.total !== undefined) {
          setTeamProgress({ current: progress.current, total: progress.total });
        } else {
          setTeamProgress(null);
        }
      });

      setCurrentStage('complete');
      setSuccess(true);
      setCurrentTeam(null);
      setTeamProgress(null);
      setLoading(false); // Ensure loading is false when success is shown
      // Mark all steps as completed
      setProgressSteps(prev => prev.map(step => ({ ...step, completed: true })));
      // Auto-close will be handled by useEffect watching success state
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setCurrentStage('error');
      setCurrentTeam(null);
      setTeamProgress(null);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ai-report-modal-backdrop" onClick={handleBackdropClick}>
      <div className="ai-report-modal">
        <div className="ai-report-modal-header">
          <h2>Generate AI Report</h2>
          <button
            className="ai-report-modal-close"
            onClick={() => {
              // Allow closing even during generation - generation will continue in background
              onClose();
              // Reset form state but don't interrupt generation
              if (!loading) {
                setApiKey('');
                setSuccess(false);
                setCurrentStage('idle');
                setCurrentTeam(null);
                setTeamProgress(null);
              }
            }}
            title={loading ? "Close (generation will continue in background)" : "Close"}
          >
            ×
          </button>
        </div>

        <div className="ai-report-modal-content">
          <div className="iteration-info">
            <span className="iteration-label">Iteration:</span>
            <span className="iteration-name">{iterationName}</span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="openai-key">OpenAI API Key</label>
              <input
                id="openai-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="api-key-input"
                disabled={loading}
                autoFocus
              />
              <div className="input-hint">
                Your API key will be used to generate the report and will not be stored.
              </div>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label htmlFor="teams-select">Select Teams to Include</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    disabled={loading}
                    className="team-select-btn"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    disabled={loading}
                    className="team-select-btn"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="teams-checkbox-container">
                {availableTeams.map((teamName) => (
                  <label key={teamName} className="team-checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedTeams.has(teamName)}
                      onChange={() => handleTeamToggle(teamName)}
                      disabled={loading}
                    />
                    <span>{teamName}</span>
                  </label>
                ))}
              </div>
              <div className="input-hint">
                Select which teams' insights to include in the report. This helps reduce token usage.
              </div>
            </div>

            {loading && !success && (
              <div className="progress-container">
                <div className="progress-spinner">
                  <div className="spinner"></div>
                </div>
                <div className="progress-message">
                  {STAGE_MESSAGES[currentStage]}
                </div>
                {progressSteps.length > 0 && (
                  <div className="progress-steps">
                    {progressSteps.map((step, index) => (
                      <div key={index} className={`progress-step ${step.completed ? 'completed' : ''}`}>
                        <span className="step-checkmark">
                          {step.completed ? '✓' : '○'}
                        </span>
                        <span className="step-label">{step.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="progress-warning">
                  <small style={{ fontSize: '12px', display: 'block' }}>
                    You can either stay on this modal or close it - generation will continue in the background. 
                    You can later come to "View Report" to see the generated report.
                  </small>
                </div>
              </div>
            )}

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {success && (
              <div className="success-message-container">
                <div className="success-message">
                  ✓ Report generated successfully!
                </div>
                <p className="success-prompt">
                  Click "View Report" below to see the generated report with all metrics and team breakdown.
                </p>
              </div>
            )}

            <div className="modal-actions">
              {success ? (
                <>
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => {
                      onClose();
                      setApiKey('');
                      setSuccess(false);
                      setCurrentStage('idle');
                    }}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn-view-report"
                    onClick={() => {
                      if (onViewReport) {
                        onViewReport();
                      }
                      onClose();
                      setApiKey('');
                      setSuccess(false);
                      setCurrentStage('idle');
                    }}
                  >
                    View Report
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => {
                      // Allow closing even during generation - generation will continue in background
                      onClose();
                      // Reset form state but don't interrupt generation
                      if (!loading) {
                        setApiKey('');
                        setSuccess(false);
                        setCurrentStage('idle');
                        setCurrentTeam(null);
                        setTeamProgress(null);
                      }
                    }}
                    title={loading ? "Close (generation will continue in background)" : "Cancel"}
                  >
                    {loading ? 'Close' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="btn-generate"
                    disabled={loading || !apiKey.trim()}
                  >
                    {loading ? 'Generating...' : 'Generate Report'}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
