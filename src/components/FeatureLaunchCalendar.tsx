import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { EpicWithDetails } from '../types';
import './FeatureLaunchCalendar.css';

interface CalendarEpic extends EpicWithDetails {
  completion_date: string;
}

const getWeekStartDate = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
};

const getWeekEndDate = (date: Date): Date => {
  const weekStart = getWeekStartDate(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return weekEnd;
};

const formatWeekLabel = (weekStart: Date): string => {
  const month = weekStart.toLocaleDateString('en-US', { month: 'short' });
  const day = weekStart.getDate();
  const year = weekStart.getFullYear();
  const weekEnd = getWeekEndDate(weekStart);
  const endDay = weekEnd.getDate();
  const endMonth = weekEnd.toLocaleDateString('en-US', { month: 'short' });
  
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${month} ${day}-${endDay}, ${year}`;
  } else {
    return `${month} ${day} - ${endMonth} ${endDay}, ${year}`;
  }
};

const getWeeks = (startDate: Date, numWeeks: number = 12): Date[] => {
  const weeks: Date[] = [];
  for (let i = 0; i < numWeeks; i++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + (i * 7));
    weeks.push(getWeekStartDate(weekStart));
  }
  return weeks;
};

const getWeekForDate = (dateString: string, weeks: Date[]): Date | null => {
  const date = new Date(dateString);
  for (const weekStart of weeks) {
    const weekEnd = getWeekEndDate(weekStart);
    if (date >= weekStart && date <= weekEnd) {
      return weekStart;
    }
  }
  return null;
};

const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
};

export const FeatureLaunchCalendar: React.FC = () => {
  const [epics, setEpics] = useState<CalendarEpic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredEpic, setHoveredEpic] = useState<CalendarEpic | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isOverlayHovered, setIsOverlayHovered] = useState(false);

  useEffect(() => {
    loadCalendarData();
  }, []);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getFeatureLaunchCalendar();
      setEpics(data);
    } catch (err: any) {
      console.error('Failed to load calendar data:', err);
      setError(err.message || 'Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  };

  const handleEpicHover = (epic: CalendarEpic, event: React.MouseEvent) => {
    setHoveredEpic(epic);
    
    // Calculate overlay position to keep it within viewport
    const overlayWidth = 400; // Approximate overlay width
    const overlayHeight = 300; // Approximate overlay height
    const offset = 15; // Offset from cursor
    const padding = 20; // Padding from viewport edges
    
    let x = event.clientX + offset;
    let y = event.clientY + offset;
    
    // Check right edge
    if (x + overlayWidth > window.innerWidth - padding) {
      x = event.clientX - overlayWidth - offset;
    }
    
    // Check left edge
    if (x < padding) {
      x = padding;
    }
    
    // Check bottom edge
    if (y + overlayHeight > window.innerHeight - padding) {
      y = event.clientY - overlayHeight - offset;
    }
    
    // Check top edge
    if (y < padding) {
      y = padding;
    }
    
    setHoverPosition({ x, y });
  };

  const handleEpicLeave = () => {
    // Don't hide when leaving epic - let overlay handle its own mouse leave
    // This allows smooth transition from epic to overlay
  };

  const handleOverlayEnter = () => {
    // Keep overlay visible when mouse enters it
    setIsOverlayHovered(true);
  };

  const handleOverlayLeave = () => {
    // Only hide when mouse completely leaves the overlay
    setIsOverlayHovered(false);
    setHoveredEpic(null);
  };

  if (loading) {
    return (
      <div className="feature-launch-calendar">
        <div className="calendar-loading">Loading Feature Launch Calendar...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="feature-launch-calendar">
        <div className="calendar-error">
          <p>Error: {error}</p>
          <button onClick={loadCalendarData} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Calculate weeks (12 weeks from today)
  const today = new Date();
  const weeks = getWeeks(today, 12);

  // Group epics by week
  const epicsByWeek = new Map<string, CalendarEpic[]>();
  weeks.forEach(weekStart => {
    const weekKey = weekStart.toISOString();
    epicsByWeek.set(weekKey, []);
  });

  epics.forEach(epic => {
    const weekStart = getWeekForDate(epic.completion_date, weeks);
    if (weekStart) {
      const weekKey = weekStart.toISOString();
      const weekEpics = epicsByWeek.get(weekKey) || [];
      weekEpics.push(epic);
      epicsByWeek.set(weekKey, weekEpics);
    }
  });

  return (
    <div className="feature-launch-calendar">
      <div className="calendar-header">
        <h2>Feature Launch Calendar</h2>
        <button onClick={loadCalendarData} className="refresh-button" title="Refresh">
          ↻
        </button>
      </div>

      <div className="calendar-container">
        <div className="calendar-weeks">
          {weeks.map((weekStart, index) => {
            const weekKey = weekStart.toISOString();
            const weekEpics = epicsByWeek.get(weekKey) || [];
            
            return (
              <div key={weekKey} className="calendar-week">
                <div className="week-header">
                  <div className="week-label">{formatWeekLabel(weekStart)}</div>
                  <div className="week-count">{weekEpics.length} {weekEpics.length === 1 ? 'Epic' : 'Epics'}</div>
                </div>
                <div className="week-epics">
                  {weekEpics.length === 0 ? (
                    <div className="no-epics">No epics completing this week</div>
                  ) : (
                    weekEpics.map((epic) => (
                      <a
                        key={epic.id}
                        href={epic.app_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="epic-calendar-item"
                        onMouseEnter={(e) => handleEpicHover(epic, e)}
                        onMouseLeave={handleEpicLeave}
                      >
                        {epic.name}
                      </a>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hover Overlay */}
      {hoveredEpic && (
        <div
          className="epic-hover-overlay"
          style={{
            left: `${hoverPosition.x + 15}px`,
            top: `${hoverPosition.y + 15}px`,
          }}
          onMouseEnter={handleOverlayEnter}
          onMouseLeave={handleOverlayLeave}
        >
          <div className="overlay-header">
            <h3 className="overlay-title">{hoveredEpic.name}</h3>
            <a
              href={hoveredEpic.app_url}
              target="_blank"
              rel="noopener noreferrer"
              className="overlay-link"
              onClick={(e) => e.stopPropagation()}
            >
              View in Shortcut →
            </a>
          </div>

          <div className="overlay-content">
            {hoveredEpic.target_date && (
              <div className="overlay-row">
                <span className="overlay-label">Target Date:</span>
                <span className="overlay-value">{formatDate(hoveredEpic.target_date)}</span>
              </div>
            )}

            {hoveredEpic.start_date && (
              <div className="overlay-row">
                <span className="overlay-label">Start Date:</span>
                <span className="overlay-value">{formatDate(hoveredEpic.start_date)}</span>
              </div>
            )}

            <div className="overlay-row">
              <span className="overlay-label">Status:</span>
              <span className="overlay-value">{hoveredEpic.status || 'Unknown'}</span>
            </div>

            {hoveredEpic.teams && hoveredEpic.teams.length > 0 && (
              <div className="overlay-row">
                <span className="overlay-label">Teams:</span>
                <span className="overlay-value">
                  {hoveredEpic.teams.map(t => t.name).join(', ')}
                </span>
              </div>
            )}

            {hoveredEpic.owners && hoveredEpic.owners.length > 0 && (
              <div className="overlay-row">
                <span className="overlay-label">Owners:</span>
                <span className="overlay-value">
                  {hoveredEpic.owners.map(o => o.name).join(', ')}
                </span>
              </div>
            )}

            {hoveredEpic.description && (
              <div className="overlay-description">
                <span className="overlay-label">Description:</span>
                <p className="overlay-description-text">{hoveredEpic.description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
