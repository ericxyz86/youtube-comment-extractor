import type { Comment, VideoFilters } from '../types';

// Use production backend URL or fallback to localhost for development
const BACKEND_URL = import.meta.env.PROD
  ? "https://youtube-comment-extractor-backend.onrender.com"
  : "http://localhost:3002";

// Extract video ID from YouTube URL
function extractVideoId(url: string): string | null {
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

// Helper function to fetch video details via backend
async function fetchVideoDetails(videoId: string): Promise<any> {
  const response = await fetch(`${BACKEND_URL}/api/youtube/video-details`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ videoId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch video details: ${response.status}`);
  }

  return response.json();
}

// Helper function to fetch comments via backend
async function fetchComments(videoId: string, maxResults: number = 100, pageToken?: string): Promise<any> {
  const response = await fetch(`${BACKEND_URL}/api/youtube/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ videoId, maxResults, pageToken }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch comments: ${response.status}`);
  }

  return response.json();
}

// Safe boolean keyword expression parser (no eval)
function matchesKeywords(text: string, keywords: string): boolean {
  if (!keywords || keywords.trim() === "") return true;

  const lowerText = text.toLowerCase();
  const lowerKeywords = keywords.toLowerCase();

  try {
    // Split by comma first (comma acts as OR)
    const commaParts = lowerKeywords.split(',').map(p => p.trim()).filter(p => p);

    // If we have comma-separated parts, any part matching means success
    if (commaParts.length > 1) {
      return commaParts.some(part => evaluateExpression(lowerText, part));
    }

    // Otherwise evaluate the single expression
    return evaluateExpression(lowerText, lowerKeywords);
  } catch (error) {
    // Fallback to simple OR matching if parsing fails
    const terms = keywords
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((t) => t.length > 0);
    return terms.some((term) => lowerText.includes(term));
  }
}

// Safely evaluate a boolean expression without eval()
function evaluateExpression(text: string, expression: string): boolean {
  // Split by OR operator (case insensitive)
  const orParts = expression.split(/\s+OR\s+/i).map(p => p.trim());

  // If any OR part matches, return true
  return orParts.some(orPart => {
    // Split by AND operator (case insensitive)
    const andParts = orPart.split(/\s+AND\s+/i).map(p => p.trim());

    // All AND parts must match
    return andParts.every(andPart => {
      // Check for NOT operator
      const notMatch = andPart.match(/^\s*NOT\s+(.+)$/i);
      if (notMatch) {
        const term = notMatch[1].trim();
        return !text.includes(term);
      }

      // Simple term matching
      return text.includes(andPart.trim());
    });
  });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const extractCommentsFromVideos = async (
  urls: string[],
  startDate: string,
  endDate: string,
  keywords: string = "",
  onProgress?: (comments: Comment[]) => void,
  abortSignal?: AbortSignal
): Promise<Comment[]> => {
  const allComments: Comment[] = [];
  const seenCommentIds = new Set<string>();

  // Check if cancelled
  if (abortSignal?.aborted) {
    throw new Error('Extraction cancelled');
  }

  try {
    for (const url of urls) {
      // Check if cancelled before processing each video
      if (abortSignal?.aborted) {
        console.log('Extraction cancelled by user');
        throw new Error('Extraction cancelled');
      }

      const videoId = extractVideoId(url);

      if (!videoId) {
        console.warn(`Invalid YouTube URL: ${url}`);
        continue;
      }

      console.log(`Processing video: ${videoId}...`);

      // Get video details
      let videoDetails;
      try {
        const videoData = await fetchVideoDetails(videoId);
        if (!videoData.items || videoData.items.length === 0) {
          console.warn(`Video not found: ${videoId}`);
          continue;
        }
        videoDetails = videoData.items[0];
      } catch (error) {
        console.error(`Failed to fetch video details for ${videoId}:`, error);
        continue;
      }

      const videoTitle = videoDetails.snippet.title;
      console.log(`Fetching comments from: ${videoTitle.substring(0, 50)}...`);

      // Fetch comments with pagination
      let pageToken: string | undefined = undefined;
      let pageCount = 0;
      const MAX_PAGES = 10; // Limit to prevent excessive API usage

      do {
        // Check if cancelled before fetching each page
        if (abortSignal?.aborted) {
          console.log('Extraction cancelled by user');
          throw new Error('Extraction cancelled');
        }

        try {
          const commentsData = await fetchComments(videoId, 100, pageToken);
          const commentThreads = commentsData.items || [];

          for (const thread of commentThreads) {
            const snippet = thread.snippet.topLevelComment.snippet;
            const publishedAt = new Date(snippet.publishedAt);

            // Check date range
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            if (publishedAt < start || publishedAt > end) continue;

            // Check keywords
            if (keywords && !matchesKeywords(snippet.textDisplay, keywords)) continue;

            const commentId = thread.id;
            if (seenCommentIds.has(commentId)) continue;

            seenCommentIds.add(commentId);
            allComments.push({
              id: commentId,
              author: snippet.authorDisplayName,
              text: snippet.textDisplay,
              videoUrl: url,
              videoTitle: videoTitle,
              publishedAt: publishedAt.toISOString().split("T")[0],
              likeCount: snippet.likeCount || 0,
            });
          }

          // Update progress
          if (onProgress) {
            onProgress([...allComments]);
          }

          pageToken = commentsData.nextPageToken;
          pageCount++;

          // Rate limiting - small delay between requests
          if (pageToken && pageCount < MAX_PAGES) {
            await delay(100);
          }

        } catch (error: any) {
          if (error.message.includes('Comments are disabled')) {
            console.warn(`Comments are disabled for video: ${videoTitle}`);
            break;
          }
          console.error(`Error fetching comments for ${videoId}:`, error);
          break;
        }

      } while (pageToken && pageCount < MAX_PAGES);

      console.log(`Completed ${videoTitle}: ${allComments.length} total comments`);

      // Delay between videos to respect rate limits
      await delay(200);
    }

    return allComments;
  } catch (error) {
    console.error("Error extracting comments:", error);
    throw new Error(`Failed to fetch comments: ${error}`);
  }
};
