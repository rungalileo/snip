import React, { useState, useEffect } from 'react';
import { EpicSelector } from './components/EpicSelector';
import { StoriesList } from './components/StoriesList';
import { StoryModal } from './components/StoryModal';
import { StoriesTableModal } from './components/StoriesTableModal';
import { Execution } from './components/Execution';
import { Epic, Story } from './types';
import { api } from './api';
import './App.css';

type MainView = 'execution' | 'epics';

function App() {
  const [mainView, setMainView] = useState<MainView>('execution');
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [allStories, setAllStories] = useState<Story[]>([]);
  const [isBookmarksModalOpen, setIsBookmarksModalOpen] = useState(false);
  const [bookmarkedStories, setBookmarkedStories] = useState<Story[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());

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

  const handleMainViewChange = (newView: MainView) => {
    setMainView(newView);
    setSelectedEpic(null);
    setIsDrawerOpen(false);
    setSelectedStory(null);
    setAllStories([]);
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
      </nav>

      <main className="app-main">
        {mainView === 'epics' && (
          <EpicSelector onEpicSelect={handleEpicSelect} />
        )}

        {mainView === 'execution' && (
          <Execution onStorySelect={handleStorySelect} />
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
      </main>
    </div>
  );
}

export default App;
