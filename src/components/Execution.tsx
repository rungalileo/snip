import React, { useState, useEffect, useMemo } from 'react';
import { Iteration, Story, Group } from '../types';
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

// Helper function to get the first matching label for a story (for breakdown table)
// Priority order for matching: PRODUCT FEATURE, BUG, FOUNDATIONAL WORK, SMALL IMPROVEMENT,
// TASK, CUSTOMER FEATURE REQUEST, NICE TO HAVE, CUSTOMER ESCALATION
const BREAKDOWN_CATEGORY_ORDER = [
  'PRODUCT FEATURE',
  'BUG',
  'FOUNDATIONAL WORK',
  'SMALL IMPROVEMENT',
  'TASK',
  'CUSTOMER FEATURE REQUEST',
  'NICE TO HAVE',
  'CUSTOMER ESCALATION',
];

const getFirstMatchingLabel = (labels: Array<{ name: string }> | undefined): string => {
  if (!labels || labels.length === 0) {
    return 'OTHER';
  }

  // Find the first matching label in priority order
  for (const category of BREAKDOWN_CATEGORY_ORDER) {
    if (labels.some(label => label.name === category)) {
      return category;
    }
  }

  return 'OTHER';
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


// Team priority order for determining a person's team when they belong to multiple teams
// Priority: Metrics / Core Workflows > Offline / Evals > Online / Monitoring > API & SDK >
// Applied Data Science > Integrations > Platform > Developer Onboarding
const TEAM_PRIORITY_ORDER = [
  'Metrics / Core Workflows',
  'Offline / Evals',
  'Online / Monitoring',
  'API & SDK',
  'Applied Data Science',
  'Integrations',
  'Platform',
  'Developer Onboarding',
];

// Helper to get the priority index of a team name
const getTeamPriorityIndex = (teamName: string): number => {
  const index = TEAM_PRIORITY_ORDER.findIndex(priorityTeam =>
    teamName.toLowerCase().includes(priorityTeam.toLowerCase())
  );
  return index === -1 ? 999 : index;
};

// Helper to determine a person's team from their list of teams using priority order
const getPersonTeam = (memberTeams: string[]): string | null => {
  if (!memberTeams || memberTeams.length === 0) {
    return null;
  }

  if (memberTeams.length === 1) {
    return memberTeams[0];
  }

  // Find the team with the highest priority (lowest priority index)
  let highestPriorityTeam = memberTeams[0];
  let highestPriorityIndex = getTeamPriorityIndex(highestPriorityTeam);

  for (let i = 1; i < memberTeams.length; i++) {
    const currentPriorityIndex = getTeamPriorityIndex(memberTeams[i]);
    if (currentPriorityIndex < highestPriorityIndex) {
      highestPriorityTeam = memberTeams[i];
      highestPriorityIndex = currentPriorityIndex;
    }
  }

  return highestPriorityTeam;
};

// Helper to get the team for a story based on its first owner
const getStoryTeam = (story: Story, memberToTeamsMap: Map<string, string[]>, groupIdToNameMap: Map<string, string>): string => {
  // If story has owners, use the first owner's team
  if (story.owner_ids && story.owner_ids.length > 0) {
    const firstOwnerId = story.owner_ids[0];
    const memberTeams = memberToTeamsMap.get(firstOwnerId);

    if (memberTeams && memberTeams.length > 0) {
      const personTeam = getPersonTeam(memberTeams);
      if (personTeam) {
        return personTeam;
      }
    }
  }

  // Fall back to story.group_id
  if (story.group_id) {
    return groupIdToNameMap.get(story.group_id) || story.group_id;
  }

  return 'unassigned';
};

interface ExecutionProps {
  onStorySelect: (story: Story, stories: Story[]) => void;
  selectedIterationName?: string | null;
  onIterationDataChange?: (iterationId: number | null, stories: Story[], iterationName: string | null) => void;
}

export const Execution: React.FC<ExecutionProps> = ({ onStorySelect, selectedIterationName, onIterationDataChange }) => {
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

  // Team mapping state
  const [memberToTeamsMap, setMemberToTeamsMap] = useState<Map<string, string[]>>(new Map());
  const [groupIdToNameMap, setGroupIdToNameMap] = useState<Map<string, string>>(new Map());

  // Member names cache - fetch once and reuse across all components
  const [memberNamesCache, setMemberNamesCache] = useState<Record<string, string>>({});

  // Load groups and build member-to-teams mapping on mount
  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    loadIterations();
  }, [selectedIterationName, includeAllIterations]);

  useEffect(() => {
    if (selectedIterationId) {
      loadStories(selectedIterationId);
    }
  }, [selectedIterationId]);

  // Notify parent component of iteration data changes
  useEffect(() => {
    if (onIterationDataChange) {
      // Get the current iteration name
      const currentIteration = iterations.find(it => it.id === selectedIterationId);
      const iterationName = currentIteration?.name || null;
      onIterationDataChange(selectedIterationId, stories, iterationName);
    }
  }, [selectedIterationId, stories, iterations, onIterationDataChange]);

  // Fetch member names when stories change (only fetch new members)
  useEffect(() => {
    const fetchMemberNames = async () => {
      // Get all unique owner IDs from stories
      const allOwnerIds = new Set<string>();
      stories.forEach(story => {
        if (story.owner_ids && story.owner_ids.length > 0) {
          story.owner_ids.forEach(ownerId => allOwnerIds.add(ownerId));
        }
      });

      // Filter out members we already have cached
      const newOwnerIds = Array.from(allOwnerIds).filter(
        ownerId => ownerId !== 'unassigned' && !memberNamesCache[ownerId]
      );

      if (newOwnerIds.length === 0) return;

      console.log(`Fetching ${newOwnerIds.length} new member names...`);

      // Fetch all new member names in parallel
      const memberPromises = newOwnerIds.map(async (ownerId) => {
        try {
          const member = await api.getMember(ownerId);
          return { ownerId, name: member.profile?.name || 'Unknown' };
        } catch (error) {
          console.error('Error fetching member:', error);
          return { ownerId, name: 'Unknown' };
        }
      });

      const memberResults = await Promise.all(memberPromises);

      // Update cache with new members
      const newCache = { ...memberNamesCache };
      memberResults.forEach(({ ownerId, name }) => {
        newCache[ownerId] = name;
      });
      newCache['unassigned'] = 'Unassigned';

      setMemberNamesCache(newCache);
    };

    if (stories.length > 0) {
      fetchMemberNames();
    }
  }, [stories]);

  const loadGroups = async () => {
    try {
      const allGroups = await api.getGroups();

      // Filter to only the teams we care about for priority logic
      const groups = allGroups.filter((group: Group) =>
        TEAM_PRIORITY_ORDER.includes(group.name)
      );

      console.log('Filtered to priority teams:', groups.map(g => g.name));
      console.log('Sample group structure:', groups[0]);

      // Build member-to-teams mapping
      const memberToTeams = new Map<string, string[]>();
      const groupIdToName = new Map<string, string>();

      // Also keep all group IDs and names for fallback (even non-priority teams)
      allGroups.forEach((group: Group) => {
        groupIdToName.set(group.id, group.name);
      });

      // Only process priority teams for member-to-teams mapping
      groups.forEach((group: Group) => {
        if (group.member_ids && group.member_ids.length > 0) {
          group.member_ids.forEach((memberId: string) => {
            if (!memberToTeams.has(memberId)) {
              memberToTeams.set(memberId, []);
            }
            memberToTeams.get(memberId)!.push(group.name);
          });
        }
      });

      setMemberToTeamsMap(memberToTeams);
      setGroupIdToNameMap(groupIdToName);

      console.log('Member to teams mapping loaded:', memberToTeams.size, 'members in priority teams');
      console.log('Sample member-to-teams mapping:', Array.from(memberToTeams.entries()).slice(0, 5));
    } catch (err) {
      console.error('Error loading groups:', err);
      // Don't set error state, just log it - this is not critical
    }
  };

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
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];
    const inMotionStates = ['In Development'];

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

  const handleStatusByCategoryClick = (category: string, status: 'completed' | 'inMotion' | 'notStarted') => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];
    const inMotionStates = ['In Development'];

    // Filter stories by category and status
    const filteredStories = stories.filter(story => {
      // Check if story belongs to this category
      const hasCategory = story.labels?.some(l => l.name === category);
      if (!hasCategory) return false;

      // Check if story matches the status
      const stateName = story.workflow_state?.name || '';
      if (status === 'completed' && completedStates.includes(stateName)) return true;
      if (status === 'inMotion' && inMotionStates.includes(stateName)) return true;
      if (status === 'notStarted' && !completedStates.includes(stateName) && !inMotionStates.includes(stateName)) return true;

      return false;
    });

    // Set modal data
    const statusLabel = status === 'completed' ? 'Completed' : status === 'inMotion' ? 'In Motion' : 'Not Started';
    setModalTitle(`${category} - ${statusLabel} (${filteredStories.length} stories)`);
    setModalStories(filteredStories);
    setIsModalOpen(true);
  };

  const handleTeamBarClick = (teamId: string, label: string) => {
    // teamId might be comma-separated for merged teams
    const teamNames = teamId.split(',');

    // Filter stories by team(s) and label (using priority logic)
    const filteredStories = stories.filter(story => {
      const storyTeamName = getStoryTeam(story, memberToTeamsMap, groupIdToNameMap);
      if (!teamNames.includes(storyTeamName)) return false;

      // Get the highest priority label for this story
      const priorityLabel = getHighestPriorityLabel(story.labels);
      return priorityLabel === label;
    });

    setModalTitle(`${label} (${filteredStories.length} stories)`);
    setModalStories(filteredStories);
    setIsModalOpen(true);
  };

  const handleStatusByTeamClick = (teamId: string, teamName: string, status: 'completed' | 'inMotion' | 'notStarted') => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];
    const inMotionStates = ['In Development'];

    // teamId might be comma-separated for merged teams
    const teamNames = teamId.split(',');

    // Filter stories by team(s) and status
    const filteredStories = stories.filter(story => {
      // Check if story belongs to this team
      const storyTeamName = getStoryTeam(story, memberToTeamsMap, groupIdToNameMap);
      if (!teamNames.includes(storyTeamName)) return false;

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
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];
    const inMotionStates = ['In Development'];

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
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];
    const inMotionStates = ['In Development'];

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
      const teamName = getStoryTeam(story, memberToTeamsMap, groupIdToNameMap);

      if (!teamData[teamName]) {
        teamData[teamName] = {};
        LABEL_CATEGORIES_WITH_OTHER.forEach(label => {
          teamData[teamName][label] = 0;
        });
      }

      // Get the highest priority label for this story (each story counted only once)
      const priorityLabel = getHighestPriorityLabel(story.labels);
      teamData[teamName][priorityLabel] = (teamData[teamName][priorityLabel] || 0) + 1;
    });

    // Convert to array format for rendering
    return Object.entries(teamData).map(([teamName, counts]) => ({
      teamId: teamName, // Keep as teamId for backward compatibility
      data: LABEL_CATEGORIES_WITH_OTHER.map(label => ({
        label,
        count: counts[label] || 0,
      })),
    }));
  }, [stories, memberToTeamsMap, groupIdToNameMap]);

  // Calculate status breakdown for each team (use same team list as teamLabelCounts)
  const statusByTeam = useMemo(() => {
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];
    const inMotionStates = ['In Development'];

    // Use the same team IDs from teamLabelCounts to ensure consistency
    return teamLabelCounts.map(({ teamId }) => {
      // Filter stories for this team
      const teamStories = stories.filter(story => {
        const storyTeamName = getStoryTeam(story, memberToTeamsMap, groupIdToNameMap);
        return storyTeamName === teamId;
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
  }, [stories, teamLabelCounts, memberToTeamsMap, groupIdToNameMap]);

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
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];

    const ownerMap: Record<string, {
      ownerId: string;
      teamId: string;
      productFeatures: Story[];
      bugFixes: Story[];
      foundationWork: Story[];
      smallImprovement: Story[];
      task: Story[];
      customerFeatureRequest: Story[];
      niceToHave: Story[];
      customerEscalation: Story[];
      other: Story[];
      completed: Story[];
    }> = {};

    stories.forEach(story => {
      const ownerId = story.owner_ids && story.owner_ids.length > 0
        ? story.owner_ids[0]
        : 'unassigned';

      if (!ownerMap[ownerId]) {
        // Determine team for this owner
        let teamId: string;
        if (ownerId === 'unassigned') {
          teamId = 'unassigned';
        } else {
          const memberTeams = memberToTeamsMap.get(ownerId);
          if (memberTeams && memberTeams.length > 0) {
            const personTeam = getPersonTeam(memberTeams);
            teamId = personTeam || (story.group_id ? (groupIdToNameMap.get(story.group_id) || story.group_id) : 'unassigned');
          } else {
            // Fall back to story's group_id
            teamId = story.group_id ? (groupIdToNameMap.get(story.group_id) || story.group_id) : 'unassigned';
          }
        }

        ownerMap[ownerId] = {
          ownerId,
          teamId,
          productFeatures: [],
          bugFixes: [],
          foundationWork: [],
          smallImprovement: [],
          task: [],
          customerFeatureRequest: [],
          niceToHave: [],
          customerEscalation: [],
          other: [],
          completed: [],
        };
      }

      // Get the first matching label for this story
      const category = getFirstMatchingLabel(story.labels);

      // Categorize the ticket based on the first matching tag
      if (category === 'PRODUCT FEATURE') {
        ownerMap[ownerId].productFeatures.push(story);
      } else if (category === 'BUG') {
        ownerMap[ownerId].bugFixes.push(story);
      } else if (category === 'FOUNDATIONAL WORK') {
        ownerMap[ownerId].foundationWork.push(story);
      } else if (category === 'SMALL IMPROVEMENT') {
        ownerMap[ownerId].smallImprovement.push(story);
      } else if (category === 'TASK') {
        ownerMap[ownerId].task.push(story);
      } else if (category === 'CUSTOMER FEATURE REQUEST') {
        ownerMap[ownerId].customerFeatureRequest.push(story);
      } else if (category === 'NICE TO HAVE') {
        ownerMap[ownerId].niceToHave.push(story);
      } else if (category === 'CUSTOMER ESCALATION') {
        ownerMap[ownerId].customerEscalation.push(story);
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
  }, [stories, memberToTeamsMap, groupIdToNameMap]);

  // Calculate progress percentages based on workflow states
  const progressStats = useMemo(() => {
    if (stories.length === 0) {
      return { completed: 0, inMotion: 0, notStarted: 0 };
    }

    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];
    const inMotionStates = ['In Development'];

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
                          onBarClick={handleStatusByCategoryClick}
                        />
                      </div>
                    )
                  ) : statusViewBy === 'owner' ? (
                    statusByOwner.length > 0 && (
                      <div className="owner-stacked-section">
                        <StatusByOwnerWrapper
                          statusByOwner={statusByOwner}
                          onBarClick={handleStatusByOwnerClick}
                          memberNamesCache={memberNamesCache}
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
                          memberNamesCache={memberNamesCache}
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
                memberNamesCache={memberNamesCache}
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
  memberNamesCache: Record<string, string>;
}> = ({ ownerLabelCounts, onBarClick, memberNamesCache }) => {

  // Transform data for stacked bar chart
  const stackedData = ownerLabelCounts.map(({ ownerId, data }) => {
    const ownerName = memberNamesCache[ownerId] || 'Unknown';
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
  memberNamesCache: Record<string, string>;
}> = ({ statusByOwner, onBarClick, memberNamesCache }) => {

  // Transform data for status stacked bar chart
  const statusData = statusByOwner.map(({ ownerId, completedCount, inMotionCount, notStartedCount, totalCount }) => {
    const ownerName = memberNamesCache[ownerId] || 'Unknown';
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
  // teamId is actually the team name now, no need to fetch
  // Transform data for stacked bar chart (no merging or custom sorting)
  const stackedData = teamLabelCounts
    .map(({ teamId, data }) => {
      const teamName = teamId; // teamId is actually the team name
      const totalCount = data.reduce((sum, item) => sum + item.count, 0);

      return {
        ownerId: teamName, // Use team name for click handling
        ownerName: teamName,
        initials: teamName, // Use full team name instead of initials
        labelCounts: data,
        totalCount,
      };
    })
    .sort((a, b) => {
      // Sort unassigned last, then alphabetically
      if (a.ownerName === 'unassigned') return 1;
      if (b.ownerName === 'unassigned') return -1;
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
  // teamId is actually the team name now, no need to fetch
  // Transform data for status stacked bar chart (no merging or custom sorting)
  const statusData = statusByTeam
    .map(({ teamId, completedCount, inMotionCount, notStartedCount, totalCount }) => {
      const teamName = teamId; // teamId is actually the team name

      return {
        label: teamName, // Use full team name instead of initials
        fullName: teamName,
        ownerId: teamName, // Use team name for click handling
        completedCount,
        inMotionCount,
        notStartedCount,
        totalCount,
      };
    })
    .sort((a, b) => {
      // Sort unassigned last, then alphabetically
      if (a.fullName === 'unassigned') return 1;
      if (b.fullName === 'unassigned') return -1;
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
    smallImprovement: Story[];
    task: Story[];
    customerFeatureRequest: Story[];
    niceToHave: Story[];
    customerEscalation: Story[];
    other: Story[];
    completed: Story[];
  }>;
  memberNamesCache: Record<string, string>;
  onStoryClick: (stories: Story[], title: string) => void;
}> = ({ ownerTableData, memberNamesCache, onStoryClick }) => {
  const [sortBy, setSortBy] = useState<'owner' | 'team' | 'stories' | 'productFeatures' | 'bugFixes' | 'foundationWork' | 'smallImprovement' | 'task' | 'customerFeatureRequest' | 'niceToHave' | 'customerEscalation' | 'other' | 'completed'>('team');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Team names are already in teamId (no need to fetch)
  const teamNames: Record<string, string> = {};
  const uniqueTeamIds = [...new Set(ownerTableData.map(o => o.teamId))];
  uniqueTeamIds.forEach(teamId => {
    teamNames[teamId] = teamId; // teamId is already the team name
  });

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  // Sort table data
  const sortedData = [...ownerTableData].sort((a, b) => {
    let compareValue = 0;

    if (sortBy === 'owner') {
      const nameA = memberNamesCache[a.ownerId] || 'Unknown';
      const nameB = memberNamesCache[b.ownerId] || 'Unknown';
      compareValue = nameA.localeCompare(nameB);
    } else if (sortBy === 'team') {
      const teamA = teamNames[a.teamId] || 'Unknown';
      const teamB = teamNames[b.teamId] || 'Unknown';

      // Sort unassigned last, then alphabetically
      if (teamA === 'unassigned' && teamB !== 'unassigned') {
        compareValue = 1;
      } else if (teamA !== 'unassigned' && teamB === 'unassigned') {
        compareValue = -1;
      } else {
        compareValue = teamA.localeCompare(teamB);
      }
    } else if (sortBy === 'stories') {
      const totalA = a.productFeatures.length + a.bugFixes.length + a.foundationWork.length +
                     a.smallImprovement.length + a.task.length + a.customerFeatureRequest.length +
                     a.niceToHave.length + a.customerEscalation.length + a.other.length;
      const totalB = b.productFeatures.length + b.bugFixes.length + b.foundationWork.length +
                     b.smallImprovement.length + b.task.length + b.customerFeatureRequest.length +
                     b.niceToHave.length + b.customerEscalation.length + b.other.length;
      compareValue = totalA - totalB;
    } else if (sortBy === 'productFeatures') {
      compareValue = a.productFeatures.length - b.productFeatures.length;
    } else if (sortBy === 'bugFixes') {
      compareValue = a.bugFixes.length - b.bugFixes.length;
    } else if (sortBy === 'foundationWork') {
      compareValue = a.foundationWork.length - b.foundationWork.length;
    } else if (sortBy === 'smallImprovement') {
      compareValue = a.smallImprovement.length - b.smallImprovement.length;
    } else if (sortBy === 'task') {
      compareValue = a.task.length - b.task.length;
    } else if (sortBy === 'customerFeatureRequest') {
      compareValue = a.customerFeatureRequest.length - b.customerFeatureRequest.length;
    } else if (sortBy === 'niceToHave') {
      compareValue = a.niceToHave.length - b.niceToHave.length;
    } else if (sortBy === 'customerEscalation') {
      compareValue = a.customerEscalation.length - b.customerEscalation.length;
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
              <th onClick={() => handleSort('stories')} className="sortable-header">
                <span className="header-content">
                  #
                  <SortIcon column="stories" />
                </span>
              </th>
              <th onClick={() => handleSort('completed')} className="sortable-header">
                <span className="header-content">
                  Done
                  <SortIcon column="completed" />
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
              <th onClick={() => handleSort('smallImprovement')} className="sortable-header">
                <span className="header-content">
                  Small Improvement
                  <SortIcon column="smallImprovement" />
                </span>
              </th>
              <th onClick={() => handleSort('task')} className="sortable-header">
                <span className="header-content">
                  Task
                  <SortIcon column="task" />
                </span>
              </th>
              <th onClick={() => handleSort('customerFeatureRequest')} className="sortable-header">
                <span className="header-content">
                  Customer Feature Request
                  <SortIcon column="customerFeatureRequest" />
                </span>
              </th>
              <th onClick={() => handleSort('niceToHave')} className="sortable-header">
                <span className="header-content">
                  Nice to have
                  <SortIcon column="niceToHave" />
                </span>
              </th>
              <th onClick={() => handleSort('customerEscalation')} className="sortable-header">
                <span className="header-content">
                  Customer Escalation
                  <SortIcon column="customerEscalation" />
                </span>
              </th>
              <th onClick={() => handleSort('other')} className="sortable-header">
                <span className="header-content">
                  Other
                  <SortIcon column="other" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map(({ ownerId, teamId, productFeatures, bugFixes, foundationWork, smallImprovement, task, customerFeatureRequest, niceToHave, customerEscalation, other, completed }) => {
              const ownerName = memberNamesCache[ownerId] || 'Unknown';
              const teamName = teamNames[teamId] || 'Unknown';
              const totalStories = productFeatures.length + bugFixes.length + foundationWork.length +
                                   smallImprovement.length + task.length + customerFeatureRequest.length +
                                   niceToHave.length + customerEscalation.length + other.length;
              const allStories = [...productFeatures, ...bugFixes, ...foundationWork, ...smallImprovement,
                                  ...task, ...customerFeatureRequest, ...niceToHave, ...customerEscalation, ...other];

              return (
                <tr key={ownerId}>
                  <td className="owner-cell">{ownerName}</td>
                  <td
                    className={`count-cell ${totalStories > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => totalStories > 0 && onStoryClick(allStories, `${ownerName} - All Stories`)}
                  >
                    {totalStories > 0 ? totalStories : ''}
                  </td>
                  <td
                    className={`count-cell ${completed.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => completed.length > 0 && onStoryClick(completed, `${ownerName} - Completed`)}
                  >
                    {completed.length}
                  </td>
                  <td className="team-cell">{teamName}</td>
                  <td
                    className={`count-cell ${productFeatures.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => productFeatures.length > 0 && onStoryClick(productFeatures, `${ownerName} - Product Features`)}
                  >
                    {productFeatures.length > 0 ? productFeatures.length : ''}
                  </td>
                  <td
                    className={`count-cell ${bugFixes.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => bugFixes.length > 0 && onStoryClick(bugFixes, `${ownerName} - Bug Fixes`)}
                  >
                    {bugFixes.length > 0 ? bugFixes.length : ''}
                  </td>
                  <td
                    className={`count-cell ${foundationWork.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => foundationWork.length > 0 && onStoryClick(foundationWork, `${ownerName} - Foundation Work`)}
                  >
                    {foundationWork.length > 0 ? foundationWork.length : ''}
                  </td>
                  <td
                    className={`count-cell ${smallImprovement.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => smallImprovement.length > 0 && onStoryClick(smallImprovement, `${ownerName} - Small Improvement`)}
                  >
                    {smallImprovement.length > 0 ? smallImprovement.length : ''}
                  </td>
                  <td
                    className={`count-cell ${task.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => task.length > 0 && onStoryClick(task, `${ownerName} - Task`)}
                  >
                    {task.length > 0 ? task.length : ''}
                  </td>
                  <td
                    className={`count-cell ${customerFeatureRequest.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => customerFeatureRequest.length > 0 && onStoryClick(customerFeatureRequest, `${ownerName} - Customer Feature Request`)}
                  >
                    {customerFeatureRequest.length > 0 ? customerFeatureRequest.length : ''}
                  </td>
                  <td
                    className={`count-cell ${niceToHave.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => niceToHave.length > 0 && onStoryClick(niceToHave, `${ownerName} - Nice to have`)}
                  >
                    {niceToHave.length > 0 ? niceToHave.length : ''}
                  </td>
                  <td
                    className={`count-cell ${customerEscalation.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => customerEscalation.length > 0 && onStoryClick(customerEscalation, `${ownerName} - Customer Escalation`)}
                  >
                    {customerEscalation.length > 0 ? customerEscalation.length : ''}
                  </td>
                  <td
                    className={`count-cell ${other.length > 0 ? 'clickable' : 'zero-cell'}`}
                    onClick={() => other.length > 0 && onStoryClick(other, `${ownerName} - Other`)}
                  >
                    {other.length > 0 ? other.length : ''}
                  </td>
                </tr>
              );
            })}
            {/* Total row */}
            {sortedData.length > 0 && (() => {
              const totalStories = sortedData.reduce((sum, row) =>
                sum + row.productFeatures.length + row.bugFixes.length + row.foundationWork.length +
                row.smallImprovement.length + row.task.length + row.customerFeatureRequest.length +
                row.niceToHave.length + row.customerEscalation.length + row.other.length, 0);
              const totalProductFeatures = sortedData.reduce((sum, row) => sum + row.productFeatures.length, 0);
              const totalBugFixes = sortedData.reduce((sum, row) => sum + row.bugFixes.length, 0);
              const totalFoundationWork = sortedData.reduce((sum, row) => sum + row.foundationWork.length, 0);
              const totalSmallImprovement = sortedData.reduce((sum, row) => sum + row.smallImprovement.length, 0);
              const totalTask = sortedData.reduce((sum, row) => sum + row.task.length, 0);
              const totalCustomerFeatureRequest = sortedData.reduce((sum, row) => sum + row.customerFeatureRequest.length, 0);
              const totalNiceToHave = sortedData.reduce((sum, row) => sum + row.niceToHave.length, 0);
              const totalCustomerEscalation = sortedData.reduce((sum, row) => sum + row.customerEscalation.length, 0);
              const totalOther = sortedData.reduce((sum, row) => sum + row.other.length, 0);
              const totalCompleted = sortedData.reduce((sum, row) => sum + row.completed.length, 0);

              return (
                <tr className="total-row">
                  <td className="total-label"><strong>Total</strong></td>
                  <td className="count-cell"><strong>{totalStories > 0 ? totalStories : ''}</strong></td>
                  <td className="count-cell"><strong>{totalCompleted}</strong></td>
                  <td></td>
                  <td className="count-cell"><strong>{totalProductFeatures > 0 ? totalProductFeatures : ''}</strong></td>
                  <td className="count-cell"><strong>{totalBugFixes > 0 ? totalBugFixes : ''}</strong></td>
                  <td className="count-cell"><strong>{totalFoundationWork > 0 ? totalFoundationWork : ''}</strong></td>
                  <td className="count-cell"><strong>{totalSmallImprovement > 0 ? totalSmallImprovement : ''}</strong></td>
                  <td className="count-cell"><strong>{totalTask > 0 ? totalTask : ''}</strong></td>
                  <td className="count-cell"><strong>{totalCustomerFeatureRequest > 0 ? totalCustomerFeatureRequest : ''}</strong></td>
                  <td className="count-cell"><strong>{totalNiceToHave > 0 ? totalNiceToHave : ''}</strong></td>
                  <td className="count-cell"><strong>{totalCustomerEscalation > 0 ? totalCustomerEscalation : ''}</strong></td>
                  <td className="count-cell"><strong>{totalOther > 0 ? totalOther : ''}</strong></td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
};
