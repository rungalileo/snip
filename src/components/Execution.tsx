import React, { useState, useEffect, useMemo } from 'react';
import { Iteration, Story } from '../types';
import { api } from '../api';
import { BarChart } from './BarChart';
import { StackedBarChart } from './StackedBarChart';
import { StatusStackedBarChart } from './StatusStackedBarChart';
import { StoriesTableModal } from './StoriesTableModal';
import './Execution.css';

// Label categories from StoryModal
const LABEL_CATEGORIES = [
  'CUSTOMER ESCALATION',
  'BUG',
  'PRODUCT FEATURE',
  'TASK',
  'SMALL IMPROVEMENT',
  'CUSTOMER FEATURE REQUEST',
  'NICE TO HAVE',
  'FOUNDATIONAL WORK',
];

// Add "Other" category for unlabeled or uncategorized stories
const LABEL_CATEGORIES_WITH_OTHER = [...LABEL_CATEGORIES, 'OTHER'];

// Label priority order (higher index = higher priority)
// Priority: Product feature > customer feature request > FOUNDATIONAL work > customer escalation > bug > nice to have > task etc.
const LABEL_PRIORITY: Record<string, number> = {
  'PRODUCT FEATURE': 7,
  'CUSTOMER FEATURE REQUEST': 6,
  'FOUNDATIONAL WORK': 5,
  'CUSTOMER ESCALATION': 4,
  'BUG': 3,
  'NICE TO HAVE': 2,
  'TASK': 1,
  'SMALL IMPROVEMENT': 0,
};

// Helper function to get the highest priority label for a story
const getHighestPriorityLabel = (labels: Array<{ name: string }> | undefined): string => {
  if (!labels || labels.length === 0) {
    return 'OTHER';
  }

  let highestPriority = -1;
  let highestPriorityLabel: string | null = null;

  labels.forEach(label => {
    if (LABEL_CATEGORIES.includes(label.name)) {
      const priority = LABEL_PRIORITY[label.name] ?? -1;
      if (priority > highestPriority) {
        highestPriority = priority;
        highestPriorityLabel = label.name;
      }
    }
  });

  return highestPriorityLabel || 'OTHER';
};

// Helper to get initials from a name
const getInitials = (name: string): string => {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();
};

// Helper to get first name from a full name
const getFirstName = (name: string): string => {
  const words = name.trim().split(/\s+/);
  return words[0];
};

// Helper to normalize team names - merge observability variants
const normalizeTeamName = (teamName: string): string => {
  const lowerName = teamName.toLowerCase().trim();
  // Match any variation of observability (with/without spaces, hyphens, etc.)
  if (lowerName.startsWith('observability')) {
    return 'Observability';
  }
  return teamName;
};

// Helper to get team sort order
const getTeamSortOrder = (teamName: string): number => {
  const lowerName = teamName.toLowerCase().trim();

  // Define team priority order
  if (lowerName.includes('metrics')) return 0;
  if (lowerName.startsWith('observability')) return 1;
  if (lowerName.includes('integration')) return 2;
  if (lowerName.includes('api') || lowerName.includes('sdk')) return 3;
  if (lowerName.includes('developer') && lowerName.includes('onboarding')) return 4;
  if (lowerName.includes('agent') && lowerName.includes('reliability')) return 5;
  if (lowerName === 'unassigned') return 1000; // Always last

  // All other teams
  return 100;
};

interface ExecutionProps {
  onStorySelect: (story: Story, stories: Story[]) => void;
  selectedIterationName?: string | null;
}

export const Execution: React.FC<ExecutionProps> = ({ onStorySelect, selectedIterationName }) => {
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [selectedIterationId, setSelectedIterationId] = useState<number | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStories, setLoadingStories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set());
  const [modalStories, setModalStories] = useState<Story[]>([]);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedDeepLink, setCopiedDeepLink] = useState(false);
  const [showShareTooltip, setShowShareTooltip] = useState(false);
  const [includeAllIterations, setIncludeAllIterations] = useState(false);
  const [ticketsViewBy, setTicketsViewBy] = useState<'category' | 'owner' | 'team'>('team');
  const [statusViewBy, setStatusViewBy] = useState<'category' | 'owner' | 'team'>('team');

  useEffect(() => {
    loadIterations();
  }, [selectedIterationName, includeAllIterations]);

  useEffect(() => {
    if (selectedIterationId) {
      loadStories(selectedIterationId);
    }
  }, [selectedIterationId]);

  const loadIterations = async () => {
    try {
      setLoading(true);
      const data = await api.getIterations(includeAllIterations);

      // Ensure data is an array
      if (!Array.isArray(data)) {
        console.error('API returned non-array data for iterations:', data);
        setError('Failed to load iterations: Invalid data format');
        return;
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);

      // Filter iterations to show:
      // 1. Present sprints (current date is between start and end)
      // 2. Future sprints (start date is after current date)
      // 3. Past sprints from last 30 days (end date is within last 30 days)
      const filteredIterations = data.filter(iteration => {
        const startDate = new Date(iteration.start_date);
        const endDate = new Date(iteration.end_date);

        // Present sprint: current date is between start and end
        const isPresent = now >= startDate && now <= endDate;

        // Future sprint: start date is after now
        const isFuture = startDate > now;

        // Recent past sprint: ended within last 30 days
        const isRecentPast = endDate < now && endDate >= thirtyDaysAgo;

        return isPresent || isFuture || isRecentPast;
      });

      // Sort iterations by start date (most recent first)
      const sortedIterations = filteredIterations.sort((a, b) =>
        new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      );

      setIterations(sortedIterations);

      // Auto-select iteration based on URL parameter or default behavior
      if (sortedIterations.length > 0) {
        let iterationToSelect = null;

        // If iteration name is provided in URL, find and select it
        if (selectedIterationName) {
          iterationToSelect = sortedIterations.find(
            iteration => iteration.name === selectedIterationName
          );
        }

        // If no URL parameter or iteration not found, use default auto-select logic
        if (!iterationToSelect) {
          // Find the current ongoing iteration
          const currentIteration = sortedIterations.find(iteration => {
            const startDate = new Date(iteration.start_date);
            const endDate = new Date(iteration.end_date);
            return now >= startDate && now <= endDate;
          });

          // Select current iteration if found, otherwise select the first (most recent)
          iterationToSelect = currentIteration || sortedIterations[0];
        }

        setSelectedIterationId(iterationToSelect.id);
      }
    } catch (err) {
      setError('Failed to load iterations');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadStories = async (iterationId: number) => {
    try {
      setLoadingStories(true);
      const data = await api.getStoriesForIteration(iterationId);

      // Ensure data is an array
      if (!Array.isArray(data)) {
        console.error('API returned non-array data for stories:', data);
        setStories([]);
      } else {
        setStories(data);
      }

      // Load bookmarks
      const bookmarks = await api.getBookmarks();
      // Ensure bookmarks is an array
      if (Array.isArray(bookmarks)) {
        setBookmarkedIds(new Set(bookmarks.map(b => b.id)));
      } else {
        console.error('API returned non-array data for bookmarks:', bookmarks);
        setBookmarkedIds(new Set());
      }
    } catch (err) {
      console.error('Error loading stories for iteration:', err);
      setStories([]);
      setBookmarkedIds(new Set());
    } finally {
      setLoadingStories(false);
    }
  };

  const handleBarClick = (label: string, ownerId?: string, ownerName?: string) => {
    // Filter stories by label and optionally by owner
    const filteredStories = stories.filter(story => {
      // Special handling for "OTHER" category
      if (label === 'OTHER') {
        // Check if story has no matching labels
        const hasMatchingLabel = story.labels?.some(l => LABEL_CATEGORIES.includes(l.name));
        if (hasMatchingLabel) return false;
      } else {
        // Check if story has the label
        const hasLabel = story.labels?.some(l => l.name === label);
        if (!hasLabel) return false;
      }

      // If ownerId is specified, check owner matches
      if (ownerId !== undefined) {
        const storyOwnerId = story.owner_ids && story.owner_ids.length > 0
          ? story.owner_ids[0]
          : 'unassigned';
        return storyOwnerId === ownerId;
      }

      return true;
    });

    // Set modal data
    const ownerSuffix = ownerName ? ` - ${ownerName}` : '';

    setModalTitle(`${label}${ownerSuffix} (${filteredStories.length} stories)`);
    setModalStories(filteredStories);
    setIsModalOpen(true);
  };

  const handleStackedBarClick = (ownerId: string, label: string) => {
    // Get owner name for the modal title
    const ownerData = ownerLabelCounts.find(o => o.ownerId === ownerId);
    if (!ownerData) return;

    handleBarClick(label, ownerId, undefined);
  };

  const handleStatusByOwnerClick = (ownerId: string, ownerName: string, status: 'completed' | 'inMotion' | 'notStarted') => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification'];
    const inMotionStates = ['In Development', 'In Review'];

    // Filter stories by owner and status
    const filteredStories = stories.filter(story => {
      // Check if story belongs to this owner
      const storyOwnerId = story.owner_ids && story.owner_ids.length > 0
        ? story.owner_ids[0]
        : 'unassigned';
      if (storyOwnerId !== ownerId) return false;

      // Check if story matches the status
      const stateName = story.workflow_state?.name || '';
      if (status === 'completed' && completedStates.includes(stateName)) return true;
      if (status === 'inMotion' && inMotionStates.includes(stateName)) return true;
      if (status === 'notStarted' && !completedStates.includes(stateName) && !inMotionStates.includes(stateName)) return true;

      return false;
    });

    // Set modal data
    const statusLabel = status === 'completed' ? 'Completed' : status === 'inMotion' ? 'In Motion' : 'Not Started';
    setModalTitle(`${ownerName} - ${statusLabel} (${filteredStories.length} stories)`);
    setModalStories(filteredStories);
    setIsModalOpen(true);
  };

  const handleTeamBarClick = (teamId: string, label: string) => {
    // teamId might be comma-separated for merged teams
    const teamIds = teamId.split(',');

    // Filter stories by team(s) and label (using priority logic)
    const filteredStories = stories.filter(story => {
      const storyTeamId = story.group_id || 'unassigned';
      if (!teamIds.includes(storyTeamId)) return false;

      // Get the highest priority label for this story
      const priorityLabel = getHighestPriorityLabel(story.labels);
      return priorityLabel === label;
    });

    setModalTitle(`${label} (${filteredStories.length} stories)`);
    setModalStories(filteredStories);
    setIsModalOpen(true);
  };

  const handleStatusByTeamClick = (teamId: string, teamName: string, status: 'completed' | 'inMotion' | 'notStarted') => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification'];
    const inMotionStates = ['In Development', 'In Review'];

    // teamId might be comma-separated for merged teams
    const teamIds = teamId.split(',');

    // Filter stories by team(s) and status
    const filteredStories = stories.filter(story => {
      // Check if story belongs to this team
      const storyTeamId = story.group_id || 'unassigned';
      if (!teamIds.includes(storyTeamId)) return false;

      // Check if story matches the status
      const stateName = story.workflow_state?.name || '';
      if (status === 'completed' && completedStates.includes(stateName)) return true;
      if (status === 'inMotion' && inMotionStates.includes(stateName)) return true;
      if (status === 'notStarted' && !completedStates.includes(stateName) && !inMotionStates.includes(stateName)) return true;

      return false;
    });

    // Set modal data
    const statusLabel = status === 'completed' ? 'Completed' : status === 'inMotion' ? 'In Motion' : 'Not Started';
    setModalTitle(`${teamName} - ${statusLabel} (${filteredStories.length} stories)`);
    setModalStories(filteredStories);
    setIsModalOpen(true);
  };

  const handleIterationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const iterationId = parseInt(e.target.value);
    setSelectedIterationId(iterationId);
  };

  const selectedIteration = iterations.find(it => it.id === selectedIterationId);
  const currentIterationIndex = iterations.findIndex(it => it.id === selectedIterationId);

  const handlePreviousIteration = () => {
    if (currentIterationIndex < iterations.length - 1) {
      setSelectedIterationId(iterations[currentIterationIndex + 1].id);
    }
  };

  const handleNextIteration = () => {
    if (currentIterationIndex > 0) {
      setSelectedIterationId(iterations[currentIterationIndex - 1].id);
    }
  };

  // Calculate label counts for all stories
  const overallLabelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    LABEL_CATEGORIES_WITH_OTHER.forEach(label => {
      counts[label] = 0;
    });

    stories.forEach(story => {
      let hasMatchingLabel = false;
      if (story.labels && story.labels.length > 0) {
        story.labels.forEach(label => {
          if (LABEL_CATEGORIES.includes(label.name)) {
            counts[label.name] = (counts[label.name] || 0) + 1;
            hasMatchingLabel = true;
          }
        });
      }

      // If no matching label found, count as "OTHER"
      if (!hasMatchingLabel) {
        counts['OTHER'] = (counts['OTHER'] || 0) + 1;
      }
    });

    return LABEL_CATEGORIES_WITH_OTHER.map(label => ({
      label,
      count: counts[label] || 0,
    }));
  }, [stories]);

  // Calculate category percentages for all categories
  const categoryPercentages = useMemo(() => {
    const totalStories = stories.length;
    const percentages: Record<string, number> = {};

    LABEL_CATEGORIES_WITH_OTHER.forEach(category => {
      const count = overallLabelCounts.find(item => item.label === category)?.count || 0;
      percentages[category] = totalStories > 0 ? Math.round((count / totalStories) * 100) : 0;
    });

    return percentages;
  }, [stories, overallLabelCounts]);

  // Calculate status breakdown for each label category
  const statusByCategory = useMemo(() => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification'];
    const inMotionStates = ['In Development', 'In Review'];

    return LABEL_CATEGORIES.map(labelCategory => {
      // Filter stories with this label
      const labelStories = stories.filter(story =>
        story.labels?.some(l => l.name === labelCategory)
      );

      let completedCount = 0;
      let inMotionCount = 0;
      let notStartedCount = 0;

      labelStories.forEach(story => {
        const stateName = story.workflow_state?.name || '';
        if (completedStates.includes(stateName)) {
          completedCount++;
        } else if (inMotionStates.includes(stateName)) {
          inMotionCount++;
        } else {
          notStartedCount++;
        }
      });

      return {
        label: labelCategory,
        completedCount,
        inMotionCount,
        notStartedCount,
        totalCount: labelStories.length,
      };
    }).filter(item => item.totalCount > 0); // Only show categories with stories
  }, [stories]);

  // Calculate overall percentages across all categories
  const categoryOverallStats = useMemo(() => {
    const totalCompleted = statusByCategory.reduce((sum, item) => sum + item.completedCount, 0);
    const totalInMotion = statusByCategory.reduce((sum, item) => sum + item.inMotionCount, 0);
    const totalNotStarted = statusByCategory.reduce((sum, item) => sum + item.notStartedCount, 0);
    const grandTotal = totalCompleted + totalInMotion + totalNotStarted;

    return {
      completedPercent: grandTotal > 0 ? Math.round((totalCompleted / grandTotal) * 100) : 0,
      inMotionPercent: grandTotal > 0 ? Math.round((totalInMotion / grandTotal) * 100) : 0,
      notStartedPercent: grandTotal > 0 ? Math.round((totalNotStarted / grandTotal) * 100) : 0,
    };
  }, [statusByCategory]);

  // Calculate label counts per owner
  const ownerLabelCounts = useMemo(() => {
    const ownerData: Record<string, Record<string, number>> = {};

    stories.forEach(story => {
      const ownerId = story.owner_ids && story.owner_ids.length > 0
        ? story.owner_ids[0]
        : 'unassigned';

      if (!ownerData[ownerId]) {
        ownerData[ownerId] = {};
        LABEL_CATEGORIES_WITH_OTHER.forEach(label => {
          ownerData[ownerId][label] = 0;
        });
      }

      // Check if story has any labels in our categories
      let hasMatchingLabel = false;
      if (story.labels && story.labels.length > 0) {
        story.labels.forEach(label => {
          if (LABEL_CATEGORIES.includes(label.name)) {
            ownerData[ownerId][label.name] = (ownerData[ownerId][label.name] || 0) + 1;
            hasMatchingLabel = true;
          }
        });
      }

      // If no matching label found, count as "OTHER"
      if (!hasMatchingLabel) {
        ownerData[ownerId]['OTHER'] = (ownerData[ownerId]['OTHER'] || 0) + 1;
      }
    });

    // Convert to array format for rendering
    return Object.entries(ownerData).map(([ownerId, counts]) => ({
      ownerId,
      data: LABEL_CATEGORIES_WITH_OTHER.map(label => ({
        label,
        count: counts[label] || 0,
      })),
    }));
  }, [stories]);

  // Calculate status breakdown for each owner (use same owner list as ownerLabelCounts)
  const statusByOwner = useMemo(() => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification'];
    const inMotionStates = ['In Development', 'In Review'];

    // Use the same owner IDs from ownerLabelCounts to ensure consistency
    return ownerLabelCounts.map(({ ownerId }) => {
      // Filter stories for this owner
      const ownerStories = stories.filter(story => {
        const storyOwnerId = story.owner_ids && story.owner_ids.length > 0
          ? story.owner_ids[0]
          : 'unassigned';
        return storyOwnerId === ownerId;
      });

      let completedCount = 0;
      let inMotionCount = 0;
      let notStartedCount = 0;

      ownerStories.forEach(story => {
        const stateName = story.workflow_state?.name || '';
        if (completedStates.includes(stateName)) {
          completedCount++;
        } else if (inMotionStates.includes(stateName)) {
          inMotionCount++;
        } else {
          notStartedCount++;
        }
      });

      return {
        ownerId,
        completedCount,
        inMotionCount,
        notStartedCount,
        totalCount: ownerStories.length,
      };
    }); // Don't filter - use same owners as ownerLabelCounts
  }, [stories, ownerLabelCounts]);

  // Calculate label counts per team
  const teamLabelCounts = useMemo(() => {
    const teamData: Record<string, Record<string, number>> = {};

    stories.forEach(story => {
      const teamId = story.group_id || 'unassigned';

      if (!teamData[teamId]) {
        teamData[teamId] = {};
        LABEL_CATEGORIES_WITH_OTHER.forEach(label => {
          teamData[teamId][label] = 0;
        });
      }

      // Get the highest priority label for this story (each story counted only once)
      const priorityLabel = getHighestPriorityLabel(story.labels);
      teamData[teamId][priorityLabel] = (teamData[teamId][priorityLabel] || 0) + 1;
    });

    // Convert to array format for rendering
    return Object.entries(teamData).map(([teamId, counts]) => ({
      teamId,
      data: LABEL_CATEGORIES_WITH_OTHER.map(label => ({
        label,
        count: counts[label] || 0,
      })),
    }));
  }, [stories]);

  // Calculate status breakdown for each team (use same team list as teamLabelCounts)
  const statusByTeam = useMemo(() => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification'];
    const inMotionStates = ['In Development', 'In Review'];

    // Use the same team IDs from teamLabelCounts to ensure consistency
    return teamLabelCounts.map(({ teamId }) => {
      // Filter stories for this team
      const teamStories = stories.filter(story => {
        const storyTeamId = story.group_id || 'unassigned';
        return storyTeamId === teamId;
      });

      let completedCount = 0;
      let inMotionCount = 0;
      let notStartedCount = 0;

      teamStories.forEach(story => {
        const stateName = story.workflow_state?.name || '';
        if (completedStates.includes(stateName)) {
          completedCount++;
        } else if (inMotionStates.includes(stateName)) {
          inMotionCount++;
        } else {
          notStartedCount++;
        }
      });

      return {
        teamId,
        completedCount,
        inMotionCount,
        notStartedCount,
        totalCount: teamStories.length,
      };
    });
  }, [stories, teamLabelCounts]);

  // Get max count across all charts for consistent scale
  const maxCount = useMemo(() => {
    const allCounts = [
      ...overallLabelCounts.map(d => d.count),
      ...ownerLabelCounts.flatMap(owner => owner.data.map(d => d.count)),
      ...teamLabelCounts.flatMap(team => team.data.map(d => d.count)),
    ];
    return Math.max(...allCounts, 1);
  }, [overallLabelCounts, ownerLabelCounts, teamLabelCounts]);

  // Calculate owner table data with categorized ticket counts
  const ownerTableData = useMemo(() => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification'];

    const ownerMap: Record<string, {
      ownerId: string;
      teamId: string;
      productFeatures: Story[];
      bugFixes: Story[];
      foundationWork: Story[];
      other: Story[];
      completed: Story[];
    }> = {};

    stories.forEach(story => {
      const ownerId = story.owner_ids && story.owner_ids.length > 0
        ? story.owner_ids[0]
        : 'unassigned';
      const teamId = story.group_id || 'unassigned';

      if (!ownerMap[ownerId]) {
        ownerMap[ownerId] = {
          ownerId,
          teamId,
          productFeatures: [],
          bugFixes: [],
          foundationWork: [],
          other: [],
          completed: [],
        };
      }

      // Get the highest priority label for this story
      const priorityLabel = getHighestPriorityLabel(story.labels);

      // Categorize the ticket
      if (['PRODUCT FEATURE', 'CUSTOMER FEATURE REQUEST', 'TASK'].includes(priorityLabel)) {
        ownerMap[ownerId].productFeatures.push(story);
      } else if (['CUSTOMER ESCALATION', 'BUG', 'SMALL IMPROVEMENT'].includes(priorityLabel)) {
        ownerMap[ownerId].bugFixes.push(story);
      } else if (priorityLabel === 'FOUNDATIONAL WORK') {
        ownerMap[ownerId].foundationWork.push(story);
      } else {
        ownerMap[ownerId].other.push(story);
      }

      // Check if story is completed
      const stateName = story.workflow_state?.name || '';
      if (completedStates.includes(stateName)) {
        ownerMap[ownerId].completed.push(story);
      }
    });

    return Object.values(ownerMap);
  }, [stories]);

  // Calculate progress percentages based on workflow states
  const progressStats = useMemo(() => {
    if (stories.length === 0) {
      return { completed: 0, inMotion: 0, notStarted: 0 };
    }

    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification'];
    const inMotionStates = ['In Development', 'In Review'];

    let completedCount = 0;
    let inMotionCount = 0;
    let notStartedCount = 0;

    stories.forEach(story => {
      const stateName = story.workflow_state?.name || '';
      if (completedStates.includes(stateName)) {
        completedCount++;
      } else if (inMotionStates.includes(stateName)) {
        inMotionCount++;
      } else {
        notStartedCount++;
      }
    });

    const total = stories.length;
    return {
      completed: Math.round((completedCount / total) * 100),
      inMotion: Math.round((inMotionCount / total) * 100),
      notStarted: Math.round((notStartedCount / total) * 100),
    };
  }, [stories]);

  if (loading) {
    return (
      <div className="execution-view">
        <div className="execution-loading">Loading iterations...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="execution-view">
        <div className="execution-error">{error}</div>
      </div>
    );
  }

  const handleRefresh = () => {
    if (selectedIterationId) {
      loadStories(selectedIterationId);
    }
  };

  const handleCopyDeepLink = () => {
    if (selectedIteration) {
      const iterationName = encodeURIComponent(selectedIteration.name);
      const url = `${window.location.origin}/iteration/${iterationName}`;
      navigator.clipboard.writeText(url);
      setCopiedDeepLink(true);
      setTimeout(() => setCopiedDeepLink(false), 2000);
    }
  };

  return (
    <div className="execution-view">
      <div className="execution-header">
        <div className="iteration-navigator">
          <button
            className="nav-arrow-btn"
            onClick={handlePreviousIteration}
            disabled={currentIterationIndex >= iterations.length - 1 || loadingStories}
            title="Previous iteration"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <div className="current-iteration">
            {selectedIteration ? (
              <span className="iteration-name">{selectedIteration.name}</span>
            ) : (
              <span className="iteration-name">No iterations available</span>
            )}
          </div>
          <button
            className="nav-arrow-btn"
            onClick={handleNextIteration}
            disabled={currentIterationIndex <= 0 || loadingStories}
            title="Next iteration"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
        <div className="iteration-filter">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeAllIterations}
              onChange={(e) => setIncludeAllIterations(e.target.checked)}
            />
            <span>Include all iterations</span>
          </label>
        </div>
        <div className="header-actions">
          <div
            className="share-button-wrapper"
            onMouseEnter={() => setShowShareTooltip(true)}
            onMouseLeave={() => setShowShareTooltip(false)}
          >
            <button
              className="share-button"
              onClick={handleCopyDeepLink}
              disabled={!selectedIteration}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              <span>Share</span>
            </button>
            {showShareTooltip && (
              <div className="share-tooltip">
                {copiedDeepLink ? "Link copied!" : "Copy link"}
              </div>
            )}
          </div>
          <button
            className="refresh-button"
            onClick={handleRefresh}
            disabled={!selectedIterationId || loadingStories}
            title="Refresh stories"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
        </div>
      </div>

      {selectedIteration && (
        <div className="execution-content">
          <div className="iteration-details">
            <h2>{selectedIteration.name}</h2>
            {selectedIteration.description && (
              <p className="iteration-description">{selectedIteration.description}</p>
            )}
            <div className="iteration-meta">
              <span className="iteration-dates">
                {new Date(selectedIteration.start_date).toLocaleDateString()} - {new Date(selectedIteration.end_date).toLocaleDateString()}
              </span>
              <span className="iteration-status">{selectedIteration.status}</span>
              {!loadingStories && (
                <>
                  <span className="iteration-story-count">{stories.length} stories</span>
                  {stories.length > 0 && (
                    <div className="progress-stats">
                      <span className="progress-stat completed">
                        {progressStats.completed}% completed
                      </span>
                      <span className="progress-stat in-motion">
                        {progressStats.inMotion}% in motion
                      </span>
                      <span className="progress-stat not-started">
                        {progressStats.notStarted}% not started
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {loadingStories ? (
            <div className="loading-stories">Loading stories...</div>
          ) : (
            <>
              <div className="charts-side-by-side">
                {/* Status Chart with Category/Owner selector */}
                <div className="chart-with-selector">
                  <div className="chart-header">
                    <h3 className="chart-section-title">Status</h3>
                    <select
                      className="chart-selector"
                      value={statusViewBy}
                      onChange={(e) => setStatusViewBy(e.target.value as 'category' | 'owner' | 'team')}
                    >
                      <option value="category">By Category</option>
                      <option value="owner">By Owner</option>
                      <option value="team">By Team</option>
                    </select>
                  </div>
                  {statusViewBy === 'category' ? (
                    statusByCategory.length > 0 && (
                      <div className="overall-chart-container">
                        <StatusStackedBarChart
                          data={statusByCategory}
                          title=""
                          overallStats={categoryOverallStats}
                        />
                      </div>
                    )
                  ) : statusViewBy === 'owner' ? (
                    statusByOwner.length > 0 && (
                      <div className="owner-stacked-section">
                        <StatusByOwnerWrapper
                          statusByOwner={statusByOwner}
                          onBarClick={handleStatusByOwnerClick}
                        />
                      </div>
                    )
                  ) : (
                    statusByTeam.length > 0 && (
                      <div className="owner-stacked-section">
                        <StatusByTeamWrapper
                          statusByTeam={statusByTeam}
                          onBarClick={handleStatusByTeamClick}
                        />
                      </div>
                    )
                  )}
                </div>

                {/* Tickets Chart with Category/Owner selector */}
                <div className="chart-with-selector">
                  <div className="chart-header">
                    <h3 className="chart-section-title">Tickets</h3>
                    <select
                      className="chart-selector"
                      value={ticketsViewBy}
                      onChange={(e) => setTicketsViewBy(e.target.value as 'category' | 'owner' | 'team')}
                    >
                      <option value="category">By Category</option>
                      <option value="owner">By Owner</option>
                      <option value="team">By Team</option>
                    </select>
                  </div>
                  {ticketsViewBy === 'category' ? (
                    <div className="overall-chart-container">
                      <BarChart
                        data={overallLabelCounts}
                        title=""
                        maxCount={maxCount}
                        onBarClick={(label) => handleBarClick(label)}
                        categoryPercentages={categoryPercentages}
                      />
                    </div>
                  ) : ticketsViewBy === 'owner' ? (
                    ownerLabelCounts.length > 0 && (
                      <div className="owner-stacked-section">
                        <OwnerStackedChartWrapper
                          ownerLabelCounts={ownerLabelCounts}
                          onBarClick={handleStackedBarClick}
                        />
                      </div>
                    )
                  ) : (
                    teamLabelCounts.length > 0 && (
                      <div className="owner-stacked-section">
                        <TeamStackedChartWrapper
                          teamLabelCounts={teamLabelCounts}
                          onBarClick={handleTeamBarClick}
                        />
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Owner breakdown table */}
              <OwnerBreakdownTable
                ownerTableData={ownerTableData}
                onStoryClick={(stories, title) => {
                  setModalTitle(title);
                  setModalStories(stories);
                  setIsModalOpen(true);
                }}
              />
            </>
          )}
        </div>
      )}

      {/* Stories table modal */}
      {isModalOpen && (
        <StoriesTableModal
          stories={modalStories}
          title={modalTitle}
          onClose={() => setIsModalOpen(false)}
          onStorySelect={onStorySelect}
          bookmarkedIds={bookmarkedIds}
        />
      )}
    </div>
  );
};

// Component to display stacked bar chart with owner names
const OwnerStackedChartWrapper: React.FC<{
  ownerLabelCounts: Array<{
    ownerId: string;
    data: { label: string; count: number }[];
  }>;
  onBarClick: (ownerId: string, label: string) => void;
}> = ({ ownerLabelCounts, onBarClick }) => {
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Create a stable key from owner IDs to use as dependency
  const ownerIdsKey = useMemo(() => {
    return ownerLabelCounts.map(o => o.ownerId).sort().join(',');
  }, [ownerLabelCounts]);

  // Fetch all owner names
  useEffect(() => {
    let isCancelled = false;

    const fetchOwnerNames = async () => {
      setIsLoading(true);
      const names: Record<string, string> = {};

      for (const { ownerId } of ownerLabelCounts) {
        if (isCancelled) return;

        if (ownerId === 'unassigned') {
          names[ownerId] = 'Unassigned';
        } else {
          try {
            const member = await api.getMember(ownerId);
            if (!isCancelled) {
              names[ownerId] = member.profile?.name || 'Unknown';
            }
          } catch (error) {
            console.error('Error fetching owner:', error);
            if (!isCancelled) {
              names[ownerId] = 'Unknown';
            }
          }
        }
      }

      if (!isCancelled) {
        setOwnerNames(names);
        setIsLoading(false);
      }
    };

    if (ownerLabelCounts.length > 0) {
      fetchOwnerNames();
    } else {
      setIsLoading(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [ownerIdsKey]);

  if (isLoading) {
    return <div>Loading owner data...</div>;
  }

  // Transform data for stacked bar chart
  const stackedData = ownerLabelCounts.map(({ ownerId, data }) => {
    const ownerName = ownerNames[ownerId] || 'Unknown';
    const totalCount = data.reduce((sum, item) => sum + item.count, 0);
    const initials = getInitials(ownerName);

    return {
      ownerId,
      ownerName,
      initials,
      labelCounts: data,
      totalCount,
    };
  });

  return (
    <StackedBarChart
      data={stackedData}
      title="Tickets by Owner"
      onBarClick={onBarClick}
    />
  );
};

// Component to display status breakdown by owner
const StatusByOwnerWrapper: React.FC<{
  statusByOwner: Array<{
    ownerId: string;
    completedCount: number;
    inMotionCount: number;
    notStartedCount: number;
    totalCount: number;
  }>;
  onBarClick: (ownerId: string, ownerName: string, status: 'completed' | 'inMotion' | 'notStarted') => void;
}> = ({ statusByOwner, onBarClick }) => {
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Create a stable key from owner IDs to use as dependency
  const ownerIdsKey = useMemo(() => {
    return statusByOwner.map(o => o.ownerId).sort().join(',');
  }, [statusByOwner]);

  // Fetch all owner names
  useEffect(() => {
    let isCancelled = false;

    const fetchOwnerNames = async () => {
      setIsLoading(true);
      const names: Record<string, string> = {};

      for (const { ownerId } of statusByOwner) {
        if (isCancelled) return;

        if (ownerId === 'unassigned') {
          names[ownerId] = 'Unassigned';
        } else {
          try {
            const member = await api.getMember(ownerId);
            if (!isCancelled) {
              names[ownerId] = member.profile?.name || 'Unknown';
            }
          } catch (error) {
            console.error('Error fetching owner:', error);
            if (!isCancelled) {
              names[ownerId] = 'Unknown';
            }
          }
        }
      }

      if (!isCancelled) {
        setOwnerNames(names);
        setIsLoading(false);
      }
    };

    if (statusByOwner.length > 0) {
      fetchOwnerNames();
    } else {
      setIsLoading(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [ownerIdsKey]);

  if (isLoading) {
    return <div>Loading owner data...</div>;
  }

  // Transform data for status stacked bar chart
  const statusData = statusByOwner.map(({ ownerId, completedCount, inMotionCount, notStartedCount, totalCount }) => {
    const ownerName = ownerNames[ownerId] || 'Unknown';
    const initials = getInitials(ownerName);

    return {
      label: initials,
      fullName: ownerName,
      ownerId,
      completedCount,
      inMotionCount,
      notStartedCount,
      totalCount,
    };
  });

  const handleClick = (label: string, status: 'completed' | 'inMotion' | 'notStarted') => {
    const item = statusData.find(d => d.label === label);
    if (item) {
      onBarClick(item.ownerId, item.fullName, status);
    }
  };

  return (
    <StatusStackedBarChart
      data={statusData}
      title="Status by Owner"
      onBarClick={handleClick}
    />
  );
};

// Component to display stacked bar chart with team names
const TeamStackedChartWrapper: React.FC<{
  teamLabelCounts: Array<{
    teamId: string;
    data: { label: string; count: number }[];
  }>;
  onBarClick: (teamId: string, label: string) => void;
}> = ({ teamLabelCounts, onBarClick }) => {
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Create a stable key from team IDs to use as dependency
  const teamIdsKey = useMemo(() => {
    return teamLabelCounts.map(t => t.teamId).sort().join(',');
  }, [teamLabelCounts]);

  // Fetch all team names
  useEffect(() => {
    let isCancelled = false;

    const fetchTeamNames = async () => {
      setIsLoading(true);
      const names: Record<string, string> = {};

      for (const { teamId } of teamLabelCounts) {
        if (isCancelled) return;

        if (teamId === 'unassigned') {
          names[teamId] = 'Unassigned';
        } else {
          try {
            const group = await api.getGroup(teamId);
            if (!isCancelled) {
              names[teamId] = group.name || 'Unknown';
            }
          } catch (error) {
            console.error('Error fetching team:', error);
            if (!isCancelled) {
              names[teamId] = 'Unknown';
            }
          }
        }
      }

      if (!isCancelled) {
        setTeamNames(names);
        setIsLoading(false);
      }
    };

    if (teamLabelCounts.length > 0) {
      fetchTeamNames();
    } else {
      setIsLoading(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [teamIdsKey]);

  if (isLoading) {
    return <div>Loading team data...</div>;
  }

  // Transform data for stacked bar chart and merge observability variants
  const mergedDataMap = new Map<string, {
    teamIds: string[];
    teamName: string;
    labelCounts: { label: string; count: number }[];
    totalCount: number;
  }>();

  teamLabelCounts.forEach(({ teamId, data }) => {
    const teamName = teamNames[teamId] || 'Unknown';
    const normalizedName = normalizeTeamName(teamName);

    if (mergedDataMap.has(normalizedName)) {
      const existing = mergedDataMap.get(normalizedName)!;
      existing.teamIds.push(teamId);
      // Merge label counts
      data.forEach((item, index) => {
        existing.labelCounts[index].count += item.count;
      });
      existing.totalCount += data.reduce((sum, item) => sum + item.count, 0);
    } else {
      mergedDataMap.set(normalizedName, {
        teamIds: [teamId],
        teamName: normalizedName,
        labelCounts: data.map(item => ({ ...item })),
        totalCount: data.reduce((sum, item) => sum + item.count, 0),
      });
    }
  });

  const stackedData = Array.from(mergedDataMap.values())
    .map(({ teamIds, teamName, labelCounts, totalCount }) => {
      return {
        ownerId: teamIds.join(','), // Store all team IDs for click handling
        ownerName: teamName,
        initials: teamName, // Use full team name instead of initials
        labelCounts,
        totalCount,
      };
    })
    .sort((a, b) => {
      const orderA = getTeamSortOrder(a.ownerName);
      const orderB = getTeamSortOrder(b.ownerName);
      if (orderA !== orderB) return orderA - orderB;
      return a.ownerName.localeCompare(b.ownerName);
    });

  return (
    <StackedBarChart
      data={stackedData}
      title="Tickets by Team"
      onBarClick={onBarClick}
    />
  );
};

// Component to display status breakdown by team
const StatusByTeamWrapper: React.FC<{
  statusByTeam: Array<{
    teamId: string;
    completedCount: number;
    inMotionCount: number;
    notStartedCount: number;
    totalCount: number;
  }>;
  onBarClick: (teamId: string, teamName: string, status: 'completed' | 'inMotion' | 'notStarted') => void;
}> = ({ statusByTeam, onBarClick }) => {
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Create a stable key from team IDs to use as dependency
  const teamIdsKey = useMemo(() => {
    return statusByTeam.map(t => t.teamId).sort().join(',');
  }, [statusByTeam]);

  // Fetch all team names
  useEffect(() => {
    let isCancelled = false;

    const fetchTeamNames = async () => {
      setIsLoading(true);
      const names: Record<string, string> = {};

      for (const { teamId } of statusByTeam) {
        if (isCancelled) return;

        if (teamId === 'unassigned') {
          names[teamId] = 'Unassigned';
        } else {
          try {
            const group = await api.getGroup(teamId);
            if (!isCancelled) {
              names[teamId] = group.name || 'Unknown';
            }
          } catch (error) {
            console.error('Error fetching team:', error);
            if (!isCancelled) {
              names[teamId] = 'Unknown';
            }
          }
        }
      }

      if (!isCancelled) {
        setTeamNames(names);
        setIsLoading(false);
      }
    };

    if (statusByTeam.length > 0) {
      fetchTeamNames();
    } else {
      setIsLoading(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [teamIdsKey]);

  if (isLoading) {
    return <div>Loading team data...</div>;
  }

  // Transform data for status stacked bar chart and merge observability variants
  const mergedStatusMap = new Map<string, {
    teamIds: string[];
    teamName: string;
    completedCount: number;
    inMotionCount: number;
    notStartedCount: number;
    totalCount: number;
  }>();

  statusByTeam.forEach(({ teamId, completedCount, inMotionCount, notStartedCount, totalCount }) => {
    const teamName = teamNames[teamId] || 'Unknown';
    const normalizedName = normalizeTeamName(teamName);

    if (mergedStatusMap.has(normalizedName)) {
      const existing = mergedStatusMap.get(normalizedName)!;
      existing.teamIds.push(teamId);
      existing.completedCount += completedCount;
      existing.inMotionCount += inMotionCount;
      existing.notStartedCount += notStartedCount;
      existing.totalCount += totalCount;
    } else {
      mergedStatusMap.set(normalizedName, {
        teamIds: [teamId],
        teamName: normalizedName,
        completedCount,
        inMotionCount,
        notStartedCount,
        totalCount,
      });
    }
  });

  const statusData = Array.from(mergedStatusMap.values())
    .map(({ teamIds, teamName, completedCount, inMotionCount, notStartedCount, totalCount }) => {
      return {
        label: teamName, // Use full team name instead of initials
        fullName: teamName,
        ownerId: teamIds.join(','), // Store all team IDs for click handling
        completedCount,
        inMotionCount,
        notStartedCount,
        totalCount,
      };
    })
    .sort((a, b) => {
      const orderA = getTeamSortOrder(a.fullName);
      const orderB = getTeamSortOrder(b.fullName);
      if (orderA !== orderB) return orderA - orderB;
      return a.fullName.localeCompare(b.fullName);
    });

  const handleClick = (label: string, status: 'completed' | 'inMotion' | 'notStarted') => {
    const item = statusData.find(d => d.label === label);
    if (item) {
      onBarClick(item.ownerId, item.fullName, status);
    }
  };

  return (
    <StatusStackedBarChart
      data={statusData}
      title="Status by Team"
      onBarClick={handleClick}
    />
  );
};

// Component to display owner breakdown table
const OwnerBreakdownTable: React.FC<{
  ownerTableData: Array<{
    ownerId: string;
    teamId: string;
    productFeatures: Story[];
    bugFixes: Story[];
    foundationWork: Story[];
    other: Story[];
    completed: Story[];
  }>;
  onStoryClick: (stories: Story[], title: string) => void;
}> = ({ ownerTableData, onStoryClick }) => {
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'owner' | 'team' | 'productFeatures' | 'bugFixes' | 'foundationWork' | 'other' | 'completed'>('team');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Create stable keys for dependencies
  const ownerIdsKey = useMemo(() => {
    return ownerTableData.map(o => o.ownerId).sort().join(',');
  }, [ownerTableData]);

  const teamIdsKey = useMemo(() => {
    return [...new Set(ownerTableData.map(o => o.teamId))].sort().join(',');
  }, [ownerTableData]);

  // Fetch owner and team names
  useEffect(() => {
    let isCancelled = false;

    const fetchNames = async () => {
      setIsLoading(true);
      const owners: Record<string, string> = {};
      const teams: Record<string, string> = {};

      // Fetch owner names
      for (const { ownerId } of ownerTableData) {
        if (isCancelled) return;

        if (ownerId === 'unassigned') {
          owners[ownerId] = 'Unassigned';
        } else {
          try {
            const member = await api.getMember(ownerId);
            if (!isCancelled) {
              owners[ownerId] = member.profile?.name || 'Unknown';
            }
          } catch (error) {
            console.error('Error fetching owner:', error);
            if (!isCancelled) {
              owners[ownerId] = 'Unknown';
            }
          }
        }
      }

      // Fetch team names
      const uniqueTeamIds = [...new Set(ownerTableData.map(o => o.teamId))];
      for (const teamId of uniqueTeamIds) {
        if (isCancelled) return;

        if (teamId === 'unassigned') {
          teams[teamId] = 'Unassigned';
        } else {
          try {
            const group = await api.getGroup(teamId);
            if (!isCancelled) {
              teams[teamId] = group.name || 'Unknown';
            }
          } catch (error) {
            console.error('Error fetching team:', error);
            if (!isCancelled) {
              teams[teamId] = 'Unknown';
            }
          }
        }
      }

      if (!isCancelled) {
        setOwnerNames(owners);
        setTeamNames(teams);
        setIsLoading(false);
      }
    };

    if (ownerTableData.length > 0) {
      fetchNames();
    } else {
      setIsLoading(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [ownerIdsKey, teamIdsKey]);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  if (isLoading) {
    return <div className="owner-table-loading">Loading table data...</div>;
  }

  // Sort table data
  const sortedData = [...ownerTableData].sort((a, b) => {
    let compareValue = 0;

    if (sortBy === 'owner') {
      const nameA = ownerNames[a.ownerId] || 'Unknown';
      const nameB = ownerNames[b.ownerId] || 'Unknown';
      compareValue = nameA.localeCompare(nameB);
    } else if (sortBy === 'team') {
      const teamA = teamNames[a.teamId] || 'Unknown';
      const teamB = teamNames[b.teamId] || 'Unknown';
      const normalizedA = normalizeTeamName(teamA);
      const normalizedB = normalizeTeamName(teamB);

      // Use team sort order first
      const orderA = getTeamSortOrder(normalizedA);
      const orderB = getTeamSortOrder(normalizedB);

      if (orderA !== orderB) {
        compareValue = orderA - orderB;
      } else {
        compareValue = normalizedA.localeCompare(normalizedB);
      }
    } else if (sortBy === 'productFeatures') {
      compareValue = a.productFeatures.length - b.productFeatures.length;
    } else if (sortBy === 'bugFixes') {
      compareValue = a.bugFixes.length - b.bugFixes.length;
    } else if (sortBy === 'foundationWork') {
      compareValue = a.foundationWork.length - b.foundationWork.length;
    } else if (sortBy === 'other') {
      compareValue = a.other.length - b.other.length;
    } else if (sortBy === 'completed') {
      compareValue = a.completed.length - b.completed.length;
    }

    return sortDirection === 'asc' ? compareValue : -compareValue;
  });

  const SortIcon: React.FC<{ column: typeof sortBy }> = ({ column }) => {
    if (sortBy !== column) {
      return (
        <span className="sort-icon sort-icon-inactive">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </span>
      );
    }
    return (
      <span className="sort-icon sort-icon-active">
        {sortDirection === 'asc' ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 19V5M5 12l7-7 7 7"/>
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        )}
      </span>
    );
  };

  return (
    <div className="owner-breakdown-section">
      <h3 className="table-section-title">Breakdown by Owner</h3>
      <div className="owner-breakdown-table-container">
        <table className="owner-breakdown-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('owner')} className="sortable-header">
                <span className="header-content">
                  Owner
                  <SortIcon column="owner" />
                </span>
              </th>
              <th onClick={() => handleSort('team')} className="sortable-header">
                <span className="header-content">
                  Team
                  <SortIcon column="team" />
                </span>
              </th>
              <th onClick={() => handleSort('productFeatures')} className="sortable-header">
                <span className="header-content">
                  Product Features
                  <SortIcon column="productFeatures" />
                </span>
              </th>
              <th onClick={() => handleSort('bugFixes')} className="sortable-header">
                <span className="header-content">
                  Bug Fixes
                  <SortIcon column="bugFixes" />
                </span>
              </th>
              <th onClick={() => handleSort('foundationWork')} className="sortable-header">
                <span className="header-content">
                  Foundation Work
                  <SortIcon column="foundationWork" />
                </span>
              </th>
              <th onClick={() => handleSort('other')} className="sortable-header">
                <span className="header-content">
                  Other
                  <SortIcon column="other" />
                </span>
              </th>
              <th onClick={() => handleSort('completed')} className="sortable-header">
                <span className="header-content">
                  Completed
                  <SortIcon column="completed" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map(({ ownerId, teamId, productFeatures, bugFixes, foundationWork, other, completed }) => {
              const ownerName = ownerNames[ownerId] || 'Unknown';
              const teamName = teamNames[teamId] || 'Unknown';
              const normalizedTeamName = normalizeTeamName(teamName);

              return (
                <tr key={ownerId}>
                  <td className="owner-cell">{ownerName}</td>
                  <td className="team-cell">{normalizedTeamName}</td>
                  <td
                    className={`count-cell ${productFeatures.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => productFeatures.length > 0 && onStoryClick(productFeatures, `${ownerName} - Product Features`)}
                  >
                    {productFeatures.length}
                  </td>
                  <td
                    className={`count-cell ${bugFixes.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => bugFixes.length > 0 && onStoryClick(bugFixes, `${ownerName} - Bug Fixes`)}
                  >
                    {bugFixes.length}
                  </td>
                  <td
                    className={`count-cell ${foundationWork.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => foundationWork.length > 0 && onStoryClick(foundationWork, `${ownerName} - Foundation Work`)}
                  >
                    {foundationWork.length}
                  </td>
                  <td
                    className={`count-cell ${other.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => other.length > 0 && onStoryClick(other, `${ownerName} - Other`)}
                  >
                    {other.length}
                  </td>
                  <td
                    className={`count-cell ${completed.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => completed.length > 0 && onStoryClick(completed, `${ownerName} - Completed`)}
                  >
                    {completed.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
