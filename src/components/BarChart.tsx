import React, { useState } from 'react';
import './BarChart.css';

interface BarChartProps {
  data: { label: string; count: number }[];
  title?: string;
  maxCount?: number;
  onBarClick?: (label: string) => void;
}

export const BarChart: React.FC<BarChartProps> = ({ data, title, maxCount, onBarClick }) => {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const dataMax = maxCount || Math.max(...data.map(d => d.count), 1);
  // Add 25% headroom for visual spacing at the top
  const yAxisMax = Math.ceil(dataMax * 1.25);

  // Calculate total count for percentage
  const totalCount = data.reduce((sum, item) => sum + item.count, 0);

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    setHoveredBar(index);
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  // Color palette for bars
  const colors = [
    'linear-gradient(180deg, #e53935 0%, #c62828 100%)', // Red
    'linear-gradient(180deg, #fb8c00 0%, #ef6c00 100%)', // Orange
    'linear-gradient(180deg, #43a047 0%, #2e7d32 100%)', // Green
    'linear-gradient(180deg, #1e88e5 0%, #1565c0 100%)', // Blue
    'linear-gradient(180deg, #9c27b0 0%, #7b1fa2 100%)', // Purple
    'linear-gradient(180deg, #00897b 0%, #00695c 100%)', // Teal
    'linear-gradient(180deg, #7c4dff 0%, #651fff 100%)', // Deep Purple
    'linear-gradient(180deg, #78909c 0%, #546e7a 100%)', // Blue Grey
  ];

  return (
    <div className="bar-chart">
      {title && <h3 className="bar-chart-title">{title}</h3>}

      <div className="chart-wrapper">
        {/* Y-axis labels */}
        <div className="y-labels">
          <div className="y-label">{yAxisMax}</div>
          <div className="y-label">{Math.round(yAxisMax * 0.75)}</div>
          <div className="y-label">{Math.round(yAxisMax * 0.5)}</div>
          <div className="y-label">{Math.round(yAxisMax * 0.25)}</div>
          <div className="y-label">0</div>
        </div>

        {/* Chart area */}
        <div className="chart-main">
          {/* Grid */}
          <div className="grid">
            <div className="grid-line"></div>
            <div className="grid-line"></div>
            <div className="grid-line"></div>
            <div className="grid-line"></div>
            <div className="grid-line"></div>
          </div>

          {/* Bars container */}
          <div className="bars-area">
            {data.map((item, index) => {
              // Calculate height as percentage of yAxisMax (includes headroom)
              const heightPercent = yAxisMax > 0 ? (item.count / yAxisMax) * 100 : 0;
              const finalHeight = item.count > 0 ? Math.max(heightPercent, 2) : 0;

              return (
                <div
                  key={index}
                  className="bar-item"
                  onMouseMove={(e) => handleMouseMove(e, index)}
                  onMouseLeave={() => setHoveredBar(null)}
                >
                  <div className="bar-column">
                    {item.count > 0 && (
                      <div
                        className="bar"
                        style={{
                          height: `${finalHeight}%`,
                          background: colors[index % colors.length]
                        }}
                        onClick={() => onBarClick && onBarClick(item.label)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="x-labels">
            {data.map((item, index) => (
              <div key={index} className="x-label-item">
                <div className="bar-label">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip - rendered at cursor position */}
      {hoveredBar !== null && data[hoveredBar] && (
        <div
          className="bar-tooltip-cursor"
          style={{
            left: `${mousePosition.x}px`,
            top: `${mousePosition.y}px`,
          }}
        >
          <div className="tooltip-title">{data[hoveredBar].label}</div>
          <div className="tooltip-count">
            {data[hoveredBar].count} {data[hoveredBar].count === 1 ? 'story' : 'stories'}
          </div>
          <div className="tooltip-percentage">
            {totalCount > 0 ? ((data[hoveredBar].count / totalCount) * 100).toFixed(1) : 0}% of total
          </div>
          <div className="tooltip-cta">Click to view details →</div>
        </div>
      )}
    </div>
  );
};
