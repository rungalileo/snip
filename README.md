# Snip

A web application for triaging Shortcut stories within epics. Built with TypeScript, React, and Express.

## Features

- **Epic Selection**: Browse epics with pagination (10 at a time)
- **Story Listing**: View all stories in an epic with title, owner, and creation date
- **Owner Filtering**:
  - Left-hand pane displays all story owners as clickable chips
  - Each chip shows the owner name and story count
  - Click on an owner chip to filter stories to just that owner
  - Story count updates to show "X of Y stories" when filtered
  - Clear filter button to show all stories again
  - Owner chips are sorted by story count (highest first)
- **Story Details Modal**:
  - View full story details including description
  - Navigate between stories using arrow buttons or keyboard shortcuts (← →)
  - Add labels to stories with one click
- **Label Management**: Quickly add predefined labels:
  - Customer Escalation (Red)
  - Bug (Orange)
  - Foundational Work (Green)
  - Product (Blue)

## Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Configure environment**:
Create a `.env` file in the root directory:
```bash
SHORTCUT_TOKEN=your_shortcut_api_token_here
```

Get your Shortcut API token from: https://app.shortcut.com/settings/account/api-tokens

3. **Run the application**:
```bash
npm run dev
```

This will start:
- Frontend server on http://localhost:3000
- Backend API server on http://localhost:3001

## Usage

1. **Select an Epic**: Choose from the paginated list of active epics
2. **View Stories**: See all stories in the epic sorted by creation date
3. **Triage Stories**: Click on a story to open the modal
4. **Add Labels**: Click colored chips to add labels to stories
5. **Navigate**: Use arrow buttons or keyboard shortcuts (← →) to move between stories
6. **Close Modal**: Click the X button, click outside the modal, or press ESC

## Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **API**: Shortcut REST API v3
- **Styling**: CSS3

## Project Structure

```
snip/
├── server/
│   └── index.ts          # Express backend server
├── src/
│   ├── components/       # React components
│   │   ├── EpicSelector.tsx
│   │   ├── StoriesList.tsx
│   │   └── StoryModal.tsx
│   ├── types.ts          # TypeScript interfaces
│   ├── api.ts            # API client functions
│   ├── App.tsx           # Main app component
│   └── main.tsx          # Entry point
├── index.html
├── package.json
└── vite.config.ts
```

## API Endpoints

- `GET /api/epics` - Get all epics
- `GET /api/epics/:epicId/stories` - Get stories for an epic
- `GET /api/stories/:storyId` - Get a specific story
- `GET /api/members/:memberId` - Get member (owner) details
- `POST /api/stories/:storyId/labels` - Add a label to a story

## Features Implementation

- **Owner Name Resolution**: The app fetches actual owner names from the Shortcut API using the `/members/:memberId` endpoint instead of just displaying owner IDs
- **Owner Name Caching**: Owner names are cached in memory to reduce API calls and improve performance
- **Async Loading**: Owner names are fetched asynchronously and displayed as they load

## Development

- `npm run dev` - Run both frontend and backend in development mode
- `npm run dev:client` - Run only the frontend
- `npm run dev:server` - Run only the backend
- `npm run build` - Build for production

## License

MIT
