import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server directory
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
// Configure CORS to only allow requests from specific origins
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from localhost during development and production frontend
    const allowedOrigins = [
      'http://localhost:3003',
      'http://localhost:5173',
      'http://127.0.0.1:3003',
      'http://127.0.0.1:5173',
      'https://youtube-comment-extractor-eqe8.onrender.com' // Production frontend
    ];

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// Rate limiting to prevent abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiter to all API routes
app.use('/api/', apiLimiter);

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Extract video ID from YouTube URL
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

// Validate video ID format
function isValidVideoId(videoId) {
  // YouTube video IDs are exactly 11 characters: alphanumeric, underscore, or hyphen
  return typeof videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

// Get video details
app.post('/api/youtube/video-details', async (req, res) => {
  try {
    const { videoId } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }

    if (!isValidVideoId(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID format' });
    }

    const response = await axios.get(`${YOUTUBE_API_BASE}/videos`, {
      params: {
        key: YOUTUBE_API_KEY,
        id: videoId,
        part: 'snippet,statistics',
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Video details error:', error.response?.data || error.message);

    // Return generic error message without exposing internal details
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: 'Failed to fetch video details'
    });
  }
});

// Get comments for a video
app.post('/api/youtube/comments', async (req, res) => {
  try {
    const { videoId, maxResults = 100, pageToken } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }

    if (!isValidVideoId(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID format' });
    }

    // Validate maxResults
    const parsedMaxResults = parseInt(maxResults, 10);
    if (isNaN(parsedMaxResults) || parsedMaxResults < 1 || parsedMaxResults > 100) {
      return res.status(400).json({ error: 'maxResults must be between 1 and 100' });
    }

    // Validate pageToken if present
    if (pageToken && (typeof pageToken !== 'string' || pageToken.length > 500)) {
      return res.status(400).json({ error: 'Invalid page token' });
    }

    const params = {
      key: YOUTUBE_API_KEY,
      videoId: videoId,
      part: 'snippet',
      maxResults: parsedMaxResults,
      order: 'time',
      textFormat: 'plainText',
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const response = await axios.get(`${YOUTUBE_API_BASE}/commentThreads`, {
      params: params,
    });

    res.json(response.data);
  } catch (error) {
    console.error('Comments error:', error.response?.data || error.message);

    // Handle specific YouTube API errors
    if (error.response?.status === 403) {
      const errorDetails = error.response.data?.error;
      if (errorDetails?.errors?.[0]?.reason === 'commentsDisabled') {
        return res.status(403).json({
          error: 'Comments are disabled for this video'
        });
      }
    }

    // Return generic error message without exposing internal details
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: 'Failed to fetch comments'
    });
  }
});

// Extract video ID from URL
app.post('/api/youtube/extract-video-id', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL type and length
    if (typeof url !== 'string' || url.length > 2000) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const videoId = extractVideoId(url);

    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL or video ID' });
    }

    res.json({ videoId });
  } catch (error) {
    console.error('Extract video ID error:', error.message);
    res.status(500).json({
      error: 'Failed to extract video ID'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'YouTube API backend is running'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 YouTube API Backend Server`);
  console.log(`   Running on: http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);

  if (!YOUTUBE_API_KEY) {
    console.warn('⚠️  WARNING: Missing YOUTUBE_API_KEY in .env file');
    console.warn('   Please create server/.env with your YouTube API key');
  } else {
    console.log('✓ YouTube API key loaded');
  }
});
