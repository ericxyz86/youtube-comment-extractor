# Migration Guide: From Gemini AI to Real API with Backend

This guide documents the complete migration process for the Reddit Comment Extractor app from Gemini AI to Reddit's official API with an Express.js backend. Use this as a reference to migrate similar applications (e.g., YouTube Comment Extractor).

## Table of Contents
1. [Phase 1: Gemini to OpenAI Migration](#phase-1-gemini-to-openai-migration)
2. [Phase 2: OpenAI to Real API Migration](#phase-2-openai-to-real-api-migration)
3. [Phase 3: Backend Server Setup](#phase-3-backend-server-setup)
4. [Phase 4: Frontend Integration](#phase-4-frontend-integration)
5. [Phase 5: Testing and Validation](#phase-5-testing-and-validation)

---

## Phase 1: Gemini to OpenAI Migration

### Problem
Gemini API has a rate limit of 15 requests per minute on the free tier, causing `HTTP 429: RESOURCE_EXHAUSTED` errors.

### Solution
Migrate to OpenAI GPT-4o-mini with 10,000 requests per minute on the free tier.

### Step 1.1: Update Dependencies

**File: `package.json`**

Remove Gemini dependency:
```json
"dependencies": {
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "@google/genai": "^1.28.0"  // REMOVE THIS
}
```

Add OpenAI dependency:
```json
"dependencies": {
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "openai": "^4.75.0"  // ADD THIS
}
```

Run:
```bash
npm install
```

### Step 1.2: Update Environment Variables

**File: `.env.local`**

Before:
```
GEMINI_API_KEY=your_gemini_key_here
```

After:
```
OPENAI_API_KEY=your_openai_key_here
```

### Step 1.3: Update Vite Configuration

**File: `vite.config.ts`**

Before:
```typescript
define: {
  'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
}
```

After:
```typescript
define: {
  'process.env.API_KEY': JSON.stringify(env.OPENAI_API_KEY),
  'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY)
}
```

### Step 1.4: Remove Gemini CDN Import

**File: `index.html`**

Remove from the `importmap`:
```json
"@google/genai": "https://aistudiocdn.com/@google/genai@^1.28.0"
```

### Step 1.5: Create OpenAI Service

**File: `services/openaiService.ts` (NEW FILE)**

```typescript
import OpenAI from "openai";
import type { Filters, Comment } from "../types";

const openai = new OpenAI({
  apiKey: process.env.API_KEY,
  dangerouslyAllowBrowser: true,
});

// Define schema for structured output
const commentSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    author: { type: "string" },
    subreddit: { type: "string" },
    comment: { type: "string" },
    upvotes: { type: "number" },
    timestamp: { type: "string" },
  },
  required: ["id", "author", "subreddit", "comment", "upvotes", "timestamp"],
  additionalProperties: false,
};

// Retry with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRetryable = error?.status === 429 || error?.status === 503 || error?.status === 500;
      if (!isRetryable || attempt === maxRetries - 1) throw error;
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(`Retry attempt ${attempt + 1} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

// Request caching (5-minute TTL)
interface CacheEntry {
  data: any;
  timestamp: number;
}

const requestCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(filters: Filters, iteration: number): string {
  return JSON.stringify({ filters, iteration });
}

function getCachedResult(key: string): any | null {
  const entry = requestCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  requestCache.delete(key);
  return null;
}

function setCachedResult(key: string, data: any): void {
  requestCache.set(key, { data, timestamp: Date.now() });
}

export const extractComments = async (
  filters: Filters,
  onProgress: (comments: Comment[]) => void
): Promise<Comment[]> => {
  const allComments: Comment[] = [];
  const seenCommentIds = new Set<string>();
  const MAX_ITERATIONS = 25;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`Iteration ${i + 1}/${MAX_ITERATIONS}...`);

    // Check cache
    const cacheKey = getCacheKey(filters, i);
    const cachedResult = getCachedResult(cacheKey);

    if (cachedResult) {
      console.log("Using cached result");
      const newComments = cachedResult.filter(
        (c: Comment) => !seenCommentIds.has(c.id)
      );

      if (newComments.length === 0) break;

      newComments.forEach((c: Comment) => {
        seenCommentIds.add(c.id);
        allComments.push(c);
      });

      onProgress([...allComments]);
      continue;
    }

    // Build prompt
    const prompt = `Extract Reddit comments from the following subreddits: ${filters.subreddits.join(", ")}
Date range: ${filters.startDate} to ${filters.endDate}
Keywords: ${filters.keywords || "all comments"}

Boolean operators: AND, OR, NOT (and parentheses for grouping)
Comma-separated words are treated as OR.

Return ONLY comments that match ALL criteria.
Return an empty array if no new comments found.

Already extracted comment IDs (do not return these): ${Array.from(seenCommentIds).join(", ")}

Return results as JSON array.`;

    try {
      const response = await retryWithBackoff(async () => {
        return await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "comments",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  comments: {
                    type: "array",
                    items: commentSchema,
                  },
                },
                required: ["comments"],
                additionalProperties: false,
              },
            },
          },
        });
      });

      const content = response.choices[0]?.message?.content;
      if (!content) break;

      const parsed = JSON.parse(content);
      const comments: Comment[] = parsed.comments || [];

      // Cache result
      setCachedResult(cacheKey, comments);

      if (comments.length === 0) {
        console.log("No more comments found. Stopping.");
        break;
      }

      // Deduplicate
      const newComments = comments.filter((c) => !seenCommentIds.has(c.id));

      if (newComments.length === 0) {
        console.log("No new unique comments found. Stopping.");
        break;
      }

      newComments.forEach((c) => {
        seenCommentIds.add(c.id);
        allComments.push(c);
      });

      console.log(`Added ${newComments.length} new comments (total: ${allComments.length})`);
      onProgress([...allComments]);

    } catch (error) {
      console.error("Error in iteration:", error);
      throw error;
    }
  }

  return allComments;
};
```

### Step 1.6: Update App Component

**File: `App.tsx`**

Change the import:
```typescript
// Before
import { extractComments } from './services/geminiService';

// After
import { extractComments } from './services/openaiService';
```

### Step 1.7: Update Documentation

**Files: `CLAUDE.md`, `README.md`**

Replace all references to "Gemini" with "OpenAI" and update API key instructions.

---

## Phase 2: OpenAI to Real API Migration

### Problem
OpenAI generates fake/AI-generated comments instead of real data. Need to fetch actual comments from the platform's API.

### Solution
Replace OpenAI service with direct API integration (Reddit API in this case).

### Step 2.1: Understand API Requirements

**For Reddit:**
- Public JSON API: `https://www.reddit.com/r/[subreddit]/search.json`
- Comments endpoint: `https://www.reddit.com/r/[subreddit]/comments/[post_id].json`
- Rate limit: 10 req/min (unauthenticated), 60 req/min (OAuth)
- CORS issue: Browser requests blocked by Reddit

**For YouTube (your use case):**
- YouTube Data API v3: `https://www.googleapis.com/youtube/v3/`
- Comments endpoint: `commentThreads` and `comments`
- Rate limit: 10,000 quota units per day
- Requires API key (no CORS issue with proper setup)

### Step 2.2: Initial CORS Proxy Approach (Optional)

If CORS is blocking direct browser requests, use a CORS proxy temporarily:

**File: `services/redditApiService.ts` (or `youtubeApiService.ts`)**

```typescript
import type { Filters, Comment } from "../types";

// CORS proxy to bypass restrictions (temporary solution)
const CORS_PROXY = "https://corsproxy.io/?";

async function fetchWithProxy(url: string): Promise<Response> {
  const proxiedUrl = CORS_PROXY + encodeURIComponent(url);
  const response = await fetch(proxiedUrl, {
    headers: {
      'Accept': 'application/json',
    }
  });
  return response;
}

// Rest of implementation...
```

**Note:** CORS proxy has limitations (rate limits, reliability). This is a temporary solution before implementing a backend.

### Step 2.3: Implement API Data Fetching

**File: `services/redditApiService.ts`**

```typescript
import type { Filters, Comment } from "../types";

const CORS_PROXY = "https://corsproxy.io/?";

async function fetchWithProxy(url: string): Promise<Response> {
  const proxiedUrl = CORS_PROXY + encodeURIComponent(url);
  const response = await fetch(proxiedUrl, {
    headers: {
      'Accept': 'application/json',
    }
  });
  return response;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Parse boolean keyword expression
function matchesKeywords(text: string, keywords: string): boolean {
  if (!keywords || keywords.trim() === "") return true;

  const lowerText = text.toLowerCase();
  const lowerKeywords = keywords.toLowerCase();

  try {
    // Simple boolean parser - converts to JavaScript expression
    let expression = lowerKeywords
      .replace(/\bAND\b/gi, "&&")
      .replace(/\bOR\b/gi, "||")
      .replace(/\bNOT\b/gi, "!")
      // Handle comma as OR
      .split(",")
      .map((part) => part.trim())
      .join(" || ");

    // Replace keywords with boolean checks
    expression = expression.replace(/([a-zA-Z0-9_]+)/g, (match) => {
      if (["&&", "||", "!"].includes(match)) return match;
      return `lowerText.includes("${match.toLowerCase()}")`;
    });

    return eval(expression);
  } catch (error) {
    // Fallback to simple OR matching if parsing fails
    const terms = keywords
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((t) => t.length > 0);
    return terms.some((term) => lowerText.includes(term));
  }
}

// Extract comments from API response
function extractCommentsFromTree(
  commentData: any,
  postData: any,
  filters: Filters
): Comment[] {
  const comments: Comment[] = [];

  function traverse(item: any, subreddit: string) {
    if (!item || item.kind !== "t1") return; // t1 = comment

    const data = item.data;
    if (!data || !data.body) return;

    // Check if comment matches date range
    const commentDate = new Date(data.created_utc * 1000);
    const startDate = new Date(filters.startDate);
    const endDate = new Date(filters.endDate);
    endDate.setHours(23, 59, 59, 999); // Include end date

    if (commentDate >= startDate && commentDate <= endDate) {
      // Check if comment matches keywords
      if (matchesKeywords(data.body, filters.keywords)) {
        comments.push({
          id: data.id,
          author: data.author,
          subreddit: subreddit,
          comment: data.body,
          upvotes: data.ups || 0,
          timestamp: commentDate.toISOString().split("T")[0],
        });
      }
    }

    // Recursively process replies
    if (data.replies && data.replies.data && data.replies.data.children) {
      data.replies.data.children.forEach((reply: any) =>
        traverse(reply, subreddit)
      );
    }
  }

  // Process all top-level comments
  if (commentData && commentData.data && commentData.data.children) {
    const subreddit = postData.data.children[0]?.data.subreddit || "";
    commentData.data.children.forEach((item: any) =>
      traverse(item, subreddit)
    );
  }

  return comments;
}

export const extractComments = async (
  filters: Filters,
  onProgress: (comments: Comment[]) => void
): Promise<Comment[]> => {
  const allComments: Comment[] = [];
  const seenCommentIds = new Set<string>();
  const MAX_POSTS_PER_SUBREDDIT = 25;

  try {
    for (const subreddit of filters.subreddits) {
      console.log(`Searching r/${subreddit}...`);

      // Search for posts matching keywords
      const searchQuery = filters.keywords || "*";
      const searchUrl = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(
        searchQuery
      )}&restrict_sr=on&sort=new&limit=100`;

      let response = await fetchWithProxy(searchUrl);

      if (!response.ok) {
        console.error(`Failed to search r/${subreddit}: ${response.status}`);
        continue;
      }

      const searchData = await response.json();
      const posts = searchData.data?.children || [];

      console.log(`Found ${posts.length} posts in r/${subreddit}`);

      let postsProcessed = 0;
      for (const post of posts) {
        if (postsProcessed >= MAX_POSTS_PER_SUBREDDIT) break;

        const postData = post.data;
        if (!postData || !postData.id) continue;

        // Check if post is within date range
        const postDate = new Date(postData.created_utc * 1000);
        const startDate = new Date(filters.startDate);
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);

        if (postDate < startDate || postDate > endDate) continue;

        console.log(`Fetching comments from post: ${postData.title.substring(0, 50)}...`);

        // Fetch comments for this post
        const commentsUrl = `https://www.reddit.com/r/${subreddit}/comments/${postData.id}.json`;

        await delay(1000); // Rate limiting: 1 request per second

        response = await fetchWithProxy(commentsUrl);

        if (!response.ok) {
          console.error(
            `Failed to fetch comments for post ${postData.id}: ${response.status}`
          );
          continue;
        }

        const postWithComments = await response.json();

        // Extract comments from the response
        if (Array.isArray(postWithComments) && postWithComments.length >= 2) {
          const comments = extractCommentsFromTree(
            postWithComments[1],
            postWithComments[0],
            filters
          );

          // Add unique comments
          let newCommentsAdded = 0;
          for (const comment of comments) {
            if (!seenCommentIds.has(comment.id)) {
              seenCommentIds.add(comment.id);
              allComments.push(comment);
              newCommentsAdded++;
            }
          }

          if (newCommentsAdded > 0) {
            console.log(`Added ${newCommentsAdded} new comments`);
            onProgress([...allComments]);
          }
        }

        postsProcessed++;
      }

      console.log(`Completed r/${subreddit}: ${allComments.length} total comments`);
    }

    return allComments;
  } catch (error) {
    console.error("Error extracting comments:", error);
    throw new Error(`Failed to fetch comments: ${error}`);
  }
};
```

### Step 2.4: Update App Component

**File: `App.tsx`**

```typescript
// Change import
import { extractComments } from './services/redditApiService';

// Update default filters with realistic dates
const [filters, setFilters] = useState<Filters>({
  subreddits: ['phcars', 'CarsPH', 'Gulong', 'Philippines'],
  startDate: '2025-01-01',  // Current year
  endDate: '2025-11-03',    // Today
  keywords: 'byd OR kia',
});
```

---

## Phase 3: Backend Server Setup

### Problem
- CORS proxy has rate limits and reliability issues
- Need proper OAuth authentication for higher rate limits (60 req/min)
- API credentials should be stored server-side, not in browser

### Solution
Create an Express.js backend server to handle API authentication and proxy requests.

### Step 3.1: Create Server Directory Structure

```bash
mkdir server
```

### Step 3.2: Update Package.json

**File: `package.json`**

Add backend dependencies and scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "server": "node server/server.js",
    "server:dev": "nodemon server/server.js"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.2",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.0",
    "nodemon": "^3.0.2"
  }
}
```

Run:
```bash
npm install
```

### Step 3.3: Create Backend Server

**File: `server/server.js`**

```javascript
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// API credentials (Reddit example)
const CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const USERNAME = process.env.REDDIT_USERNAME;
const PASSWORD = process.env.REDDIT_PASSWORD;

// Token cache
let accessToken = null;
let tokenExpiry = null;

// Get OAuth access token
async function getAccessToken() {
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    const response = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      new URLSearchParams({
        grant_type: 'password',
        username: USERNAME,
        password: PASSWORD,
      }),
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'YourAppName/1.0',
        },
      }
    );

    accessToken = response.data.access_token;
    // Token expires in 1 hour, refresh 5 minutes early
    tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;

    console.log('✓ Successfully authenticated with API');
    return accessToken;
  } catch (error) {
    console.error('OAuth error:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with API');
  }
}

// Helper function to make authenticated API requests
async function apiRequest(url) {
  const token = await getAccessToken();

  const response = await axios.get(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'YourAppName/1.0',
    },
  });

  return response.data;
}

// API endpoint to search posts
app.post('/api/reddit/search', async (req, res) => {
  try {
    const { subreddit, query, limit = 100 } = req.body;

    if (!subreddit) {
      return res.status(400).json({ error: 'Subreddit is required' });
    }

    const searchUrl = `https://oauth.reddit.com/r/${subreddit}/search?q=${encodeURIComponent(
      query || '*'
    )}&restrict_sr=on&sort=new&limit=${limit}`;

    const data = await apiRequest(searchUrl);
    res.json(data);
  } catch (error) {
    console.error('Search error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// API endpoint to get comments from a post
app.get('/api/reddit/comments/:subreddit/:postId', async (req, res) => {
  try {
    const { subreddit, postId } = req.params;

    const commentsUrl = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}`;
    const data = await apiRequest(commentsUrl);

    res.json(data);
  } catch (error) {
    console.error('Comments error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Backend Server`);
  console.log(`   Running on: http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);

  // Validate environment variables
  if (!CLIENT_ID || !CLIENT_SECRET || !USERNAME || !PASSWORD) {
    console.warn('⚠️  WARNING: Missing API credentials in .env file');
  }
});
```

### Step 3.4: Create Environment File

**File: `server/.env`**

```bash
# Reddit API Credentials (example)
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
REDDIT_USERNAME=your_username_here
REDDIT_PASSWORD=your_password_here

# For YouTube API (your use case)
# YOUTUBE_API_KEY=your_youtube_api_key_here

# Server configuration
PORT=3002
```

### Step 3.5: Create .gitignore for Server

**File: `server/.gitignore`**

```
# Environment variables (contains API credentials)
.env

# Node modules
node_modules/

# Logs
*.log
npm-debug.log*

# OS files
.DS_Store
```

---

## Phase 4: Frontend Integration

### Step 4.1: Update API Service to Use Backend

**File: `services/redditApiService.ts`**

Replace CORS proxy approach with backend API calls:

```typescript
import type { Filters, Comment } from "../types";

// Backend API URL
const BACKEND_URL = "http://localhost:3002";

// Helper function to search posts via backend
async function searchPosts(subreddit: string, query: string, limit: number = 100): Promise<any> {
  const response = await fetch(`${BACKEND_URL}/api/reddit/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subreddit, query, limit }),
  });

  if (!response.ok) {
    throw new Error(`Failed to search r/${subreddit}: ${response.status}`);
  }

  return response.json();
}

// Helper function to fetch comments via backend
async function fetchComments(subreddit: string, postId: string): Promise<any> {
  const response = await fetch(`${BACKEND_URL}/api/reddit/comments/${subreddit}/${postId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch comments for post ${postId}: ${response.status}`);
  }

  return response.json();
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// [Keep all the existing helper functions: matchesKeywords, extractCommentsFromTree]

export const extractComments = async (
  filters: Filters,
  onProgress: (comments: Comment[]) => void
): Promise<Comment[]> => {
  const allComments: Comment[] = [];
  const seenCommentIds = new Set<string>();
  const MAX_POSTS_PER_SUBREDDIT = 25;

  try {
    for (const subreddit of filters.subreddits) {
      console.log(`Searching r/${subreddit}...`);

      const searchQuery = filters.keywords || "*";

      // Use backend API instead of CORS proxy
      let searchData;
      try {
        searchData = await searchPosts(subreddit, searchQuery, 100);
      } catch (error) {
        console.error(`Failed to search r/${subreddit}:`, error);
        continue;
      }

      const posts = searchData.data?.children || [];
      console.log(`Found ${posts.length} posts in r/${subreddit}`);

      let postsProcessed = 0;
      for (const post of posts) {
        if (postsProcessed >= MAX_POSTS_PER_SUBREDDIT) break;

        const postData = post.data;
        if (!postData || !postData.id) continue;

        // Check date range
        const postDate = new Date(postData.created_utc * 1000);
        const startDate = new Date(filters.startDate);
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);

        if (postDate < startDate || postDate > endDate) continue;

        console.log(`Fetching comments from post: ${postData.title.substring(0, 50)}...`);

        await delay(1000); // Rate limiting

        // Use backend API instead of CORS proxy
        let postWithComments;
        try {
          postWithComments = await fetchComments(subreddit, postData.id);
        } catch (error) {
          console.error(`Failed to fetch comments for post ${postData.id}:`, error);
          continue;
        }

        // Extract and deduplicate comments
        if (Array.isArray(postWithComments) && postWithComments.length >= 2) {
          const comments = extractCommentsFromTree(
            postWithComments[1],
            postWithComments[0],
            filters
          );

          for (const comment of comments) {
            if (!seenCommentIds.has(comment.id)) {
              seenCommentIds.add(comment.id);
              allComments.push(comment);
            }
          }

          onProgress([...allComments]);
        }

        postsProcessed++;
      }

      console.log(`Completed r/${subreddit}: ${allComments.length} total comments`);
    }

    return allComments;
  } catch (error) {
    console.error("Error extracting comments:", error);
    throw new Error(`Failed to fetch comments: ${error}`);
  }
};
```

---

## Phase 5: Testing and Validation

### Step 5.1: Start Backend Server

```bash
npm run server
```

Expected output:
```
🚀 Backend Server
   Running on: http://localhost:3002
   Health check: http://localhost:3002/health

✓ Successfully authenticated with API
```

### Step 5.2: Start Frontend

In a new terminal:
```bash
npm run dev
```

Expected output:
```
VITE v6.4.1  ready in 462 ms

➜  Local:   http://localhost:3001/
```

### Step 5.3: Test Health Endpoint

```bash
curl http://localhost:3002/health
```

Expected response:
```json
{"status":"ok","message":"Backend server is running"}
```

### Step 5.4: Test Full Flow

1. Open browser to `http://localhost:3001`
2. Configure filters (subreddits, dates, keywords)
3. Click "Extract Comments"
4. Watch console logs in both terminals
5. Verify real comments appear in the table
6. Download as Excel to verify data

### Step 5.5: Monitor for Issues

**Common Issues:**

1. **Backend not loading credentials**
   - Solution: Ensure `dotenv.config()` uses correct path
   ```javascript
   dotenv.config({ path: path.join(__dirname, '.env') });
   ```

2. **CORS errors**
   - Solution: Ensure `app.use(cors())` is in server.js

3. **Authentication failures**
   - Solution: Verify credentials in `server/.env`
   - Check API console for error details

4. **Rate limiting**
   - Solution: Increase delay between requests
   - Check API rate limits documentation

---

## Adapting for YouTube Comment Extractor

### Key Differences for YouTube API

1. **No OAuth password flow needed** - YouTube API uses simple API key
2. **No CORS issues** - YouTube API supports browser requests with API key
3. **Different data structure** - YouTube returns different JSON format
4. **Quota system** - YouTube uses quota units instead of rate limits

### YouTube Backend Server Modifications

**File: `server/server.js` (YouTube version)**

```javascript
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Search for videos
app.post('/api/youtube/search', async (req, res) => {
  try {
    const { query, maxResults = 50 } = req.body;

    const response = await axios.get(`${YOUTUBE_API_BASE}/search`, {
      params: {
        key: YOUTUBE_API_KEY,
        q: query,
        part: 'snippet',
        type: 'video',
        maxResults: maxResults,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Search error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// Get comments for a video
app.get('/api/youtube/comments/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { maxResults = 100 } = req.query;

    const response = await axios.get(`${YOUTUBE_API_BASE}/commentThreads`, {
      params: {
        key: YOUTUBE_API_KEY,
        videoId: videoId,
        part: 'snippet',
        maxResults: maxResults,
        order: 'relevance',
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Comments error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'YouTube API backend is running' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 YouTube API Backend Server`);
  console.log(`   Running on: http://localhost:${PORT}\n`);

  if (!YOUTUBE_API_KEY) {
    console.warn('⚠️  WARNING: Missing YOUTUBE_API_KEY in .env file');
  }
});
```

**File: `server/.env` (YouTube version)**

```bash
# YouTube API Key
YOUTUBE_API_KEY=your_youtube_api_key_here

# Server configuration
PORT=3002
```

### YouTube Frontend Service

**File: `services/youtubeApiService.ts`**

```typescript
import type { Filters, Comment } from "../types";

const BACKEND_URL = "http://localhost:3002";

async function searchVideos(query: string, maxResults: number = 50): Promise<any> {
  const response = await fetch(`${BACKEND_URL}/api/youtube/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, maxResults }),
  });

  if (!response.ok) {
    throw new Error(`Failed to search videos: ${response.status}`);
  }

  return response.json();
}

async function fetchComments(videoId: string, maxResults: number = 100): Promise<any> {
  const response = await fetch(
    `${BACKEND_URL}/api/youtube/comments/${videoId}?maxResults=${maxResults}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch comments: ${response.status}`);
  }

  return response.json();
}

function matchesKeywords(text: string, keywords: string): boolean {
  // Same implementation as Reddit version
  // [Copy from Reddit service]
}

export const extractComments = async (
  filters: Filters,
  onProgress: (comments: Comment[]) => void
): Promise<Comment[]> => {
  const allComments: Comment[] = [];
  const seenCommentIds = new Set<string>();

  try {
    console.log(`Searching YouTube for: ${filters.keywords}...`);

    // Search for videos
    const searchData = await searchVideos(filters.keywords, 50);
    const videos = searchData.items || [];

    console.log(`Found ${videos.length} videos`);

    for (const video of videos) {
      const videoId = video.id.videoId;
      const videoTitle = video.snippet.title;

      console.log(`Fetching comments from: ${videoTitle.substring(0, 50)}...`);

      try {
        const commentsData = await fetchComments(videoId, 100);
        const commentThreads = commentsData.items || [];

        for (const thread of commentThreads) {
          const comment = thread.snippet.topLevelComment.snippet;
          const publishedAt = new Date(comment.publishedAt);

          // Check date range
          const startDate = new Date(filters.startDate);
          const endDate = new Date(filters.endDate);
          endDate.setHours(23, 59, 59, 999);

          if (publishedAt < startDate || publishedAt > endDate) continue;

          // Check keywords
          if (!matchesKeywords(comment.textDisplay, filters.keywords)) continue;

          const commentId = thread.id;
          if (seenCommentIds.has(commentId)) continue;

          seenCommentIds.add(commentId);
          allComments.push({
            id: commentId,
            author: comment.authorDisplayName,
            subreddit: videoTitle, // Use video title as "subreddit" equivalent
            comment: comment.textDisplay,
            upvotes: comment.likeCount || 0,
            timestamp: publishedAt.toISOString().split("T")[0],
          });
        }

        onProgress([...allComments]);
      } catch (error) {
        console.error(`Failed to fetch comments for video ${videoId}:`, error);
        continue;
      }

      // Rate limiting (10,000 quota units/day)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allComments;
  } catch (error) {
    console.error("Error extracting comments:", error);
    throw new Error(`Failed to fetch comments: ${error}`);
  }
};
```

---

## Summary Checklist

### Phase 1: Gemini to OpenAI
- [ ] Update package.json dependencies
- [ ] Update .env.local with OpenAI API key
- [ ] Update vite.config.ts
- [ ] Remove Gemini CDN from index.html
- [ ] Create openaiService.ts with retry logic and caching
- [ ] Update App.tsx import
- [ ] Update documentation

### Phase 2: OpenAI to Real API
- [ ] Research target API (endpoints, authentication, rate limits)
- [ ] Create API service file (redditApiService.ts or youtubeApiService.ts)
- [ ] Implement data fetching logic
- [ ] Implement filtering (keywords, dates)
- [ ] Handle API response structure
- [ ] Update App.tsx to use new service

### Phase 3: Backend Server
- [ ] Create server directory
- [ ] Update package.json with backend dependencies
- [ ] Create server.js with Express app
- [ ] Implement OAuth or API key authentication
- [ ] Create API proxy endpoints
- [ ] Create server/.env for credentials
- [ ] Create server/.gitignore

### Phase 4: Frontend Integration
- [ ] Update API service to call backend instead of direct API
- [ ] Update BACKEND_URL constant
- [ ] Test connection to backend
- [ ] Verify data flow

### Phase 5: Testing
- [ ] Start backend server
- [ ] Start frontend dev server
- [ ] Test health endpoint
- [ ] Test full extraction flow
- [ ] Verify data accuracy
- [ ] Test error handling
- [ ] Document any issues

---

## Additional Resources

### Getting API Credentials

**Reddit:**
1. Go to https://www.reddit.com/prefs/apps
2. Click "Create App" or "Create Another App"
3. Select "script" type
4. Fill in name and redirect URI
5. Copy Client ID and Secret

**YouTube:**
1. Go to https://console.cloud.google.com
2. Create a new project
3. Enable YouTube Data API v3
4. Create credentials (API Key)
5. Copy API key

### Rate Limits

**Reddit:**
- Unauthenticated: 10 requests/minute
- OAuth: 60 requests/minute
- Quota: None

**YouTube:**
- API Key: 10,000 quota units/day
- Search: 100 units per request
- Comments: 1 unit per request

### Troubleshooting

**Issue: Backend not loading .env**
```javascript
// Solution: Use explicit path
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });
```

**Issue: CORS errors**
```javascript
// Solution: Ensure CORS middleware is enabled
import cors from 'cors';
app.use(cors());
```

**Issue: Frontend can't connect to backend**
- Ensure backend is running on port 3002
- Check BACKEND_URL in frontend service
- Verify no firewall blocking localhost

---

## Notes

- Keep credentials secure in `.env` files
- Never commit `.env` files to version control
- Use `.gitignore` to protect sensitive files
- Monitor API usage to avoid rate limits
- Implement proper error handling
- Add logging for debugging
- Test with small datasets first
- Consider implementing request caching
- Document any API-specific quirks

---

**End of Migration Guide**

Generated: November 3, 2025
