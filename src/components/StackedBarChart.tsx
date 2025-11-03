import React, { useState } from 'react';
import './StackedBarChart.css';

interface StackedBarData {
  ownerId: string;
  ownerName: string;
  initials: string;
  labelCounts: { label: string; count: number }[];
  totalCount: number;
}

interface StackedBarChartProps {
  data: StackedBarData[];
  title?: string;
  onBarClick?: (ownerId: string, label: string) => void;
}

// Color palette for label types (matching BarChart)
const LABEL_COLORS: Record<string, string> = {
  'CUSTOMER ESCALATION': 'linear-gradient(180deg, #e53935 0%, #c62828 100%)',
  'BUG': 'linear-gradient(180deg, #fb8c00 0%, #ef6c00 100%)',
  'FOUNDATIONAL WORK': 'linear-gradient(180deg, #43a047 0%, #2e7d32 100%)',
  'PRODUCT FEATURE': 'linear-gradient(180deg, #1e88e5 0%, #1565c0 100%)',
  'TASK': 'linear-gradient(180deg, #9c27b0 0%, #7b1fa2 100%)',
  'VIBE-CODEABLE': 'linear-gradient(180deg, #00897b 0%, #00695c 100%)',
  'CUSTOMER FEATURE REQUEST': 'linear-gradient(180deg, #7c4dff 0%, #651fff 100%)',
  'NICE TO HAVE': 'linear-gradient(180deg, #78909c 0%, #546e7a 100%)',
};

export const StackedBarChart: React.FC<StackedBarChartProps> = ({ data, title, onBarClick }) => {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Calculate max total for y-axis
  const maxTotal = Math.max(...data.map(d => d.totalCount), 1);
  const yAxisMax = Math.ceil(maxTotal * 1.25);

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    setHoveredBar(index);
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  // Calculate minimum width based on number of bars
  // Each bar needs 30px (22px bar + 8px gap)
  const barWidth = 30; // 22px bar + 8px gap
  const padding = 26; // left padding (10px) + right padding (16px)
  const minWidth = (data.length * barWidth) + padding;
  const needsScroll = data.length > 20; // Enable scrolling when more than 20 bars

  return (
    <div className="stacked-bar-chart">
      {title && <h3 className="stacked-chart-title">{title}</h3>}

      <div className="stacked-chart-wrapper" style={{ overflowX: needsScroll ? 'auto' : 'visible' }}>
        {/* Y-axis labels */}
        <div className="stacked-y-labels">
          <div className="stacked-y-label">{yAxisMax}</div>
          <div className="stacked-y-label">{Math.round(yAxisMax * 0.75)}</div>
          <div className="stacked-y-label">{Math.round(yAxisMax * 0.5)}</div>
          <div className="stacked-y-label">{Math.round(yAxisMax * 0.25)}</div>
          <div className="stacked-y-label">0</div>
        </div>

        {/* Chart area */}
        <div className="stacked-chart-main" style={{ minWidth: needsScroll ? `${minWidth}px` : 'auto' }}>
          {/* Grid */}
          <div className="stacked-grid">
            <div className="stacked-grid-line"></div>
            <div className="stacked-grid-line"></div>
            <div className="stacked-grid-line"></div>
            <div className="stacked-grid-line"></div>
            <div className="stacked-grid-line"></div>
          </div>

          {/* Bars container */}
          <div className="stacked-bars-area">
            {data.map((owner, index) => {
              const heightPercent = yAxisMax > 0 ? (owner.totalCount / yAxisMax) * 100 : 0;

              return (
                <div
                  key={owner.ownerId}
                  className="stacked-bar-item"
                  onMouseMove={(e) => handleMouseMove(e, index)}
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  <div className="stacked-bar-column">
                    {owner.totalCount > 0 && (
                      <div
                        className="stacked-bar"
                        style={{ height: `${heightPercent}%` }}
                      >
                        {owner.labelCounts.map((labelData, labelIndex) => {
                          const segmentPercent = owner.totalCount > 0
                            ? (labelData.count / owner.totalCount) * 100
                            : 0;

                          if (labelData.count === 0) return null;

                          return (
                            <div
                              key={labelIndex}
                              className="bar-segment"
                              style={{
                                height: `${segmentPercent}%`,
                                background: LABEL_COLORS[labelData.label] || '#ccc',
                              }}
                              onClick={() => onBarClick && onBarClick(owner.ownerId, labelData.label)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="stacked-x-labels">
            {data.map((owner) => (
              <div key={owner.ownerId} className="stacked-x-label-item">
                <div className="stacked-bar-label">{owner.initials}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip - rendered at cursor position */}
      {hoveredBar !== null && data[hoveredBar] && (
        <div
          className="stacked-bar-tooltip-cursor"
          style={{
            left: `${mousePosition.x}px`,
            top: `${mousePosition.y}px`,
          }}
        >
          <div className="stacked-tooltip-title">{data[hoveredBar].ownerName}</div>
          <div className="stacked-tooltip-total">
            {data[hoveredBar].totalCount} {data[hoveredBar].totalCount === 1 ? 'story' : 'stories'}
          </div>
          <div className="stacked-tooltip-breakdown">
            {data[hoveredBar].labelCounts
              .filter(lc => lc.count > 0)
              .map((lc, idx) => (
                <div key={idx} className="breakdown-item">
                  <span
                    className="breakdown-color"
                    style={{ background: LABEL_COLORS[lc.label] }}
                  ></span>
                  <span className="breakdown-label">{lc.label}</span>
                  <span className="breakdown-count">{lc.count}</span>
                </div>
              ))}
          </div>
          <div className="stacked-tooltip-cta">Click segment to view details →</div>
        </div>
      )}
    </div>
  );
};
