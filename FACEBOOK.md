# Facebook Comment Extractor - Implementation Guide

This guide documents how to build a Facebook Comment Extractor app similar to the YouTube Comment Extractor. The app will extract real comments from Facebook Pages and Groups, filtered by date range.

## Table of Contents
1. [Overview](#overview)
2. [Facebook Graph API Setup](#facebook-graph-api-setup)
3. [Authentication & Permissions](#authentication--permissions)
4. [Architecture](#architecture)
5. [Backend Implementation](#backend-implementation)
6. [Frontend Implementation](#frontend-implementation)
7. [Important Limitations](#important-limitations)
8. [Testing & Deployment](#testing--deployment)

---

## Overview

### Key Differences from YouTube API

| Feature | YouTube API | Facebook Graph API |
|---------|-------------|-------------------|
| **Authentication** | Simple API key | OAuth 2.0 with user access tokens |
| **Permissions** | Public data only | Requires user/page permissions |
| **Public Access** | Any public video | Limited to pages/groups user has access to |
| **Rate Limits** | 10,000 quota/day | 200 calls/hour (varies by app tier) |
| **Comment Access** | All public comments | Only if user has permission |
| **Privacy** | Public videos accessible | Privacy restrictions apply |

### What You Can Extract

**Facebook Pages (Public & Managed):**
- ✅ Posts from pages you manage (with page access token)
- ✅ Comments on those posts
- ✅ Public page posts (limited without page token)

**Facebook Groups:**
- ✅ Posts from groups you're a member of
- ✅ Comments on group posts
- ❌ Cannot access private groups you're not a member of

---

## Facebook Graph API Setup

### Step 1: Create a Facebook App

1. **Go to Facebook Developers:**
   https://developers.facebook.com

2. **Create an App:**
   - Click "My Apps" → "Create App"
   - Select "Business" or "Consumer" type
   - Fill in app name and contact email
   - Click "Create App"

3. **Get App Credentials:**
   - Navigate to Settings → Basic
   - Copy **App ID** and **App Secret**

### Step 2: Configure App Permissions

1. **Add Products:**
   - From dashboard, click "Add Product"
   - Add "Facebook Login"

2. **Configure Facebook Login:**
   - Settings → Valid OAuth Redirect URIs:
     ```
     http://localhost:3002/auth/facebook/callback
     ```

3. **Request Permissions:**

   For **Pages**:
   - `pages_show_list` - See list of pages
   - `pages_read_engagement` - Read posts and comments
   - `pages_manage_metadata` - Manage pages

   For **Groups**:
   - `groups_access_member_info` - Access group member info
   - `publish_to_groups` - Read group content

### Step 3: Get Access Tokens

**User Access Token** (Short-lived):
- Go to Graph API Explorer: https://developers.facebook.com/tools/explorer
- Select your app
- Add permissions listed above
- Click "Generate Access Token"

**Page Access Token** (Long-lived):
- Get User Access Token first
- Exchange it for a Page Access Token (see backend code)

**Long-lived Access Token** (60 days):
- Exchange short-lived token for long-lived (see backend code)

---

## Authentication & Permissions

### OAuth Flow

The Facebook API requires OAuth 2.0 authentication:

```javascript
// OAuth URL to redirect user
const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?
  client_id=${APP_ID}
  &redirect_uri=${REDIRECT_URI}
  &scope=pages_read_engagement,pages_show_list,groups_access_member_info
  &response_type=code`;

// User clicks "Login with Facebook"
// Facebook redirects back with code
// Exchange code for access token
```

### Token Types

1. **User Access Token:**
   - Short-lived (1-2 hours)
   - Can be exchanged for long-lived (60 days)
   - Used to access user's pages/groups

2. **Page Access Token:**
   - Long-lived (60 days or never expires)
   - Best for accessing page data
   - Must be obtained from User Access Token

3. **App Access Token:**
   - For server-to-server calls
   - Limited functionality
   - Not suitable for comment extraction

---

## Architecture

### System Overview

```
┌─────────────────┐
│   React App     │
│  (Port 3003)    │
└────────┬────────┘
         │
         │ HTTP Requests
         ▼
┌─────────────────┐
│  Express.js     │
│  Backend Server │
│  (Port 3002)    │
└────────┬────────┘
         │
         │ Facebook Graph API
         │ with Access Tokens
         ▼
┌─────────────────┐
│  Facebook       │
│  Graph API      │
│  v18.0          │
└─────────────────┘
```

### Data Flow

1. **User Authentication:**
   - User clicks "Login with Facebook"
   - OAuth flow → Obtain access token
   - Store token in backend session/database

2. **Page/Group Selection:**
   - Frontend requests user's pages/groups
   - Backend fetches from Graph API
   - User selects which page/group to extract from

3. **Comment Extraction:**
   - User specifies date range
   - Backend fetches posts within date range
   - For each post, fetch all comments (with pagination)
   - Filter by date and keywords
   - Return to frontend progressively

4. **Export:**
   - Download as Excel with comment metadata

---

## Backend Implementation

### Directory Structure

```
server/
├── server.js              # Main Express server
├── facebook-auth.js       # OAuth authentication
├── facebook-api.js        # Graph API interactions
└── .env                   # Environment variables
```

### Environment Variables

**File: `server/.env`**

```bash
# Facebook App Credentials
FACEBOOK_APP_ID=your_app_id_here
FACEBOOK_APP_SECRET=your_app_secret_here

# OAuth Redirect URI
FACEBOOK_REDIRECT_URI=http://localhost:3002/auth/facebook/callback

# Session Secret
SESSION_SECRET=your_random_session_secret

# Server Configuration
PORT=3002
```

### Main Server

**File: `server/server.js`**

```javascript
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: 'http://localhost:3003',
  credentials: true
}));
app.use(express.json());

// Session middleware for storing access tokens
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

const APP_ID = process.env.FACEBOOK_APP_ID;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI;
const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

// OAuth: Generate login URL
app.get('/api/facebook/auth-url', (req, res) => {
  const scopes = [
    'pages_read_engagement',
    'pages_show_list',
    'pages_manage_metadata',
    'groups_access_member_info'
  ].join(',');

  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
    `client_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${scopes}` +
    `&response_type=code`;

  res.json({ authUrl });
});

// OAuth: Callback handler
app.get('/auth/facebook/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect('http://localhost:3003?error=auth_failed');
  }

  try {
    // Exchange code for access token
    const tokenUrl = `${GRAPH_API_BASE}/oauth/access_token?` +
      `client_id=${APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&client_secret=${APP_SECRET}` +
      `&code=${code}`;

    const response = await fetch(tokenUrl);
    const data = await response.json();

    if (data.access_token) {
      // Exchange short-lived token for long-lived token
      const longLivedUrl = `${GRAPH_API_BASE}/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${APP_ID}` +
        `&client_secret=${APP_SECRET}` +
        `&fb_exchange_token=${data.access_token}`;

      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json();

      // Store in session
      req.session.accessToken = longLivedData.access_token;

      res.redirect('http://localhost:3003?auth=success');
    } else {
      res.redirect('http://localhost:3003?error=token_failed');
    }
  } catch (error) {
    console.error('OAuth error:', error);
    res.redirect('http://localhost:3003?error=server_error');
  }
});

// Check authentication status
app.get('/api/facebook/auth-status', (req, res) => {
  res.json({
    authenticated: !!req.session.accessToken,
    hasToken: !!req.session.accessToken
  });
});

// Logout
app.post('/api/facebook/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get user's pages
app.get('/api/facebook/pages', async (req, res) => {
  const accessToken = req.session.accessToken;

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const response = await fetch(
      `${GRAPH_API_BASE}/me/accounts?access_token=${accessToken}`
    );
    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching pages:', error);
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

// Get user's groups
app.get('/api/facebook/groups', async (req, res) => {
  const accessToken = req.session.accessToken;

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const response = await fetch(
      `${GRAPH_API_BASE}/me/groups?access_token=${accessToken}`
    );
    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get page posts
app.post('/api/facebook/page-posts', async (req, res) => {
  const { pageId, pageAccessToken, startDate, endDate } = req.body;
  const accessToken = pageAccessToken || req.session.accessToken;

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const since = Math.floor(new Date(startDate).getTime() / 1000);
    const until = Math.floor(new Date(endDate).getTime() / 1000);

    const response = await fetch(
      `${GRAPH_API_BASE}/${pageId}/posts?` +
      `fields=id,message,created_time,permalink_url` +
      `&since=${since}` +
      `&until=${until}` +
      `&limit=100` +
      `&access_token=${accessToken}`
    );

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get post comments
app.post('/api/facebook/post-comments', async (req, res) => {
  const { postId, accessToken: reqAccessToken, pageToken } = req.body;
  const accessToken = reqAccessToken || pageToken || req.session.accessToken;

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const response = await fetch(
      `${GRAPH_API_BASE}/${postId}/comments?` +
      `fields=id,from,message,created_time,like_count` +
      `&limit=100` +
      `&access_token=${accessToken}`
    );

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Facebook API backend is running',
    hasAppId: !!APP_ID,
    hasAppSecret: !!APP_SECRET
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Facebook API Backend Server`);
  console.log(`   Running on: http://localhost:${PORT}\n`);

  if (!APP_ID || !APP_SECRET) {
    console.warn('⚠️  WARNING: Missing Facebook credentials in .env file');
  } else {
    console.log('✓ Facebook app credentials loaded');
  }
});
```

---

## Frontend Implementation

### Types

**File: `types.ts`**

```typescript
export interface FacebookComment {
  id: string;
  author: string;
  authorId: string;
  text: string;
  postId: string;
  postUrl: string;
  postMessage: string;
  createdTime: string;
  likeCount: number;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
}

export interface FacebookGroup {
  id: string;
  name: string;
  privacy: string;
}

export interface FacebookFilters {
  sourceType: 'page' | 'group';
  sourceId: string;
  sourceName: string;
  pageAccessToken?: string;
  startDate: string;
  endDate: string;
  keywords?: string;
}
```

### Facebook API Service

**File: `services/facebookApiService.ts`**

```typescript
import type { FacebookComment, FacebookFilters } from '../types';

const BACKEND_URL = "http://localhost:3002";

// Check authentication status
export async function checkAuthStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/facebook/auth-status`, {
      credentials: 'include'
    });
    const data = await response.json();
    return data.authenticated;
  } catch (error) {
    console.error('Auth check error:', error);
    return false;
  }
}

// Get Facebook login URL
export async function getAuthUrl(): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/api/facebook/auth-url`);
  const data = await response.json();
  return data.authUrl;
}

// Logout
export async function logout(): Promise<void> {
  await fetch(`${BACKEND_URL}/api/facebook/logout`, {
    method: 'POST',
    credentials: 'include'
  });
}

// Get user's pages
export async function getUserPages(): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/facebook/pages`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch pages');
  }

  const data = await response.json();
  return data.data || [];
}

// Get user's groups
export async function getUserGroups(): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/facebook/groups`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch groups');
  }

  const data = await response.json();
  return data.data || [];
}

// Fetch page posts
async function fetchPagePosts(
  pageId: string,
  pageAccessToken: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/facebook/page-posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      pageId,
      pageAccessToken,
      startDate,
      endDate
    })
  });

  if (!response.ok) {
    throw new Error('Failed to fetch posts');
  }

  const data = await response.json();
  return data.data || [];
}

// Fetch post comments
async function fetchPostComments(
  postId: string,
  pageAccessToken?: string
): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/facebook/post-comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      postId,
      pageToken: pageAccessToken
    })
  });

  if (!response.ok) {
    throw new Error('Failed to fetch comments');
  }

  const data = await response.json();
  return data.data || [];
}

// Match keywords
function matchesKeywords(text: string, keywords: string): boolean {
  if (!keywords || keywords.trim() === "") return true;

  const lowerText = text.toLowerCase();
  const terms = keywords.toLowerCase().split(',').map(t => t.trim());
  return terms.some(term => lowerText.includes(term));
}

// Main extraction function
export const extractCommentsFromFacebook = async (
  filters: FacebookFilters,
  onProgress?: (comments: FacebookComment[]) => void,
  abortSignal?: AbortSignal
): Promise<FacebookComment[]> => {
  const allComments: FacebookComment[] = [];
  const seenCommentIds = new Set<string>();

  if (abortSignal?.aborted) {
    throw new Error('Extraction cancelled');
  }

  try {
    console.log(`Fetching posts from ${filters.sourceName}...`);

    // Fetch posts
    const posts = await fetchPagePosts(
      filters.sourceId,
      filters.pageAccessToken || '',
      filters.startDate,
      filters.endDate
    );

    console.log(`Found ${posts.length} posts`);

    for (const post of posts) {
      if (abortSignal?.aborted) {
        throw new Error('Extraction cancelled');
      }

      console.log(`Fetching comments from post: ${post.id}`);

      try {
        const comments = await fetchPostComments(
          post.id,
          filters.pageAccessToken
        );

        for (const comment of comments) {
          const createdTime = new Date(comment.created_time);
          const startDate = new Date(filters.startDate);
          const endDate = new Date(filters.endDate);
          endDate.setHours(23, 59, 59, 999);

          // Filter by date
          if (createdTime < startDate || createdTime > endDate) continue;

          // Filter by keywords
          if (filters.keywords && !matchesKeywords(comment.message, filters.keywords)) {
            continue;
          }

          if (seenCommentIds.has(comment.id)) continue;

          seenCommentIds.add(comment.id);
          allComments.push({
            id: comment.id,
            author: comment.from.name,
            authorId: comment.from.id,
            text: comment.message,
            postId: post.id,
            postUrl: post.permalink_url,
            postMessage: post.message || '',
            createdTime: createdTime.toISOString().split('T')[0],
            likeCount: comment.like_count || 0
          });
        }

        if (onProgress) {
          onProgress([...allComments]);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`Error fetching comments for post ${post.id}:`, error);
      }
    }

    return allComments;
  } catch (error) {
    console.error('Error extracting comments:', error);
    throw error;
  }
};
```

---

## Important Limitations

### 1. **Authentication Complexity**

Unlike YouTube's simple API key, Facebook requires:
- OAuth 2.0 flow with user login
- Token management (short-lived vs long-lived)
- Periodic re-authentication (tokens expire)
- Different tokens for pages vs user data

### 2. **Privacy Restrictions**

- Cannot access private pages/groups without membership
- Cannot access competitor pages' comment details
- User must have admin/moderator access for full data
- Some data requires app review and approval

### 3. **Rate Limits**

- Standard apps: ~200 calls/hour
- Must implement smart pagination
- Need to handle rate limit errors gracefully
- Consider upgrading to business app for higher limits

### 4. **API Limitations**

- Cannot get all historical comments (limited by date range)
- Nested comment replies require separate API calls
- Some fields require additional permissions
- API versions deprecate regularly (currently v18.0)

### 5. **App Review Process**

For production use, Facebook requires:
- App review for advanced permissions
- Privacy policy URL
- Terms of service
- Detailed use case explanation
- Screen recordings of app functionality

---

## Testing & Deployment

### Local Testing

1. **Start servers:**
   ```bash
   # Terminal 1
   npm run server

   # Terminal 2
   npm run dev
   ```

2. **Test OAuth flow:**
   - Click "Login with Facebook"
   - Authorize app
   - Check token stored in session

3. **Test extraction:**
   - Select a page you manage
   - Set date range
   - Extract comments
   - Verify data accuracy

### Production Considerations

1. **Environment Variables:**
   ```bash
   # Production .env
   FACEBOOK_APP_ID=production_app_id
   FACEBOOK_APP_SECRET=production_secret
   FACEBOOK_REDIRECT_URI=https://yourdomain.com/auth/callback
   SESSION_SECRET=strong_random_secret
   NODE_ENV=production
   ```

2. **Security:**
   - Use HTTPS in production
   - Set `cookie: { secure: true }` for sessions
   - Store tokens in encrypted database (not sessions)
   - Implement CSRF protection
   - Add rate limiting to endpoints

3. **Database for Token Storage:**
   ```javascript
   // Instead of sessions, use database
   import { MongoClient } from 'mongodb';

   // Store user tokens
   await db.collection('users').updateOne(
     { userId },
     { $set: { accessToken, expiresAt } }
   );
   ```

4. **Error Handling:**
   - Handle expired tokens gracefully
   - Implement token refresh logic
   - Show user-friendly error messages
   - Log errors for debugging

---

## Example Frontend Component

**File: `FacebookApp.tsx`**

```typescript
import React, { useState, useEffect } from 'react';
import {
  checkAuthStatus,
  getAuthUrl,
  getUserPages,
  extractCommentsFromFacebook
} from './services/facebookApiService';
import type { FacebookComment, FacebookPage } from './types';

const FacebookApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<FacebookPage | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [comments, setComments] = useState<FacebookComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const authed = await checkAuthStatus();
    setIsAuthenticated(authed);
    if (authed) {
      loadPages();
    }
  };

  const handleLogin = async () => {
    const url = await getAuthUrl();
    window.location.href = url;
  };

  const loadPages = async () => {
    const userPages = await getUserPages();
    setPages(userPages);
  };

  const handleExtract = async () => {
    if (!selectedPage) return;

    setIsLoading(true);
    setComments([]);

    try {
      const extracted = await extractCommentsFromFacebook({
        sourceType: 'page',
        sourceId: selectedPage.id,
        sourceName: selectedPage.name,
        pageAccessToken: selectedPage.access_token,
        startDate,
        endDate
      }, (progressComments) => {
        setComments(progressComments);
      });

      setComments(extracted);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div>
        <h1>Facebook Comment Extractor</h1>
        <button onClick={handleLogin}>Login with Facebook</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Facebook Comment Extractor</h1>

      <div>
        <label>Select Page:</label>
        <select onChange={(e) => {
          const page = pages.find(p => p.id === e.target.value);
          setSelectedPage(page || null);
        }}>
          <option value="">-- Select a page --</option>
          {pages.map(page => (
            <option key={page.id} value={page.id}>{page.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label>Start Date:</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>

      <div>
        <label>End Date:</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      <button onClick={handleExtract} disabled={isLoading}>
        {isLoading ? 'Extracting...' : 'Extract Comments'}
      </button>

      <div>
        <h2>Comments ({comments.length})</h2>
        {comments.map(comment => (
          <div key={comment.id}>
            <strong>{comment.author}</strong>: {comment.text}
            <br />
            <small>{comment.createdTime} • {comment.likeCount} likes</small>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FacebookApp;
```

---

## Summary

### Pros of Facebook API
- ✅ Access to owned pages/groups
- ✅ Rich comment metadata (likes, author info)
- ✅ Structured Graph API
- ✅ Official API with support

### Cons of Facebook API
- ❌ Complex OAuth authentication
- ❌ Limited to accessible content only
- ❌ Requires app review for production
- ❌ Stricter rate limits
- ❌ Privacy restrictions

### Recommendation

**For Personal/Internal Use:**
- Use the OAuth flow described above
- Extract from pages/groups you manage
- Keep it in development mode

**For Public/Commercial Use:**
- Submit for Facebook App Review
- Prepare privacy policy and terms
- Implement robust token management
- Consider legal implications of data collection

### Alternative Approaches

1. **Official Facebook Page Plugin:**
   - Limited to embedding on websites
   - No bulk export capability

2. **Manual Export:**
   - Facebook's Download Your Information
   - Not automated, limited formats

3. **Third-party Tools:**
   - CrowdTangle (owned by Meta)
   - Requires approval and justification

---

**Last Updated:** November 2025
**Graph API Version:** v18.0
**Status:** Development Mode Only
