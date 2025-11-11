# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React + TypeScript + Vite application with Express.js backend that extracts **real comments** from YouTube videos using the YouTube Data API v3. The app fetches actual comments, filters them by date range and keywords, and exports results to Excel.

## Development Commands

```bash
# Install dependencies
npm install

# Run backend server (starts on http://localhost:3002)
npm run server

# Run backend server with auto-reload (development)
npm run server:dev

# Run frontend development server (starts on http://localhost:3003)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Setup

The app requires a YouTube API key:

**Frontend (.env.local):**
```bash
YOUTUBE_API_KEY=your_youtube_api_key_here
```

**Backend (server/.env):**
```bash
YOUTUBE_API_KEY=your_youtube_api_key_here
PORT=3002
```

### Getting a YouTube API Key
1. Go to https://console.cloud.google.com
2. Create a new project
3. Enable YouTube Data API v3
4. Create credentials (API Key)
5. Copy the API key to both `.env.local` and `server/.env`

## Architecture

### Core Data Flow

1. **User Input** → App.tsx collects YouTube URLs, date range, and optional keywords
2. **Video ID Extraction** → Frontend extracts video IDs from URLs
3. **Backend API Proxy** → Express server (server/server.js) makes authenticated YouTube API requests
4. **Comment Fetching** → youtubeApiService.ts fetches real comments with pagination
5. **Filtering** → Comments filtered by date range and keyword matching (supports AND/OR/NOT operators)
6. **Display** → CommentList component renders results with progressive updates
7. **Export** → excelExporter.ts exports to Excel with all comment metadata

### Key Files

**Frontend:**
- **App.tsx** - Main component with form inputs, orchestration, and progressive comment display
- **services/youtubeApiService.ts** - Handles video ID extraction, backend communication, and comment filtering
- **utils/excelExporter.ts** - Excel export using SheetJS (XLSX) loaded via CDN
- **types.ts** - Comment and VideoFilters interface definitions
- **components/CommentList.tsx** - Displays comments with author, date, likes, and video info
- **components/Loader.tsx** - Loading state UI

**Backend:**
- **server/server.js** - Express.js API proxy with YouTube API integration
- **server/.env** - YouTube API credentials (not committed to git)
- **server/.gitignore** - Protects API credentials

### Important Implementation Details

**YouTube API Integration:**
- Backend uses YouTube Data API v3 with API key authentication
- Endpoints: `/api/youtube/comments` (fetch comments), `/api/youtube/video-details` (get video metadata)
- Frontend makes requests to localhost:3002 backend which proxies to YouTube API
- Supports pagination to fetch up to 1000 comments per video (10 pages × 100 comments)
- Rate limiting: 10,000 quota units/day, ~100 units per search, 1 unit per comment request

**Comment Filtering:**
- **Date Range:** Filters comments by `publishedAt` date (inclusive)
- **Keywords:** Boolean operators (AND, OR, NOT) and comma-separated terms
  - Example: `great, awesome` → matches comments with "great" OR "awesome"
  - Example: `tutorial AND beginner` → matches comments with both terms
- Filtering happens client-side after fetching from API

**Build Configuration:**
- Vite with React plugin for frontend
- Uses importmap in index.html for React dependencies from CDN
- TailwindCSS loaded via CDN script
- XLSX library loaded via CDN (required for export functionality)
- Path alias: `@/` maps to project root (vite.config.ts:18-20)
- Backend uses ES modules (type: "module" in package.json)

**Environment Variables:**
- Frontend: Vite loads from `.env.local`, exposes as `process.env.YOUTUBE_API_KEY` (vite.config.ts:14)
- Backend: Uses dotenv to load from `server/.env` (server/server.js:12)

**Comment Data Structure:**
```typescript
interface Comment {
  id: string;           // YouTube comment ID
  author: string;       // Comment author display name
  text: string;         // Comment text (plain text)
  videoUrl: string;     // Original YouTube video URL
  videoTitle: string;   // Video title
  publishedAt: string;  // Comment date (YYYY-MM-DD format)
  likeCount: number;    // Number of likes
}
```

## Running the Application

**IMPORTANT:** Both backend and frontend must be running:

1. **Start Backend Server:**
   ```bash
   npm run server
   ```
   Should output: `🚀 YouTube API Backend Server - Running on: http://localhost:3002`

2. **Start Frontend (in separate terminal):**
   ```bash
   npm run dev
   ```
   Should output: `Local: http://localhost:3003/`

3. **Usage:**
   - Paste YouTube video URLs (one per line)
   - Set date range for filtering comments
   - Optionally add keywords for filtering
   - Click "Extract Comments"
   - Comments appear progressively as they're fetched
   - Download as Excel when complete

## Troubleshooting

**"Comments are disabled for this video":**
- Some videos have comments disabled - the app will log this and skip

**Backend connection errors:**
- Ensure backend server is running on port 3002
- Check `YOUTUBE_API_KEY` is set in `server/.env`
- Verify firewall isn't blocking localhost connections

**API quota exceeded:**
- YouTube API has 10,000 quota units/day limit
- Each comment page = 1 unit, video details = 1 unit
- Wait 24 hours for quota reset or request quota increase
