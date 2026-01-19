import React, { useState } from 'react';
import './StatusStackedBarChart.css';

interface StatusStackedBarData {
  label: string;
  fullName?: string;
  ownerId?: string;
  completedCount: number;
  inMotionCount: number;
  notStartedCount: number;
  totalCount: number;
}

interface DistributionItem {
  label: string;
  count: number;
  percent: number;
}

interface StatusStackedBarChartProps {
  data: StatusStackedBarData[];
  title?: string;
  onBarClick?: (label: string, status: 'completed' | 'inMotion' | 'notStarted') => void;
  overallStats?: {
    completedPercent: number;
    inMotionPercent: number;
    notStartedPercent: number;
  };
  distribution?: DistributionItem[];
  planningStats?: {
    plannedPercent: number;
    unplannedPercent: number;
    plannedCount: number;
    unplannedCount: number;
  };
  onPlanningChipClick?: (type: 'planned' | 'unplanned') => void;
}

// Color palette for status types
const STATUS_COLORS = {
  completed: 'linear-gradient(180deg, #66bb6a 0%, #43a047 100%)', // Green
  inMotion: 'linear-gradient(180deg, #ffa726 0%, #fb8c00 100%)', // Orange
  notStarted: 'linear-gradient(180deg, #ef5350 0%, #e53935 100%)', // Red
};

export const StatusStackedBarChart: React.FC<StatusStackedBarChartProps> = ({ data, title, onBarClick, overallStats, distribution, planningStats, onPlanningChipClick }) => {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Calculate max total for y-axis
  const maxTotal = Math.max(...data.map(d => d.totalCount), 1);
  const yAxisMax = Math.ceil(maxTotal * 1.25);

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    setHoveredBar(index);
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="status-stacked-bar-chart">
      {title && <h3 className="status-chart-title">{title}</h3>}

      {overallStats && (
        <div className="status-overall-chips">
          <div className="status-chip status-chip-completed">
            <span className="status-chip-label">Completed</span>
            <span className="status-chip-value">{overallStats.completedPercent}%</span>
          </div>
          <div className="status-chip status-chip-in-motion">
            <span className="status-chip-label">In Motion</span>
            <span className="status-chip-value">{overallStats.inMotionPercent}%</span>
          </div>
          <div className="status-chip status-chip-not-started">
            <span className="status-chip-label">Not Started</span>
            <span className="status-chip-value">{overallStats.notStartedPercent}%</span>
          </div>
          {planningStats && (
            <>
              <div className="status-chip-divider" />
              <div
                className="status-chip status-chip-planned"
                onClick={() => onPlanningChipClick?.('planned')}
              >
                <span className="status-chip-label">Planned</span>
                <span className="status-chip-value">{planningStats.plannedCount}</span>
              </div>
              <div
                className="status-chip status-chip-unplanned"
                onClick={() => onPlanningChipClick?.('unplanned')}
              >
                <span className="status-chip-label">Unplanned</span>
                <span className="status-chip-value">{planningStats.unplannedCount}</span>
              </div>
            </>
          )}
        </div>
      )}

      {distribution && distribution.length > 0 && (
        <div className="chart-distribution">
          {distribution.map((item, index) => {
            // Calculate depth based on percentage (0-100 maps to opacity 0.05-0.25)
            const depth = Math.min(0.25, 0.05 + (item.percent / 100) * 0.20);
            const bgColor = `rgba(100, 100, 100, ${depth})`;
            return (
              <span
                key={index}
                className="distribution-item"
                style={{ backgroundColor: bgColor }}
              >
                <span className="distribution-percent">{item.percent}%</span>
                <span className="distribution-label">{item.label}</span>
              </span>
            );
          })}
        </div>
      )}

      <div className="status-chart-wrapper">
        {/* Y-axis labels */}
        <div className="status-y-labels">
          <div className="status-y-label">{yAxisMax}</div>
          <div className="status-y-label">{Math.round(yAxisMax * 0.75)}</div>
          <div className="status-y-label">{Math.round(yAxisMax * 0.5)}</div>
          <div className="status-y-label">{Math.round(yAxisMax * 0.25)}</div>
          <div className="status-y-label">0</div>
        </div>

        {/* Chart area */}
        <div className="status-chart-main">
          {/* Grid */}
          <div className="status-grid">
            <div className="status-grid-line"></div>
            <div className="status-grid-line"></div>
            <div className="status-grid-line"></div>
            <div className="status-grid-line"></div>
            <div className="status-grid-line"></div>
          </div>

          {/* Bars container */}
          <div className="status-bars-area">
            {data.map((item, index) => {
              const heightPercent = yAxisMax > 0 ? (item.totalCount / yAxisMax) * 100 : 0;

              return (
                <div
                  key={index}
                  className="status-bar-item"
                  onMouseMove={(e) => handleMouseMove(e, index)}
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  <div className="status-bar-column">
                    {item.totalCount > 0 && (
                      <div
                        className="status-bar"
                        style={{ height: `${heightPercent}%` }}
                      >
                        {/* Not Started segment (bottom) */}
                        {item.notStartedCount > 0 && (
                          <div
                            className="status-segment"
                            style={{
                              height: `${(item.notStartedCount / item.totalCount) * 100}%`,
                              background: STATUS_COLORS.notStarted,
                            }}
                            onClick={() => onBarClick && onBarClick(item.label, 'notStarted')}
                          />
                        )}
                        {/* In Motion segment (middle) */}
                        {item.inMotionCount > 0 && (
                          <div
                            className="status-segment"
                            style={{
                              height: `${(item.inMotionCount / item.totalCount) * 100}%`,
                              background: STATUS_COLORS.inMotion,
                            }}
                            onClick={() => onBarClick && onBarClick(item.label, 'inMotion')}
                          />
                        )}
                        {/* Completed segment (top) */}
                        {item.completedCount > 0 && (
                          <div
                            className="status-segment"
                            style={{
                              height: `${(item.completedCount / item.totalCount) * 100}%`,
                              background: STATUS_COLORS.completed,
                            }}
                            onClick={() => onBarClick && onBarClick(item.label, 'completed')}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="status-x-labels">
            {data.map((item, index) => (
              <div key={index} className="status-x-label-item">
                <div className="status-bar-label">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip - rendered at cursor position */}
      {hoveredBar !== null && data[hoveredBar] && (
        <div
          className="status-bar-tooltip-cursor"
          style={{
            left: `${mousePosition.x}px`,
            top: `${mousePosition.y}px`,
          }}
        >
          <div className="status-tooltip-title">{data[hoveredBar].fullName || data[hoveredBar].label}</div>
          <div className="status-tooltip-total">
            {data[hoveredBar].totalCount} {data[hoveredBar].totalCount === 1 ? 'story' : 'stories'}
          </div>
          <div className="status-tooltip-breakdown">
            {data[hoveredBar].completedCount > 0 && (
              <div className="status-breakdown-item">
                <span
                  className="status-breakdown-color"
                  style={{ background: STATUS_COLORS.completed }}
                ></span>
                <span className="status-breakdown-label">Completed</span>
                <span className="status-breakdown-count">{data[hoveredBar].completedCount}</span>
              </div>
            )}
            {data[hoveredBar].inMotionCount > 0 && (
              <div className="status-breakdown-item">
                <span
                  className="status-breakdown-color"
                  style={{ background: STATUS_COLORS.inMotion }}
                ></span>
                <span className="status-breakdown-label">In Motion</span>
                <span className="status-breakdown-count">{data[hoveredBar].inMotionCount}</span>
              </div>
            )}
            {data[hoveredBar].notStartedCount > 0 && (
              <div className="status-breakdown-item">
                <span
                  className="status-breakdown-color"
                  style={{ background: STATUS_COLORS.notStarted }}
                ></span>
                <span className="status-breakdown-label">Not Started</span>
                <span className="status-breakdown-count">{data[hoveredBar].notStartedCount}</span>
              </div>
            )}
          </div>
          <div className="status-tooltip-cta">Click segment to view details →</div>
        </div>
      )}
    </div>
  );
};
