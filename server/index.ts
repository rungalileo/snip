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
app.use(express.json());

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
