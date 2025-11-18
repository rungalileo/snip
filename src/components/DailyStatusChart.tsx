import React from 'react';
import './DailyStatusChart.css';

interface DailyStatusData {
  date: string;
  completed: number;
  inMotion: number;
  notStarted: number;
}

interface DailyStatusChartProps {
  data: DailyStatusData[];
  title: string;
}

export const DailyStatusChart: React.FC<DailyStatusChartProps> = ({ data, title }) => {
  if (data.length === 0) {
    return <div className="daily-status-chart-empty">No data available</div>;
  }

  // Calculate max total for scaling
  const maxTotal = Math.max(
    ...data.map(d => d.completed + d.inMotion + d.notStarted),
    1
  );

  // Format date for display (e.g., "11/17")
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="daily-status-chart">
      <h3 className="chart-title">{title}</h3>
      <div className="chart-container">
        <div className="chart-bars">
          {data.map((item, index) => {
            const total = item.completed + item.inMotion + item.notStarted;
            const completedPercent = total > 0 ? (item.completed / total) * 100 : 0;
            const inMotionPercent = total > 0 ? (item.inMotion / total) * 100 : 0;
            const notStartedPercent = total > 0 ? (item.notStarted / total) * 100 : 0;

            return (
              <div key={index} className="bar-column">
                <div className="bar-wrapper">
                  <div
                    className="stacked-bar"
                    style={{
                      height: `${(total / maxTotal) * 100}%`,
                      minHeight: total > 0 ? '2px' : '0px',
                    }}
                  >
                    {item.completed > 0 && (
                      <div
                        className="bar-segment completed"
                        style={{ height: `${completedPercent}%` }}
                        title={`Completed: ${item.completed}`}
                      >
                        {item.completed > 0 && <span className="segment-count">{item.completed}</span>}
                      </div>
                    )}
                    {item.inMotion > 0 && (
                      <div
                        className="bar-segment in-motion"
                        style={{ height: `${inMotionPercent}%` }}
                        title={`In Motion: ${item.inMotion}`}
                      >
                        {item.inMotion > 0 && <span className="segment-count">{item.inMotion}</span>}
                      </div>
                    )}
                    {item.notStarted > 0 && (
                      <div
                        className="bar-segment not-started"
                        style={{ height: `${notStartedPercent}%` }}
                        title={`Not Started: ${item.notStarted}`}
                      >
                        {item.notStarted > 0 && <span className="segment-count">{item.notStarted}</span>}
                      </div>
                    )}
                  </div>
                </div>
                <div className="bar-label">{formatDate(item.date)}</div>
              </div>
            );
          })}
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="legend-color completed"></div>
            <span>Completed</span>
          </div>
          <div className="legend-item">
            <div className="legend-color in-motion"></div>
            <span>In Motion</span>
          </div>
          <div className="legend-item">
            <div className="legend-color not-started"></div>
            <span>Not Started</span>
          </div>
        </div>
      </div>
    </div>
  );
};
