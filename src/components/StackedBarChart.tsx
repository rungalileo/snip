import React, { useState } from 'react';
import './StackedBarChart.css';

interface StackedBarData {
  ownerId: string;
  ownerName: string;
  initials: string;
  labelCounts: { label: string; count: number }[];
  totalCount: number;
}

interface DistributionItem {
  label: string;
  count: number;
  percent: number;
}

interface StackedBarChartProps {
  data: StackedBarData[];
  title?: string;
  onBarClick?: (ownerId: string, label: string) => void;
  distribution?: DistributionItem[];
}

// Color palette for label types (matching BarChart)
const LABEL_COLORS: Record<string, string> = {
  'CUSTOMER ESCALATION': 'linear-gradient(180deg, #ef5350 0%, #e53935 100%)',
  'BUG': 'linear-gradient(180deg, #ffa726 0%, #fb8c00 100%)',
  'FOUNDATIONAL WORK': 'linear-gradient(180deg, #66bb6a 0%, #43a047 100%)',
  'PRODUCT FEATURE': 'linear-gradient(180deg, #42a5f5 0%, #1e88e5 100%)',
  'TASK': 'linear-gradient(180deg, #ab47bc 0%, #8e24aa 100%)',
  'SMALL IMPROVEMENT': 'linear-gradient(180deg, #26a69a 0%, #00897b 100%)',
  'CUSTOMER FEATURE REQUEST': 'linear-gradient(180deg, #7e57c2 0%, #5e35b1 100%)',
  'NICE TO HAVE': 'linear-gradient(180deg, #8d6e63 0%, #6d4c41 100%)',
  'OTHER': 'linear-gradient(180deg, #9e9e9e 0%, #757575 100%)', // Gray for unlabeled/other
};

export const StackedBarChart: React.FC<StackedBarChartProps> = ({ data, title, onBarClick, distribution }) => {
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
    <div className="stacked-bar-chart">
      {title && <h3 className="stacked-chart-title">{title}</h3>}

      {distribution && distribution.length > 0 && (
        <div className="chart-distribution">
          {distribution.map((item, index) => (
            <span key={index} className="distribution-item">
              <span className="distribution-label">{item.label}</span>
              <span className="distribution-percent">{item.percent}%</span>
            </span>
          ))}
        </div>
      )}

      <div className="stacked-chart-wrapper">
        {/* Y-axis labels */}
        <div className="stacked-y-labels">
          <div className="stacked-y-label">{yAxisMax}</div>
          <div className="stacked-y-label">{Math.round(yAxisMax * 0.75)}</div>
          <div className="stacked-y-label">{Math.round(yAxisMax * 0.5)}</div>
          <div className="stacked-y-label">{Math.round(yAxisMax * 0.25)}</div>
          <div className="stacked-y-label">0</div>
        </div>

        {/* Chart area */}
        <div className="stacked-chart-main">
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
