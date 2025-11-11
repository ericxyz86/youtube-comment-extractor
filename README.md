# YouTube Comment Extractor

A secure React + TypeScript + Express.js application that extracts real comments from YouTube videos using the YouTube Data API v3. Filter by date range and keywords, then export to Excel.

## Features

- 🔐 **Security Hardened**: No eval(), CORS protection, rate limiting, input validation, formula injection protection
- 📊 **Excel Export**: Download comments with all metadata
- 🔍 **Advanced Filtering**: Date ranges and boolean keyword search (AND, OR, NOT)
- ⚡ **Progressive Loading**: Real-time comment updates as they're fetched
- 🎯 **API Proxy**: Backend protects your API key

## Security Features

- ✅ Safe keyword parsing (no code execution)
- ✅ CORS restricted to specific origins
- ✅ Rate limiting (100 req/15min)
- ✅ Excel formula injection protection
- ✅ Strict input validation
- ✅ Sanitized error messages
- ✅ No dependency vulnerabilities

## Local Development

### Prerequisites

- Node.js 16+
- YouTube Data API v3 key from [Google Cloud Console](https://console.cloud.google.com)

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd youtube-comment-extractor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Frontend (`.env.local`):
   ```bash
   YOUTUBE_API_KEY=your_youtube_api_key_here
   ```

   Backend (`server/.env`):
   ```bash
   YOUTUBE_API_KEY=your_youtube_api_key_here
   PORT=3002
   ```

4. **Start the backend** (Terminal 1)
   ```bash
   npm run server
   ```

5. **Start the frontend** (Terminal 2)
   ```bash
   npm run dev
   ```

6. **Open your browser**
   ```
   http://localhost:3003
   ```

## Production Deployment

### Backend (Render Web Service)

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `node server/server.js`
   - **Environment Variables**:
     - `YOUTUBE_API_KEY`: Your YouTube API key
     - `PORT`: (Use Render's default)

### Frontend (Render Static Site)

1. Create a new Static Site on Render
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
   - **Environment Variables**:
     - `YOUTUBE_API_KEY`: Your YouTube API key

## Usage

1. Paste YouTube video URLs (one per line)
2. Set date range for filtering comments
3. Optionally add keywords:
   - Comma-separated: `great, awesome` (OR)
   - AND operator: `tutorial AND beginner`
   - NOT operator: `good NOT bad`
4. Click "Extract Comments"
5. Download as Excel when complete

## API Quota

- YouTube API: 10,000 units/day
- Comment page: 1 unit
- Video details: 1 unit
- ~100 videos with comments per day

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS
- **Backend**: Express.js, Node.js
- **APIs**: YouTube Data API v3
- **Export**: SheetJS (XLSX)
- **Security**: express-rate-limit, CORS, input validation

## License

MIT
