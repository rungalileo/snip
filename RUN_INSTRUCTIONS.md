# SNIP App - Terminal Run Instructions

## Prerequisites

1. **Node.js** (v18 or higher recommended)
   - Check if installed: `node --version`
   - Install from: https://nodejs.org/

2. **npm** (comes with Node.js)
   - Check if installed: `npm --version`

3. **MongoDB** (optional, for bookmark features)
   - Local MongoDB: Install from https://www.mongodb.com/try/download/community
   - OR use MongoDB Atlas (cloud): https://www.mongodb.com/cloud/atlas
   - OR use Docker: `docker-compose up -d` (runs MongoDB on port 27017)

4. **Shortcut API Token**
   - Get from: https://app.shortcut.com/settings/account/api-tokens

## Setup Steps

### 1. Navigate to Project Directory

```bash
cd /Users/stonse/projects/GitHub/snip
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Required: Shortcut API Token
SHORTCUT_TOKEN=your_shortcut_api_token_here

# Optional: MongoDB Configuration
# For local MongoDB (default):
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=snip

# OR for MongoDB Atlas (remote):
# MONGO_USER=your_mongo_username
# MONGO_PASS=your_mongo_password
# MONGO_CLUSTER=your_cluster.mongodb.net
# MONGO_DB_NAME=snip

# Optional: Server Port (default: 3001)
# PORT=3001
```

**Example `.env` file:**
```bash
SHORTCUT_TOKEN=abc123xyz789
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=snip
```

### 4. Start MongoDB (if using local MongoDB)

**Option A: Using Docker Compose**
```bash
docker-compose up -d
```

**Option B: Using MongoDB installed locally**
```bash
# macOS (using Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
# Start MongoDB service from Services panel
```

**Note:** If you're using MongoDB Atlas, skip this step.

## Running the Application

### Development Mode (Recommended)

Runs both frontend and backend with hot-reload:

```bash
npm run dev
```

This will start:
- **Frontend**: http://localhost:3000 (Vite dev server)
- **Backend**: http://localhost:3001 (Express API server)

Open your browser to: **http://localhost:3000**

### Development Mode (Separate Terminals)

If you prefer to run frontend and backend separately:

**Terminal 1 - Backend:**
```bash
npm run dev:server
```

**Terminal 2 - Frontend:**
```bash
npm run dev:client
```

### Production Mode

1. **Build the frontend:**
```bash
npm run build
```

2. **Start the production server:**
```bash
npm start
```

Or use the combined command:
```bash
npm run build-and-start
```

The app will be available at: **http://localhost:3001**

## Available Scripts

- `npm run dev` - Run both frontend and backend in development mode
- `npm run dev:client` - Run only the frontend (port 3000)
- `npm run dev:server` - Run only the backend (port 3001)
- `npm run build` - Build frontend for production
- `npm run preview` - Preview production build
- `npm start` - Start production server
- `npm run build-and-start` - Build and start in one command

## Troubleshooting

### Port Already in Use

If port 3000 or 3001 is already in use:

**For frontend (port 3000):**
- Edit `vite.config.ts` and change the `server.port` value

**For backend (port 3001):**
- Set `PORT=3002` (or another port) in your `.env` file
- Update `vite.config.ts` proxy target to match

### MongoDB Connection Issues

- **Local MongoDB**: Ensure MongoDB is running (`docker-compose up -d` or start MongoDB service)
- **MongoDB Atlas**: Verify your connection string and credentials
- The app will continue to run without MongoDB, but bookmark features won't work

### Missing SHORTCUT_TOKEN

The server will exit with an error if `SHORTCUT_TOKEN` is not set. Make sure your `.env` file exists and contains the token.

### Module Not Found Errors

If you see module errors, try:
```bash
rm -rf node_modules package-lock.json
npm install
```

## Stopping the Application

- Press `Ctrl+C` in the terminal where the app is running
- If using Docker for MongoDB: `docker-compose down`

## Health Check

Once running, you can verify the backend is working:
```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "env": "development"
}
```

