import React, { useState, useEffect } from 'react';
import { EpicSelector } from './components/EpicSelector';
import { StoriesList } from './components/StoriesList';
import { StoryModal } from './components/StoryModal';
import { StoriesTableModal } from './components/StoriesTableModal';
import { AIReportModal } from './components/AIReportModal';
import { ReportViewModal } from './components/ReportViewModal';
import { Execution } from './components/Execution';
import { MajorInitiatives } from './components/MajorInitiatives';
import { Customers } from './components/Customers';
import { FeatureLaunchCalendar } from './components/FeatureLaunchCalendar';
import { DevOpsEngagement } from './components/DevOpsEngagement';
import { Epic, Story } from './types';
import { api } from './api';
import './App.css';

type MainView = 'execution' | 'epics' | 'major-initiatives' | 'customers' | 'feature-launch-calendar' | 'devops-engagement';

function App() {
  const [mainView, setMainView] = useState<MainView>('execution');
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [allStories, setAllStories] = useState<Story[]>([]);
  const [isBookmarksModalOpen, setIsBookmarksModalOpen] = useState(false);
  const [bookmarkedStories, setBookmarkedStories] = useState<Story[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [selectedIterationName, setSelectedIterationName] = useState<string | null>(null);

  // AI Report state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isViewReportModalOpen, setIsViewReportModalOpen] = useState(false);
  const [currentIterationId, setCurrentIterationId] = useState<number | null>(null);
  const [currentIterationStories, setCurrentIterationStories] = useState<Story[]>([]);
  const [currentIterationName, setCurrentIterationName] = useState<string | null>(null);

  // Debug: Log when iteration data changes
  useEffect(() => {
    console.log('Iteration data changed:', {
      mainView,
      currentIterationId,
      currentIterationName,
      selectedIterationName,
      storiesCount: currentIterationStories.length,
      showButtons: mainView === 'execution' && currentIterationId !== null
    });
  }, [mainView, currentIterationId, currentIterationName, selectedIterationName, currentIterationStories]);

  // Handle URL changes and read iteration parameter from path
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);

      // Match /iteration/xxx pattern (execution with iteration)
      const iterationMatch = path.match(/^\/iteration\/([^/]+)$/);
      if (iterationMatch) {
        const iterationName = decodeURIComponent(iterationMatch[1]);
        setMainView('execution');
        setSelectedIterationName(iterationName);
        return;
      }

      // Match other routes
      if (path === '/epics') {
        setMainView('epics');
        setSelectedIterationName(null);
        return;
      }
      if (path === '/major-initiatives') {
        setMainView('major-initiatives');
        setSelectedIterationName(null);
        return;
      }
      if (path === '/customers') {
        setMainView('customers');
        setSelectedIterationName(null);
        return;
      }

      // Backwards compatibility: support old query param format
      if (searchParams.has('iteration')) {
        const iterationName = searchParams.get('iteration');
        if (iterationName) {
          setMainView('execution');
          setSelectedIterationName(decodeURIComponent(iterationName));
          // Redirect to new URL format
          window.history.replaceState({}, '', `/iteration/${encodeURIComponent(iterationName)}`);
          return;
        }
      }

      // Default: execution view (root path or unknown path)
      setMainView('execution');
      setSelectedIterationName(null);
    };

    // Check initial URL
    handlePopState();

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleEpicSelect = (epic: Epic) => {
    setSelectedEpic(epic);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    // Delay clearing the epic to allow animation to complete
    setTimeout(() => {
      setSelectedEpic(null);
      setSelectedStory(null);
      setAllStories([]);
    }, 200);
  };

  const handleViewBookmarks = async () => {
    try {
      const data = await api.getBookmarks();
      setBookmarkedStories(data);
      setBookmarkedIds(new Set(data.map(s => s.id)));
      setIsBookmarksModalOpen(true);
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    }
  };

  const handleGenerateReport = async (
    apiKey: string,
    selectedTeams: string[],
    onProgress?: (progress: { stage: string; teamName?: string; current?: number; total?: number }) => void
  ) => {
    if (!currentIterationId || !currentIterationName) {
      throw new Error('No iteration selected');
    }

    try {
      // Generate and store in one call - progress is handled by SSE from the server
      const result = await api.generateReport(
        currentIterationId,
        currentIterationStories,
        apiKey,
        selectedTeams,
        onProgress
      );

      console.log('Report generated and stored successfully');
      console.log('Metrics:', result.metrics);

    } catch (err) {
      console.error('Failed to generate report:', err);
      throw err;
    }
  };

  const handleViewReport = async () => {
    if (!currentIterationId) {
      alert('No iteration selected');
      return;
    }

    // Open the report view modal
    setIsViewReportModalOpen(true);
  };

  const handleFetchReportHistory = async (iterationId: number) => {
    return await api.getReportHistory(iterationId, 10);
  };

  const handleMainViewChange = (newView: MainView) => {
    setMainView(newView);
    setSelectedEpic(null);
    setIsDrawerOpen(false);
    setSelectedStory(null);
    setAllStories([]);
    setSelectedIterationName(null);
    // Update URL to match the view
    const urlMap: Record<MainView, string> = {
      'execution': '/',
      'epics': '/epics',
      'major-initiatives': '/major-initiatives',
      'customers': '/customers'
    };
    window.history.pushState({}, '', urlMap[newView]);
  };

  const handleStorySelect = (story: Story, stories: Story[]) => {
    setSelectedStory(story);
    setAllStories(stories);
  };

  const handleCloseModal = () => {
    setSelectedStory(null);
    setAllStories([]);
  };

  const handleStoryChange = (newStory: Story) => {
    setSelectedStory(newStory);
    // Update the story in the allStories array
    setAllStories(prevStories =>
      prevStories.map(story =>
        story.id === newStory.id ? newStory : story
      )
    );
  };

  // Handle escape key to close drawer (only if modal is not open)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen && !selectedStory) {
        handleCloseDrawer();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isDrawerOpen, selectedStory]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="brand">
            <svg className="brand-logo" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="12" cy="5" r="1"></circle>
              <circle cx="12" cy="19" r="1"></circle>
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <line x1="12" y1="5" x2="12" y2="19"></line>
            </svg>
            <h1>Snip</h1>
          </div>
          <div className="header-nav">
            {mainView === 'execution' && currentIterationId && (
              <>
                <button
                  onClick={() => {
                    console.log('Generate Report clicked', { currentIterationId, selectedIterationName, storiesCount: currentIterationStories.length });
                    setIsReportModalOpen(true);
                  }}
                  className="nav-btn-header"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  Generate Report
                </button>
                <button
                  onClick={handleViewReport}
                  className="nav-btn-header"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  View Report
                </button>
              </>
            )}
            <button onClick={handleViewBookmarks} className="nav-btn-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
              Bookmarked Stories
            </button>
          </div>
        </div>
      </header>

      <nav className="sub-header">
        <div className="sub-header-content">
          <button
            className={`sub-nav-btn ${mainView === 'execution' ? 'active' : ''}`}
            onClick={() => handleMainViewChange('execution')}
          >
            Execution
          </button>
          <button
            className={`sub-nav-btn ${mainView === 'epics' ? 'active' : ''}`}
            onClick={() => handleMainViewChange('epics')}
          >
            Epics
          </button>
          <button
            className={`sub-nav-btn ${mainView === 'major-initiatives' ? 'active' : ''}`}
            onClick={() => handleMainViewChange('major-initiatives')}
          >
            Major Projects
          </button>
          <button
            className={`sub-nav-btn ${mainView === 'customers' ? 'active' : ''}`}
            onClick={() => handleMainViewChange('customers')}
          >
            Customers
          </button>
          <button
            className={`sub-nav-btn ${mainView === 'feature-launch-calendar' ? 'active' : ''}`}
            onClick={() => handleMainViewChange('feature-launch-calendar')}
          >
            Feature Launch Calendar
          </button>
          <button
            className={`sub-nav-btn ${mainView === 'devops-engagement' ? 'active' : ''}`}
            onClick={() => handleMainViewChange('devops-engagement')}
          >
            DevOps Engagement
          </button>
        </div>
      </nav>

      <main className="app-main">
        {mainView === 'epics' && (
          <EpicSelector onEpicSelect={handleEpicSelect} />
        )}

        {mainView === 'execution' && (
          <Execution
            onStorySelect={handleStorySelect}
            selectedIterationName={selectedIterationName}
            onIterationDataChange={(iterationId, stories, iterationName) => {
              console.log('onIterationDataChange called:', { iterationId, iterationName, storiesCount: stories.length });
              setCurrentIterationId(iterationId);
              setCurrentIterationStories(stories);
              setCurrentIterationName(iterationName);
            }}
          />
        )}

        {mainView === 'major-initiatives' && (
          <MajorInitiatives />
        )}

        {mainView === 'customers' && (
          <Customers onStorySelect={handleStorySelect} />
        )}

        {mainView === 'feature-launch-calendar' && (
          <FeatureLaunchCalendar />
        )}

        {mainView === 'devops-engagement' && (
          <DevOpsEngagement onStorySelect={handleStorySelect} />
        )}

        {/* Drawer overlay */}
        {isDrawerOpen && (
          <>
            <div className="drawer-overlay" onClick={handleCloseDrawer}></div>
            <div className="drawer">
              {selectedEpic && (
                <StoriesList
                  epic={selectedEpic}
                  onStorySelect={handleStorySelect}
                  onClose={handleCloseDrawer}
                  updatedStories={allStories}
                />
              )}
            </div>
          </>
        )}

        {selectedStory && allStories.length > 0 && (
          <StoryModal
            story={selectedStory}
            allStories={allStories}
            onClose={handleCloseModal}
            onStoryChange={handleStoryChange}
          />
        )}

        {/* Bookmarked stories modal */}
        {isBookmarksModalOpen && (
          <StoriesTableModal
            stories={bookmarkedStories}
            title={`Bookmarked Stories (${bookmarkedStories.length})`}
            onClose={() => setIsBookmarksModalOpen(false)}
            onStorySelect={handleStorySelect}
            bookmarkedIds={bookmarkedIds}
          />
        )}

        {/* AI Report Modal */}
        {isReportModalOpen && currentIterationName && (
          <AIReportModal
            isOpen={isReportModalOpen}
            onClose={() => {
              console.log('Closing report modal');
              setIsReportModalOpen(false);
            }}
            onGenerate={handleGenerateReport}
            onViewReport={handleViewReport}
            iterationName={currentIterationName}
          />
        )}
        {isReportModalOpen && !currentIterationName && (
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 1000 }}>
            <p>Debug: Modal open but no iteration name</p>
            <p>currentIterationId: {currentIterationId}</p>
            <p>currentIterationName: {currentIterationName}</p>
            <button onClick={() => setIsReportModalOpen(false)}>Close</button>
          </div>
        )}

        {/* Report View Modal */}
        <ReportViewModal
          isOpen={isViewReportModalOpen}
          onClose={() => setIsViewReportModalOpen(false)}
          iterationId={currentIterationId}
          iterationName={currentIterationName || ''}
          onFetchReports={handleFetchReportHistory}
        />
      </main>
    </div>
  );
}

export default App;
