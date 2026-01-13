import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { MongoClient, Db } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Only enable CORS in development (not needed when serving frontend from same origin)
if (process.env.NODE_ENV !== 'production') {
  app.use(cors());
}
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

const SHORTCUT_API_BASE = 'https://api.app.shortcut.com/api/v3';
const SHORTCUT_TOKEN = process.env.SHORTCUT_TOKEN;

if (!SHORTCUT_TOKEN) {
  console.error('SHORTCUT_TOKEN is not set in environment variables');
  process.exit(1);
}

const shortcutHeaders = {
  'Shortcut-Token': SHORTCUT_TOKEN,
  'Content-Type': 'application/json',
};

// MongoDB Configuration
// Support both remote MongoDB Atlas and local MongoDB
let MONGO_URI: string;
let MONGO_DB_NAME: string;

// Check if using MongoDB Atlas credentials (remote)
const MONGO_USER = process.env.MONGO_USER;
const MONGO_PASS = process.env.MONGO_PASS;
const MONGO_CLUSTER = process.env.MONGO_CLUSTER;

if (MONGO_USER && MONGO_PASS && MONGO_CLUSTER) {
  // Remote MongoDB Atlas setup
  MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'snip';

  // URL-encode credentials to handle special characters
  const escapedUser = encodeURIComponent(MONGO_USER);
  const escapedPass = encodeURIComponent(MONGO_PASS);

  MONGO_URI = `mongodb+srv://${escapedUser}:${escapedPass}@${MONGO_CLUSTER}/?retryWrites=true&w=majority`;
  console.log('📡 Using remote MongoDB Atlas configuration');
} else {
  // Local MongoDB setup or custom MONGO_URI
  MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
  MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'snip';
  console.log('💾 Using local MongoDB configuration');
}

let mongoClient: MongoClient;
let db: Db;

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    db = mongoClient.db(MONGO_DB_NAME);
    console.log('✅ Connected to MongoDB');
    console.log('   URI:', MONGO_URI);
    console.log('   Database:', MONGO_DB_NAME);
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    console.error('Server will continue but bookmark features will not work');
    // Don't exit - allow server to run without MongoDB for testing
  }
}

// Debug route to test if API routing works
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// Get all epics with pagination
app.get('/api/epics', async (req, res) => {
  try {
    const response = await axios.get(`${SHORTCUT_API_BASE}/epics`, {
      headers: shortcutHeaders,
    });

    const epics = response.data;

    // Fetch workflows to get excluded states
    const workflowsResponse = await axios.get(`${SHORTCUT_API_BASE}/workflows`, {
      headers: shortcutHeaders,
    });

    const excludedStates = [
      'Merged to Main',
      'Completed / In Prod',
      'Duplicate / Unneeded',
      'Done'
    ];

    // Create a map of workflow_state_id to workflow_state name
    const workflowStateMap = new Map();
    workflowsResponse.data.forEach((workflow: any) => {
      workflow.states.forEach((state: any) => {
        workflowStateMap.set(state.id, { id: state.id, name: state.name, type: state.type });
      });
    });

    // Fetch story counts for each epic in parallel
    const epicsWithCounts = await Promise.all(
      epics.map(async (epic: any) => {
        try {
          const storiesResponse = await axios.get(`${SHORTCUT_API_BASE}/epics/${epic.id}/stories`, {
            headers: shortcutHeaders,
          });

          // Count only stories not in excluded states
          const activeStoryCount = storiesResponse.data.filter((story: any) => {
            const stateName = workflowStateMap.get(story.workflow_state_id)?.name;
            return !stateName || !excludedStates.includes(stateName);
          }).length;

          return {
            ...epic,
            active_story_count: activeStoryCount
          };
        } catch (error) {
          console.error(`Error fetching stories for epic ${epic.id}:`, error);
          return {
            ...epic,
            active_story_count: 0
          };
        }
      })
    );

    res.json(epicsWithCounts);
  } catch (error) {
    console.error('Error fetching epics:', error);
    res.status(500).json({ error: 'Failed to fetch epics' });
  }
});

// Get stories for a specific epic
app.get('/api/epics/:epicId/stories', async (req, res) => {
  try {
    const { epicId } = req.params;
    const storiesResponse = await axios.get(`${SHORTCUT_API_BASE}/epics/${epicId}/stories`, {
      headers: shortcutHeaders,
    });

    // Fetch all workflows to get workflow states
    const workflowsResponse = await axios.get(`${SHORTCUT_API_BASE}/workflows`, {
      headers: shortcutHeaders,
    });

    // Create a map of workflow_state_id to workflow_state name
    const workflowStateMap = new Map();
    workflowsResponse.data.forEach((workflow: any) => {
      workflow.states.forEach((state: any) => {
        workflowStateMap.set(state.id, { id: state.id, name: state.name, type: state.type });
      });
    });

    // Fetch iterations to get iteration information
    const iterationsResponse = await axios.get(`${SHORTCUT_API_BASE}/iterations`, {
      headers: shortcutHeaders,
    });

    // Create a map of iteration_id to iteration
    const iterationMap = new Map();
    iterationsResponse.data.forEach((iteration: any) => {
      iterationMap.set(iteration.id, iteration);
    });

    // Enrich stories with workflow_state and iteration information
    const enrichedStories = storiesResponse.data.map((story: any) => ({
      ...story,
      workflow_state: workflowStateMap.get(story.workflow_state_id),
      iteration: story.iteration_id ? iterationMap.get(story.iteration_id) : undefined
    }));

    console.log('Sample workflow states:', enrichedStories.slice(0, 3).map((s: any) => ({
      id: s.id,
      name: s.name,
      workflow_state: s.workflow_state
    })));

    res.json(enrichedStories);
  } catch (error) {
    console.error('Error fetching stories:', error);
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
});

// TEST: Get raw story data from Shortcut API
app.get('/api/stories/:storyId/raw', async (req, res) => {
  try {
    const { storyId } = req.params;
    const response = await axios.get(`${SHORTCUT_API_BASE}/stories/${storyId}`, {
      headers: shortcutHeaders,
    });

    console.log('=== RAW STORY DATA FROM SHORTCUT ===');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('=== ITERATION DATA ===');
    console.log('iteration_id:', response.data.iteration_id);
    console.log('===================================');

    res.json({
      raw_data: response.data,
      iteration_id: response.data.iteration_id,
      has_iteration: !!response.data.iteration_id
    });
  } catch (error) {
    console.error('Error fetching raw story:', error);
    res.status(500).json({ error: 'Failed to fetch raw story' });
  }
});

// Get a specific story
app.get('/api/stories/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;
    const response = await axios.get(`${SHORTCUT_API_BASE}/stories/${storyId}`, {
      headers: shortcutHeaders,
    });

    // Fetch workflows to get workflow state information
    const workflowsResponse = await axios.get(`${SHORTCUT_API_BASE}/workflows`, {
      headers: shortcutHeaders,
    });

    // Create a map of workflow_state_id to workflow_state
    const workflowStateMap = new Map();
    workflowsResponse.data.forEach((workflow: any) => {
      workflow.states.forEach((state: any) => {
        workflowStateMap.set(state.id, { id: state.id, name: state.name, type: state.type });
      });
    });

    // Fetch iterations to get iteration information
    const iterationsResponse = await axios.get(`${SHORTCUT_API_BASE}/iterations`, {
      headers: shortcutHeaders,
    });

    // Create a map of iteration_id to iteration
    const iterationMap = new Map();
    iterationsResponse.data.forEach((iteration: any) => {
      iterationMap.set(iteration.id, iteration);
    });

    // Enrich story with workflow_state and iteration information
    const enrichedStory = {
      ...response.data,
      workflow_state: workflowStateMap.get(response.data.workflow_state_id),
      iteration: response.data.iteration_id ? iterationMap.get(response.data.iteration_id) : undefined
    };

    res.json(enrichedStory);
  } catch (error) {
    console.error('Error fetching story:', error);
    res.status(500).json({ error: 'Failed to fetch story' });
  }
});

// Get member (owner) by ID
app.get('/api/members/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const response = await axios.get(`${SHORTCUT_API_BASE}/members/${memberId}`, {
      headers: shortcutHeaders,
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching member:', error);
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});

// Get all groups (teams)
app.get('/api/groups', async (req, res) => {
  try {
    const response = await axios.get(`${SHORTCUT_API_BASE}/groups`, {
      headers: shortcutHeaders,
    });
    console.log('Sample group data:', JSON.stringify(response.data[0], null, 2));
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get group (team) by ID
app.get('/api/groups/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const response = await axios.get(`${SHORTCUT_API_BASE}/groups/${groupId}`, {
      headers: shortcutHeaders,
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching group:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// Get all iterations
app.get('/api/iterations', async (req, res) => {
  try {
    const response = await axios.get(`${SHORTCUT_API_BASE}/iterations`, {
      headers: shortcutHeaders,
    });

    let iterations = response.data;

    // Check if filtering is requested (default: true for backward compatibility)
    const includeAll = req.query.includeAll === 'true';

    if (!includeAll) {
      // Filter iterations to only include those matching the pattern: MonthYYYY-WN
      // Examples: Nov2025-W1, Dec2025-W2, Jan2026-W3
      const namePattern = /^[A-Z][a-z]{2}\d{4}-W\d+$/;
      iterations = iterations.filter((iteration: any) =>
        namePattern.test(iteration.name)
      );
    }

    res.json(iterations);
  } catch (error) {
    console.error('Error fetching iterations:', error);
    res.status(500).json({ error: 'Failed to fetch iterations' });
  }
});

// Get stories for a specific iteration
app.get('/api/iterations/:iterationId/stories', async (req, res) => {
  try {
    const { iterationId } = req.params;
    const response = await axios.get(`${SHORTCUT_API_BASE}/iterations/${iterationId}/stories`, {
      headers: shortcutHeaders,
    });

    // Fetch the iteration details
    const iterationResponse = await axios.get(`${SHORTCUT_API_BASE}/iterations/${iterationId}`, {
      headers: shortcutHeaders,
    });
    const iteration = iterationResponse.data;

    // Fetch workflows to get workflow state information
    const workflowsResponse = await axios.get(`${SHORTCUT_API_BASE}/workflows`, {
      headers: shortcutHeaders,
    });

    // Create a map of workflow_state_id to workflow_state
    const workflowStateMap = new Map();
    workflowsResponse.data.forEach((workflow: any) => {
      workflow.states.forEach((state: any) => {
        workflowStateMap.set(state.id, { id: state.id, name: state.name, type: state.type });
      });
    });

    // Enrich stories with workflow_state and iteration information
    const enrichedStories = response.data.map((story: any) => ({
      ...story,
      workflow_state: workflowStateMap.get(story.workflow_state_id),
      iteration: iteration
    }));

    res.json(enrichedStories);
  } catch (error) {
    console.error('Error fetching iteration stories:', error);
    res.status(500).json({ error: 'Failed to fetch iteration stories' });
  }
});

// Get planning stats for an iteration (planned vs unplanned stories)
app.get('/api/iterations/:iterationId/planning-stats', async (req, res) => {
  try {
    const { iterationId } = req.params;
    console.log(`Fetching planning stats for iteration ${iterationId}`);

    // Fetch iteration details to get start_date
    const iterationResponse = await axios.get(
      `${SHORTCUT_API_BASE}/iterations/${iterationId}`,
      { headers: shortcutHeaders }
    );
    const iteration = iterationResponse.data;
    // Keep start_date as string (YYYY-MM-DD) to avoid timezone issues
    const iterationStartDateStr = iteration.start_date; // e.g., "2026-01-05"

    // Fetch stories for this iteration
    const storiesResponse = await axios.get(
      `${SHORTCUT_API_BASE}/iterations/${iterationId}/stories`,
      { headers: shortcutHeaders }
    );
    const stories = storiesResponse.data;

    if (stories.length === 0) {
      return res.json({
        planned: { count: 0, percent: 0, storyIds: [], completedCount: 0, completionRate: 0 },
        unplanned: { count: 0, percent: 0, storyIds: [], completedCount: 0, completionRate: 0 },
        iterationStartDate: iteration.start_date
      });
    }

    // Fetch workflows to map workflow_state_id to state name
    const workflowsResponse = await axios.get(`${SHORTCUT_API_BASE}/workflows`, {
      headers: shortcutHeaders,
    });
    const workflowStateMap = new Map<number, string>();
    workflowsResponse.data.forEach((workflow: any) => {
      workflow.states.forEach((state: any) => {
        workflowStateMap.set(state.id, state.name);
      });
    });

    // Fetch history for each story in parallel
    const historyResults = await Promise.all(
      stories.map(async (story: any) => {
        try {
          const historyResponse = await axios.get(
            `${SHORTCUT_API_BASE}/stories/${story.id}/history`,
            { headers: shortcutHeaders }
          );
          const history = historyResponse.data;

          // Sort history chronologically (oldest first) to ensure consistent ordering
          const sortedHistory = [...history].sort((a: any, b: any) =>
            new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
          );

          // Find the EARLIEST time this story was added to this iteration
          let addedToIterationAt: Date | null = null;

          // First, check if story was created directly in this iteration
          const createEntry = sortedHistory.find((h: any) =>
            h.actions?.some((a: any) => a.action === 'create' && a.entity_type === 'story')
          );

          if (createEntry) {
            const createAction = createEntry.actions.find(
              (a: any) => a.action === 'create' && a.entity_type === 'story'
            );
            // Check if the story was CREATED with this iteration_id set
            if (createAction?.changes?.iteration_id?.new === parseInt(iterationId)) {
              addedToIterationAt = new Date(createEntry.changed_at);
            }
          }

          // If not created with this iteration, look for the first time it was moved to this iteration
          if (!addedToIterationAt) {
            for (const entry of sortedHistory) {
              for (const action of entry.actions || []) {
                if (action.entity_type === 'story' && action.changes?.iteration_id) {
                  const newIterationId = action.changes.iteration_id.new;
                  if (newIterationId === parseInt(iterationId)) {
                    addedToIterationAt = new Date(entry.changed_at);
                    break;
                  }
                }
              }
              if (addedToIterationAt) break;
            }
          }

          return {
            storyId: story.id,
            addedToIterationAt
          };
        } catch (error) {
          console.error(`Error fetching history for story ${story.id}:`, error);
          // If we can't determine when it was added, use the story's created_at as fallback
          // This provides more consistent behavior than defaulting to planned
          return {
            storyId: story.id,
            addedToIterationAt: story.created_at ? new Date(story.created_at) : null
          };
        }
      })
    );

    // Categorize stories as planned or unplanned
    // Day 1 of the sprint is considered "planned" since most tickets get added on day 1
    const planned: number[] = [];
    const unplanned: number[] = [];

    // Helper to extract YYYY-MM-DD in Pacific time from a Date
    const getDateStrPacific = (date: Date): string => {
      // Convert to Pacific time and extract YYYY-MM-DD
      const pacificDate = date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
      return pacificDate; // Returns YYYY-MM-DD format
    };

    historyResults.forEach(result => {
      if (!result.addedToIterationAt) {
        // If we couldn't determine when it was added, count as planned
        planned.push(result.storyId);
      } else {
        // Compare the date (YYYY-MM-DD in Pacific time) when story was added to iteration start date
        // Story is "planned" if added on Day 1 (start date) or before
        const addedDateStr = getDateStrPacific(result.addedToIterationAt);

        if (addedDateStr <= iterationStartDateStr) {
          planned.push(result.storyId);
        } else {
          unplanned.push(result.storyId);
        }
      }
    });

    const total = stories.length;
    const plannedPercent = total > 0 ? Math.round((planned.length / total) * 100) : 0;
    const unplannedPercent = total > 0 ? Math.round((unplanned.length / total) * 100) : 0;

    // Debug: log a sample conversion
    const sampleResult = historyResults.find(r => r.addedToIterationAt);
    if (sampleResult) {
      console.log(`Sample conversion: UTC=${sampleResult.addedToIterationAt.toISOString()} -> Pacific=${getDateStrPacific(sampleResult.addedToIterationAt)}, Sprint start=${iterationStartDateStr}`);
    }
    console.log(`Planning stats for iteration ${iterationId}: ${planned.length} planned, ${unplanned.length} unplanned`);

    // Calculate completion rates for planned vs unplanned stories
    const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];

    // Create a map of story id to workflow state name for quick lookup
    const storyStateNameMap = new Map<number, string>();
    stories.forEach((story: any) => {
      const stateName = workflowStateMap.get(story.workflow_state_id) || '';
      storyStateNameMap.set(story.id, stateName);
    });

    const plannedCompleted = planned.filter(id => completedStates.includes(storyStateNameMap.get(id) || '')).length;
    const unplannedCompleted = unplanned.filter(id => completedStates.includes(storyStateNameMap.get(id) || '')).length;

    const plannedCompletionRate = planned.length > 0 ? Math.round((plannedCompleted / planned.length) * 100) : 0;
    const unplannedCompletionRate = unplanned.length > 0 ? Math.round((unplannedCompleted / unplanned.length) * 100) : 0;

    res.json({
      planned: {
        count: planned.length,
        percent: plannedPercent,
        storyIds: planned,
        completedCount: plannedCompleted,
        completionRate: plannedCompletionRate
      },
      unplanned: {
        count: unplanned.length,
        percent: unplannedPercent,
        storyIds: unplanned,
        completedCount: unplannedCompleted,
        completionRate: unplannedCompletionRate
      },
      iterationStartDate: iteration.start_date
    });
  } catch (error) {
    console.error('Error fetching planning stats:', error);
    res.status(500).json({ error: 'Failed to fetch planning stats' });
  }
});

// Update story priority
app.put('/api/stories/:storyId/priority', async (req, res) => {
  try {
    const { storyId } = req.params;
    const { priority } = req.body;

    console.log(`Updating priority for story ${storyId} to "${priority}"`);

    // Get all custom field definitions from the workspace
    const customFieldDefsResponse = await axios.get(`${SHORTCUT_API_BASE}/custom-fields`, {
      headers: shortcutHeaders,
    });

    console.log('Available custom fields:', JSON.stringify(customFieldDefsResponse.data, null, 2));

    // Find the Priority custom field definition
    const priorityFieldDef = customFieldDefsResponse.data.find((field: any) =>
      field.name.toLowerCase() === 'priority'
    );

    if (!priorityFieldDef) {
      console.log('Priority custom field definition not found in workspace');
      return res.status(400).json({
        error: 'Priority field not found',
        details: 'Priority custom field is not configured in your Shortcut workspace'
      });
    }

    console.log('Priority field definition:', JSON.stringify(priorityFieldDef, null, 2));

    // Find the value_id for the selected priority
    const priorityValue = priorityFieldDef.values?.find((v: any) =>
      v.value.toLowerCase() === priority.toLowerCase()
    );

    if (!priorityValue) {
      console.log(`Priority value "${priority}" not found in field definition`);
      return res.status(400).json({
        error: 'Invalid priority value',
        details: `Priority value "${priority}" is not valid. Available: ${priorityFieldDef.values?.map((v: any) => v.value).join(', ')}`
      });
    }

    // Get the current story
    const storyResponse = await axios.get(`${SHORTCUT_API_BASE}/stories/${storyId}`, {
      headers: shortcutHeaders,
    });

    const story = storyResponse.data;
    const customFields = story.custom_fields || [];

    console.log('Current custom fields:', JSON.stringify(customFields, null, 2));

    // Update or add the priority custom field
    let updatedCustomFields;
    const existingPriorityField = customFields.find((f: any) => f.field_id === priorityFieldDef.id);

    if (existingPriorityField) {
      // Update existing field
      updatedCustomFields = customFields.map((field: any) => {
        if (field.field_id === priorityFieldDef.id) {
          return {
            field_id: priorityFieldDef.id,
            value: priority,
            value_id: priorityValue.id
          };
        }
        return field;
      });
    } else {
      // Add new field
      updatedCustomFields = [
        ...customFields,
        {
          field_id: priorityFieldDef.id,
          value: priority,
          value_id: priorityValue.id
        }
      ];
    }

    console.log('Updating with custom fields:', JSON.stringify(updatedCustomFields, null, 2));

    // Update the story
    const updateResponse = await axios.put(
      `${SHORTCUT_API_BASE}/stories/${storyId}`,
      { custom_fields: updatedCustomFields },
      { headers: shortcutHeaders }
    );

    console.log('Priority updated successfully');
    res.json(updateResponse.data);
  } catch (error: any) {
    console.error('Error updating priority:', error.response?.data || error.message);
    const errorDetails = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;
    res.status(500).json({
      error: 'Failed to update priority',
      details: errorDetails
    });
  }
});

// Add comment to a story
app.post('/api/stories/:storyId/comments', async (req, res) => {
  try {
    const { storyId } = req.params;
    const { text } = req.body;

    console.log(`Adding comment to story ${storyId}`);

    const response = await axios.post(
      `${SHORTCUT_API_BASE}/stories/${storyId}/comments`,
      { text },
      { headers: shortcutHeaders }
    );

    console.log('Comment added successfully');
    res.json(response.data);
  } catch (error: any) {
    console.error('Error adding comment:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to add comment',
      details: error.response?.data || error.message
    });
  }
});

// Add label to a story
app.post('/api/stories/:storyId/labels', async (req, res) => {
  try {
    const { storyId } = req.params;
    const { labelName } = req.body;

    console.log(`Adding label "${labelName}" to story ${storyId}`);

    // First, get the current story to retrieve existing labels
    const storyResponse = await axios.get(`${SHORTCUT_API_BASE}/stories/${storyId}`, {
      headers: shortcutHeaders,
    });

    const story = storyResponse.data;
    const existingLabels = story.labels || [];

    console.log('Existing labels:', existingLabels.map((l: any) => l.name));

    // Check if label already exists (case-insensitive)
    const labelExists = existingLabels.some((label: any) =>
      label.name.toLowerCase() === labelName.toLowerCase()
    );
    if (labelExists) {
      console.log('Label already exists');
      return res.json({ message: 'Label already exists on story', story });
    }

    // Keep only the essential label properties for the update
    const simplifiedLabels = existingLabels.map((label: any) => ({
      name: label.name
    }));

    // Add new label
    const updatedLabels = [...simplifiedLabels, { name: labelName }];

    console.log('Updating with labels:', updatedLabels);

    // Update the story with all labels
    const updateResponse = await axios.put(
      `${SHORTCUT_API_BASE}/stories/${storyId}`,
      { labels: updatedLabels },
      { headers: shortcutHeaders }
    );

    console.log('Label added successfully');
    res.json(updateResponse.data);
  } catch (error: any) {
    console.error('Error adding label:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to add label',
      details: error.response?.data || error.message
    });
  }
});

// Remove label from a story
app.delete('/api/stories/:storyId/labels/:labelId', async (req, res) => {
  try {
    const { storyId, labelId } = req.params;

    console.log(`Removing label ${labelId} from story ${storyId}`);

    // First, get the current story to retrieve existing labels
    const storyResponse = await axios.get(`${SHORTCUT_API_BASE}/stories/${storyId}`, {
      headers: shortcutHeaders,
    });

    const story = storyResponse.data;
    const existingLabels = story.labels || [];

    console.log('Existing labels:', existingLabels.map((l: any) => `${l.id}:${l.name}`));

    // Filter out the label to remove
    const updatedLabels = existingLabels
      .filter((label: any) => label.id !== parseInt(labelId))
      .map((label: any) => ({ name: label.name }));

    console.log('Updating with labels:', updatedLabels);

    // Update the story with remaining labels
    const updateResponse = await axios.put(
      `${SHORTCUT_API_BASE}/stories/${storyId}`,
      { labels: updatedLabels },
      { headers: shortcutHeaders }
    );

    console.log('Label removed successfully');
    res.json(updateResponse.data);
  } catch (error: any) {
    console.error('Error removing label:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to remove label',
      details: error.response?.data || error.message
    });
  }
});

// ===== BOOKMARK ENDPOINTS =====

// Get all bookmarked stories
app.get('/api/bookmarks', async (req, res) => {
  try {
    const bookmarks = await db.collection('bookmarked_stories')
      .find({})
      .sort({ bookmarked_at: -1 })
      .toArray();

    res.json(bookmarks);
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
});

// Check if a story is bookmarked
app.get('/api/bookmarks/check/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;
    const bookmark = await db.collection('bookmarked_stories').findOne({ id: parseInt(storyId) });

    res.json({ isBookmarked: !!bookmark });
  } catch (error) {
    console.error('Error checking bookmark:', error);
    res.status(500).json({ error: 'Failed to check bookmark' });
  }
});

// Add a bookmark
app.post('/api/bookmarks', async (req, res) => {
  try {
    const story = req.body;

    // Check if already bookmarked
    const existing = await db.collection('bookmarked_stories').findOne({ id: story.id });
    if (existing) {
      return res.status(400).json({ error: 'Story already bookmarked' });
    }

    // Add bookmarked_at timestamp
    const bookmarkedStory = {
      ...story,
      bookmarked_at: new Date()
    };

    await db.collection('bookmarked_stories').insertOne(bookmarkedStory);
    console.log(`Bookmarked story ${story.id}: ${story.name}`);

    res.json({ message: 'Story bookmarked successfully', story: bookmarkedStory });
  } catch (error) {
    console.error('Error adding bookmark:', error);
    res.status(500).json({ error: 'Failed to add bookmark' });
  }
});

// Remove a bookmark
app.delete('/api/bookmarks/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;

    const result = await db.collection('bookmarked_stories').deleteOne({ id: parseInt(storyId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    console.log(`Removed bookmark for story ${storyId}`);
    res.json({ message: 'Bookmark removed successfully' });
  } catch (error) {
    console.error('Error removing bookmark:', error);
    res.status(500).json({ error: 'Failed to remove bookmark' });
  }
});

// ===== EPIC BOOKMARK ENDPOINTS =====

// Get all bookmarked epics
app.get('/api/epics/bookmarks', async (req, res) => {
  try {
    const bookmarks = await db.collection('bookmarked_epics')
      .find({})
      .sort({ bookmarked_at: -1 })
      .toArray();

    res.json(bookmarks);
  } catch (error) {
    console.error('Error fetching epic bookmarks:', error);
    res.status(500).json({ error: 'Failed to fetch epic bookmarks' });
  }
});

// Check if an epic is bookmarked
app.get('/api/epics/bookmarks/check/:epicId', async (req, res) => {
  try {
    const { epicId } = req.params;
    const bookmark = await db.collection('bookmarked_epics').findOne({ id: parseInt(epicId) });

    res.json({ isBookmarked: !!bookmark });
  } catch (error) {
    console.error('Error checking epic bookmark:', error);
    res.status(500).json({ error: 'Failed to check epic bookmark' });
  }
});

// Add an epic bookmark
app.post('/api/epics/bookmarks', async (req, res) => {
  try {
    const epic = req.body;

    // Check if already bookmarked
    const existing = await db.collection('bookmarked_epics').findOne({ id: epic.id });
    if (existing) {
      return res.status(400).json({ error: 'Epic already bookmarked' });
    }

    // Add bookmarked_at timestamp
    const bookmarkedEpic = {
      ...epic,
      bookmarked_at: new Date()
    };

    await db.collection('bookmarked_epics').insertOne(bookmarkedEpic);
    console.log(`Bookmarked epic ${epic.id}: ${epic.name}`);

    res.json({ message: 'Epic bookmarked successfully', epic: bookmarkedEpic });
  } catch (error) {
    console.error('Error adding epic bookmark:', error);
    res.status(500).json({ error: 'Failed to add epic bookmark' });
  }
});

// Remove an epic bookmark
app.delete('/api/epics/bookmarks/:epicId', async (req, res) => {
  try {
    const { epicId } = req.params;

    const result = await db.collection('bookmarked_epics').deleteOne({ id: parseInt(epicId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Epic bookmark not found' });
    }

    console.log(`Removed epic bookmark for epic ${epicId}`);
    res.json({ message: 'Epic bookmark removed successfully' });
  } catch (error) {
    console.error('Error removing epic bookmark:', error);
    res.status(500).json({ error: 'Failed to remove epic bookmark' });
  }
});

// ===== AI REPORT GENERATION ENDPOINTS =====

// Helper function: Calculate overall metrics from stories
function calculateMetrics(stories: any[]) {
  const completedStates = ['Merged to Main', 'Completed / In Prod', 'Duplicate / Unneeded', 'Needs Verification', 'In Review'];
  const inMotionStates = ['In Development'];

  const total = stories.length;
  const completed = stories.filter(s => completedStates.includes(s.workflow_state?.name || '')).length;
  const inMotion = stories.filter(s => inMotionStates.includes(s.workflow_state?.name || '')).length;
  const notStarted = total - completed - inMotion;

  return {
    total_stories: total,
    completed_count: completed,
    in_motion_count: inMotion,
    not_started_count: notStarted,
    completed_percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    in_motion_percentage: total > 0 ? Math.round((inMotion / total) * 100) : 0,
    not_started_percentage: total > 0 ? Math.round((notStarted / total) * 100) : 0
  };
}

// Team priority order (matches frontend logic)
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

// Helper: Get team priority index
function getTeamPriorityIndex(teamName: string): number {
  const index = TEAM_PRIORITY_ORDER.findIndex(priorityTeam =>
    teamName.toLowerCase().includes(priorityTeam.toLowerCase())
  );
  return index === -1 ? 999 : index;
}

// Helper: Get person's team from their list of teams using priority order
function getPersonTeam(memberTeams: string[]): string | null {
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
}

// Helper: Get story team (matches frontend getStoryTeam logic)
function getStoryTeam(
  story: any,
  memberToTeamsMap: Map<string, string[]>,
  groupIdToNameMap: Map<string, string>
): string {
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
}

// Helper function: Calculate team-level metrics
function calculateTeamMetrics(
  stories: any[],
  memberToTeamsMap: Map<string, string[]>,
  groupIdToNameMap: Map<string, string>
) {
  // Group stories by team using the same logic as frontend
  const storiesByTeam: { [teamName: string]: any[] } = {};

  stories.forEach(story => {
    const teamName = getStoryTeam(story, memberToTeamsMap, groupIdToNameMap);

    if (!storiesByTeam[teamName]) storiesByTeam[teamName] = [];
    storiesByTeam[teamName].push(story);
  });

  // Calculate metrics per team
  return Object.entries(storiesByTeam).map(([teamName, teamStories]) => {
    const metrics = calculateMetrics(teamStories);

    // Status breakdown
    const statusBreakdown: { [status: string]: number } = {};
    teamStories.forEach(story => {
      const status = story.workflow_state?.name || 'Unknown';
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
    });

    return {
      team_name: teamName,
      ...metrics,
      status_breakdown: statusBreakdown
    };
  });
}

// Helper function to send SSE progress update
function sendProgress(res: express.Response, stage: string, teamName?: string, current?: number, total?: number): void {
  const progress = {
    stage,
    teamName,
    current,
    total,
    timestamp: new Date().toISOString()
  };
  res.write(`data: ${JSON.stringify(progress)}\n\n`);
}

// Helper function to generate a report for a single team
async function generateTeamReport(
  teamName: string,
  teamStories: any[],
  config: any,
  openaiKey: string
): Promise<string> {
  // Group stories by status for summary
  const byStatus: { [status: string]: number } = {};
  teamStories.forEach((story: any) => {
    byStatus[story.status] = (byStatus[story.status] || 0) + 1;
  });

  const teamContextData = {
    team: teamName,
    storyCount: teamStories.length,
    statusBreakdown: byStatus,
    stories: teamStories.map((s: any) => ({
      name: s.name,
      description: s.description || '',
      status: s.status,
      owner: s.owner,
      labels: s.labels
    }))
  };

  const teamPrompt = `Generate a detailed report for the ${teamName} team for the current iteration. Analyze the stories below and provide deep insights into:\n- WHAT the team actually accomplished (based on completed story names and descriptions)\n- WHAT was left incomplete and why it matters\n- Key themes and patterns in the work\n- Strategic implications and insights\n\nTeam data:\n${JSON.stringify(teamContextData, null, 2)}`;

  const openaiResponse = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: teamPrompt }
      ],
      max_tokens: config.maxTokens,
      temperature: 0.7,
    },
    {
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return openaiResponse.data.choices[0].message.content;
}

// Generate AI report for an iteration
app.post('/api/report/generate', async (req, res) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const { iterationId, stories, openaiKey, selectedTeams } = req.body;

    console.log(`Generating AI report for iteration ${iterationId}`);

    if (!openaiKey) {
      sendProgress(res, 'error', undefined, undefined, undefined);
      res.write(`data: ${JSON.stringify({ error: 'OpenAI API key is required' })}\n\n`);
      res.end();
      return;
    }

    if (!stories || stories.length === 0) {
      sendProgress(res, 'error', undefined, undefined, undefined);
      res.write(`data: ${JSON.stringify({ error: 'No stories provided' })}\n\n`);
      res.end();
      return;
    }

    if (!selectedTeams || !Array.isArray(selectedTeams) || selectedTeams.length === 0) {
      sendProgress(res, 'error', undefined, undefined, undefined);
      res.write(`data: ${JSON.stringify({ error: 'At least one team must be selected' })}\n\n`);
      res.end();
      return;
    }

    sendProgress(res, 'preparing');

    // Load the system prompt from config
    const fs = await import('fs');
    const configPath = path.join(__dirname, '../report-prompt-config.json');
    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);

    // Fetch groups (teams) to enrich the data
    const groupsResponse = await axios.get(`${SHORTCUT_API_BASE}/groups`, {
      headers: shortcutHeaders,
    });
    const allGroups = groupsResponse.data;

    // Filter to only the teams we care about for priority logic (matches frontend)
    const groups = allGroups.filter((group: any) =>
      TEAM_PRIORITY_ORDER.includes(group.name)
    );

    console.log('Filtered to priority teams:', groups.map((g: any) => g.name));

    // Fetch members to get owner information
    const membersResponse = await axios.get(`${SHORTCUT_API_BASE}/members`, {
      headers: shortcutHeaders,
    });
    const members = membersResponse.data;

    // Create maps for quick lookup
    const memberMap = new Map(members.map((m: any) => [m.id, m]));

    // Build memberToTeamsMap and groupIdToNameMap (matches frontend logic)
    const memberToTeamsMap = new Map<string, string[]>();
    const groupIdToNameMap = new Map<string, string>();

    groups.forEach((group: any) => {
      // Build groupId to name map
      groupIdToNameMap.set(group.id, group.name);

      // Build member to teams map
      if (group.member_ids && group.member_ids.length > 0) {
        group.member_ids.forEach((memberId: string) => {
          if (!memberToTeamsMap.has(memberId)) {
            memberToTeamsMap.set(memberId, []);
          }
          memberToTeamsMap.get(memberId)!.push(group.name);
        });
      }
    });

    // Organize stories by team using the correct getStoryTeam logic
    const storiesByTeam: { [teamName: string]: any[] } = {};

    stories.forEach((story: any) => {
      const teamName = getStoryTeam(story, memberToTeamsMap, groupIdToNameMap);

      // Get owner information for display
      const owner = story.owner_ids && story.owner_ids.length > 0
        ? memberMap.get(story.owner_ids[0])
        : null;

      if (!storiesByTeam[teamName]) {
        storiesByTeam[teamName] = [];
      }

      const ownerName = owner && (owner as any).profile ? `${(owner as any).profile.name}` : 'Unassigned';

      storiesByTeam[teamName].push({
        id: story.id,
        name: story.name,
        description: story.description || '',
        status: story.workflow_state?.name || 'Unknown',
        owner: ownerName,
        labels: story.labels?.map((l: any) => l.name).slice(0, 5) || [], // Limit labels to 5
      });
    });

    // Filter to only selected teams
    const selectedTeamsSet = new Set(selectedTeams);
    console.log(`Generating reports for selected teams: ${selectedTeams.join(', ')}`);

    // Generate report for each team
    const teamReports: { team: string; report: string }[] = [];
    const selectedTeamNames = selectedTeams.filter(teamName => storiesByTeam[teamName] && storiesByTeam[teamName].length > 0);

    sendProgress(res, 'generating_teams', undefined, 0, selectedTeamNames.length);

    for (let i = 0; i < selectedTeamNames.length; i++) {
      const teamName = selectedTeamNames[i];
      const teamStories = storiesByTeam[teamName];

      if (!teamStories || teamStories.length === 0) {
        console.log(`Skipping ${teamName} - no stories`);
        continue;
      }

      sendProgress(res, 'generating_team', teamName, i + 1, selectedTeamNames.length);
      console.log(`Generating report for team: ${teamName} (${i + 1}/${selectedTeamNames.length})`);

      try {
        const teamReport = await generateTeamReport(teamName, teamStories, config, openaiKey);
        teamReports.push({ team: teamName, report: teamReport });
        console.log(`✅ Report generated for ${teamName}`);
      } catch (error: any) {
        console.error(`Error generating report for ${teamName}:`, error.response?.data || error.message);
        // Continue with other teams even if one fails
        teamReports.push({
          team: teamName,
          report: `Error generating report for ${teamName}: ${error.response?.data?.error?.message || error.message}`
        });
      }
    }

    // Generate executive summary from all team reports
    sendProgress(res, 'generating_summary');
    console.log('Generating executive summary from team reports...');

    const summaryPrompt = `Generate an executive summary report for the current iteration based on the following team reports. IMPORTANT: Keep the summary to exactly 300 words or less.\n\nFocus on:\n\n1. Key Accomplishments: Highlight the most important achievements and deliverables that were successfully shipped across all teams\n2. What Couldn't Be Shipped: Clearly identify what was left incomplete, why it matters, and any blockers or dependencies\n3. Overall iteration summary and key outcomes\n4. Cross-team themes and patterns (if relevant)\n\nTeam Reports:\n${teamReports.map(tr => `\n## ${tr.team}\n\n${tr.report}`).join('\n\n---\n\n')}\n\nGenerate a concise executive summary (300 words maximum) that emphasizes key accomplishments and what couldn't be shipped.`;

    const summaryResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.model,
        messages: [
          { role: 'system', content: 'You are an executive iteration report generator. Synthesize team reports into a concise executive summary. Always stay within the word limit specified.' },
          { role: 'user', content: summaryPrompt }
        ],
        max_tokens: 400, // ~300 words limit (approximately 1.3 tokens per word)
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const executiveSummary = summaryResponse.data.choices[0].message.content;

    // Combine executive summary with team reports
    const fullReport = `# Executive Summary\n\n${executiveSummary}\n\n---\n\n# Team Reports\n\n${teamReports.map(tr => `## ${tr.team}\n\n${tr.report}`).join('\n\n---\n\n')}`;

    console.log('AI report generated successfully');

    sendProgress(res, 'calculating');

    // Calculate metrics for storage
    const overallMetrics = calculateMetrics(stories);
    const teamMetrics = calculateTeamMetrics(stories, memberToTeamsMap, groupIdToNameMap);

    sendProgress(res, 'storing');

    // Get iteration name
    const iterationResponse = await axios.get(
      `${SHORTCUT_API_BASE}/iterations/${iterationId}`,
      { headers: shortcutHeaders }
    );
    const iterationName = iterationResponse.data.name;

    // Build and store report document in MongoDB
    const reportDoc = {
      iteration_id: iterationId,
      iteration_name: iterationName,
      report_content: fullReport,
      metrics: overallMetrics,
      team_metrics: teamMetrics,
      category_metrics: null,
      velocity_data: null,
      generated_at: new Date(),
      model: config.model,
      version: 1
    };

    // Insert new report (keeps all historical reports)
    await db.collection('iteration_reports').insertOne(reportDoc);

    console.log(`✅ Report stored in MongoDB for iteration ${iterationId} (${new Date().toISOString()})`);

    sendProgress(res, 'complete');

    // Send final result
    res.write(`data: ${JSON.stringify({
      report: fullReport,
      metrics: overallMetrics,
      team_metrics: teamMetrics,
      generated_at: reportDoc.generated_at
    })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('Error generating AI report:', error.response?.data || error.message);
    sendProgress(res, 'error');
    res.write(`data: ${JSON.stringify({
      error: 'Failed to generate AI report',
      details: error.response?.data?.error?.message || error.message
    })}\n\n`);
    res.end();
  }
});

// Get latest report for an iteration
app.get('/api/report/:iterationId', async (req, res) => {
  try {
    const iterationId = parseInt(req.params.iterationId);

    // Get the latest report (sort by generated_at descending, limit 1)
    const reports = await db.collection('iteration_reports')
      .find({ iteration_id: iterationId })
      .sort({ generated_at: -1 })
      .limit(1)
      .toArray();

    if (!reports || reports.length === 0) {
      return res.status(404).json({
        error: 'No report found for this iteration'
      });
    }

    const report = reports[0];

    res.json({
      iteration_id: report.iteration_id,
      iteration_name: report.iteration_name,
      report_content: report.report_content,
      metrics: report.metrics,
      team_metrics: report.team_metrics,
      generated_at: report.generated_at
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// Get report history for an iteration
app.get('/api/report/:iterationId/history', async (req, res) => {
  try {
    const iterationId = parseInt(req.params.iterationId);
    const limit = parseInt(req.query.limit as string) || 10;

    const reports = await db.collection('iteration_reports')
      .find({ iteration_id: iterationId })
      .sort({ generated_at: -1 })
      .limit(limit)
      .toArray();

    res.json({
      iteration_id: iterationId,
      reports: reports.map(r => ({
        report_content: r.report_content,
        metrics: r.metrics,
        team_metrics: r.team_metrics,
        generated_at: r.generated_at
      })),
      total_count: reports.length
    });
  } catch (error) {
    console.error('Error fetching report history:', error);
    res.status(500).json({ error: 'Failed to fetch report history' });
  }
});

// Get iteration details (including URL)
app.get('/api/iterations/:iterationId', async (req, res) => {
  try {
    const { iterationId } = req.params;
    const response = await axios.get(`${SHORTCUT_API_BASE}/iterations/${iterationId}`, {
      headers: shortcutHeaders,
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching iteration:', error);
    res.status(500).json({ error: 'Failed to fetch iteration' });
  }
});

// Serve static files from dist directory in production (AFTER API routes)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));

  // Serve index.html for all other routes (client-side routing)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Startup function
async function startServer() {
  console.log('🚀 Starting server...');
  console.log('📍 Environment:', process.env.NODE_ENV || 'development');
  console.log('📂 __dirname:', __dirname);
  console.log('📂 dist path:', path.join(__dirname, '../dist'));

  await connectToMongoDB();

  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log('🔍 API routes registered:');
    console.log('   GET /api/health');
    console.log('   GET /api/epics');
    console.log('   GET /api/iterations');
    console.log('   GET /api/bookmarks');
    console.log('   ... and more');
  });
}

// Initialize server
console.log('📝 Registering routes...');
startServer();
