import React, { useState, useCallback } from 'react';
import { Comment } from './types';
import { extractCommentsFromVideos } from './services/youtubeApiService';
import { exportToExcel } from './utils/excelExporter';
import CommentList from './components/CommentList';
import Loader from './components/Loader';

const App: React.FC = () => {
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [videoUrls, setVideoUrls] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const handleExtractComments = useCallback(async () => {
    const urls = videoUrls.split('\n').map(url => url.trim()).filter(url => url);
    if (urls.length === 0 || !startDate || !endDate) {
      setError('Please provide at least one YouTube URL and select a start and end date.');
      return;
    }
     if (new Date(startDate) > new Date(endDate)) {
      setError('Start date cannot be after the end date.');
      return;
    }
    setError(null);
    setIsLoading(true);
    setComments([]);

    // Create new AbortController for this extraction
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const extracted = await extractCommentsFromVideos(
        urls,
        startDate,
        endDate,
        keywords,
        (progressComments) => {
          // Update comments as they're being fetched
          setComments(progressComments);
        },
        controller.signal
      );
      setComments(extracted);
    } catch (err: any) {
      if (err.message === 'Extraction cancelled') {
        setError('Extraction cancelled by user.');
      } else {
        setError(err.message || 'An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  }, [videoUrls, startDate, endDate, keywords]);

  const handleCancelExtraction = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  }, [abortController]);

  const handleDownloadExcel = useCallback(() => {
    if (comments.length > 0) {
      const startDateStr = startDate.replace(/-/g, '');
      const endDateStr = endDate.replace(/-/g, '');
      const fileName = startDateStr === endDateStr 
        ? `YouTubeComments_${startDateStr}` 
        : `YouTubeComments_${startDateStr}_to_${endDateStr}`;
      exportToExcel(comments, fileName);
    }
  }, [comments, startDate, endDate]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans p-4 sm:p-6 lg:p-8">
      <div 
        className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-gray-900 via-blue-900/20 to-gray-900 -z-10"
        style={{
            backgroundImage: `radial-gradient(circle at top left, rgba(55, 65, 81, 0.5), transparent 40%),
                              radial-gradient(circle at bottom right, rgba(37, 99, 235, 0.3), transparent 50%)`
        }}
      ></div>
      <div className="max-w-5xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-2">
            YouTube Comment Extractor
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Extract real comments from YouTube videos. Filter by date range and keywords, then download as Excel.
          </p>
        </header>

        <main>
          <div className="bg-gray-800/50 backdrop-blur-md p-6 rounded-2xl shadow-2xl border border-gray-700 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
              <div className="md:col-span-1">
                <label htmlFor="start-date-picker" className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
                <input
                  id="start-date-picker"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-gray-900/70 border border-gray-600 rounded-md p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
               <div className="md:col-span-1">
                <label htmlFor="end-date-picker" className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
                <input
                  id="end-date-picker"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-gray-900/70 border border-gray-600 rounded-md p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="url-input" className="block text-sm font-medium text-gray-300 mb-2">YouTube Video URLs (one per line)</label>
                <textarea
                  id="url-input"
                  rows={4}
                  value={videoUrls}
                  onChange={(e) => setVideoUrls(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=...\nhttps://www.youtube.com/watch?v=..."
                  className="w-full bg-gray-900/70 border border-gray-600 rounded-md p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-y"
                />
              </div>
            </div>
            <div className="mt-6">
              <label htmlFor="keywords-input" className="block text-sm font-medium text-gray-300 mb-2">
                Keywords (optional) - Use AND, OR, NOT operators or comma-separated terms
              </label>
              <input
                id="keywords-input"
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g., great, awesome OR amazing, tutorial AND beginner"
                className="w-full bg-gray-900/70 border border-gray-600 rounded-md p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="mt-6 flex justify-center gap-4">
              <button
                onClick={handleExtractComments}
                disabled={isLoading}
                className="w-full md:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-8 rounded-lg shadow-lg hover:shadow-blue-500/30 transform hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Extracting...' : 'Extract Comments'}
              </button>
              {isLoading && (
                <button
                  onClick={handleCancelExtraction}
                  className="w-full md:w-auto flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-8 rounded-lg shadow-lg transition-all duration-300"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-lg text-center my-4">
              <p><strong>Error:</strong> {error}</p>
            </div>
          )}

          <div className="results-section">
            {isLoading ? (
              <Loader />
            ) : comments.length > 0 ? (
              <>
                <div className="text-center mb-6">
                  <button
                    onClick={handleDownloadExcel}
                    className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg shadow-md transition-colors duration-300"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    Download as Excel
                  </button>
                </div>
                <CommentList comments={comments} />
              </>
            ) : (
              !error && (
                <div className="text-center py-10 text-gray-500">
                  <p>Comments will appear here once extracted.</p>
                </div>
              )
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;