import React, { useState, useEffect } from 'react';
import './ReportViewModal.css';

interface Report {
  report_content: string;
  metrics: {
    total_stories: number;
    completed_count: number;
    in_motion_count: number;
    not_started_count: number;
    completed_percentage: number;
    in_motion_percentage: number;
    not_started_percentage: number;
  };
  team_metrics: Array<{
    team_name: string;
    total_stories: number;
    completed_percentage: number;
    in_motion_percentage: number;
    not_started_percentage: number;
    status_breakdown: Record<string, number>;
  }>;
  generated_at: string;
}

interface ReportViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  iterationId: number | null;
  iterationName: string;
  onFetchReports: (iterationId: number) => Promise<{
    iteration_id: number;
    reports: Report[];
    total_count: number;
  }>;
}

export const ReportViewModal: React.FC<ReportViewModalProps> = ({
  isOpen,
  onClose,
  iterationId,
  iterationName,
  onFetchReports,
}) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportIndex, setSelectedReportIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch reports when modal opens
  useEffect(() => {
    if (isOpen && iterationId) {
      loadReports();
    }
  }, [isOpen, iterationId]);

  const loadReports = async () => {
    if (!iterationId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await onFetchReports(iterationId);
      if (data.reports.length === 0) {
        setError('No reports have been generated for this iteration yet.');
      } else {
        setReports(data.reports);
        setSelectedReportIndex(0); // Select the latest report by default
      }
    } catch (err: any) {
      setError(err.response?.status === 404
        ? 'No reports found for this iteration.'
        : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const selectedReport = reports[selectedReportIndex];

  if (!isOpen) return null;

  return (
    <div className="report-view-modal-backdrop" onClick={handleBackdropClick}>
      <div className="report-view-modal">
        <div className="report-view-modal-header">
          <h2>Iteration Reports: {iterationName}</h2>
          <button className="report-view-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="report-view-modal-content">
          {loading && (
            <div className="report-loading">
              <div className="spinner"></div>
              <p>Loading reports...</p>
            </div>
          )}

          {error && (
            <div className="report-error">
              {error}
            </div>
          )}

          {!loading && !error && reports.length > 0 && (
            <>
              {/* Report Selector */}
              {reports.length > 1 && (
                <div className="report-selector">
                  <label htmlFor="report-select">Select Report:</label>
                  <select
                    id="report-select"
                    value={selectedReportIndex}
                    onChange={(e) => setSelectedReportIndex(parseInt(e.target.value))}
                    className="report-select"
                  >
                    {reports.map((report, index) => (
                      <option key={index} value={index}>
                        {new Date(report.generated_at).toLocaleString()}
                        {index === 0 && ' (Latest)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedReport && (
                <>
                  {/* Metrics Overview */}
                  <div className="metrics-overview">
                    <h3>Overall Progress</h3>
                    <div className="metrics-cards">
                      <div className="metric-card completed">
                        <div className="metric-value">{selectedReport.metrics.completed_percentage}%</div>
                        <div className="metric-label">Completed</div>
                        <div className="metric-count">{selectedReport.metrics.completed_count} stories</div>
                      </div>
                      <div className="metric-card in-motion">
                        <div className="metric-value">{selectedReport.metrics.in_motion_percentage}%</div>
                        <div className="metric-label">In Motion</div>
                        <div className="metric-count">{selectedReport.metrics.in_motion_count} stories</div>
                      </div>
                      <div className="metric-card not-started">
                        <div className="metric-value">{selectedReport.metrics.not_started_percentage}%</div>
                        <div className="metric-label">Not Started</div>
                        <div className="metric-count">{selectedReport.metrics.not_started_count} stories</div>
                      </div>
                      <div className="metric-card total">
                        <div className="metric-value">{selectedReport.metrics.total_stories}</div>
                        <div className="metric-label">Total Stories</div>
                      </div>
                    </div>
                  </div>

                  {/* Team Breakdown */}
                  {selectedReport.team_metrics.length > 0 && (
                    <div className="team-breakdown">
                      <h3>Team Breakdown</h3>
                      <div className="team-grid">
                        {selectedReport.team_metrics.map((team, index) => (
                          <div key={index} className="team-card">
                            <div className="team-name">{team.team_name}</div>
                            <div className="team-stats">
                              <div className="team-stat">
                                <span className="stat-label">Completed:</span>
                                <span className="stat-value">{team.completed_percentage}%</span>
                              </div>
                              <div className="team-stat">
                                <span className="stat-label">In Motion:</span>
                                <span className="stat-value">{team.in_motion_percentage}%</span>
                              </div>
                              <div className="team-stat">
                                <span className="stat-label">Total:</span>
                                <span className="stat-value">{team.total_stories} stories</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Report Content */}
                  <div className="report-content">
                    <h3>AI-Generated Report</h3>
                    <div className="report-text">
                      {selectedReport.report_content.split('\n').map((line, index) => {
                        // Simple markdown formatting
                        if (line.startsWith('# ')) {
                          return <h1 key={index}>{line.substring(2)}</h1>;
                        } else if (line.startsWith('## ')) {
                          return <h2 key={index}>{line.substring(3)}</h2>;
                        } else if (line.startsWith('### ')) {
                          return <h3 key={index}>{line.substring(4)}</h3>;
                        } else if (line.startsWith('- ')) {
                          return <li key={index}>{line.substring(2)}</li>;
                        } else if (line.trim() === '') {
                          return <br key={index} />;
                        } else {
                          return <p key={index}>{line}</p>;
                        }
                      })}
                    </div>
                  </div>

                  {/* Generated Timestamp */}
                  <div className="report-footer">
                    <small>Generated: {new Date(selectedReport.generated_at).toLocaleString()}</small>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
