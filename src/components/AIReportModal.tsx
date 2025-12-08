import React, { useState, useEffect } from 'react';
import './AIReportModal.css';

interface AIReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (apiKey: string) => Promise<void>;
  iterationName: string;
}

export const AIReportModal: React.FC<AIReportModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  iterationName,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, loading]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!apiKey.trim()) {
      setError('Please enter your OpenAI API key');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await onGenerate(apiKey.trim());
      setSuccess(true);

      // Close modal after success
      setTimeout(() => {
        onClose();
        setApiKey('');
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
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
            onClick={onClose}
            disabled={loading}
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

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {success && (
              <div className="success-message">
                ✓ Report generated successfully!
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-generate"
                disabled={loading || !apiKey.trim()}
              >
                {loading ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
