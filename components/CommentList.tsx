
import React from 'react';
import { Comment } from '../types';

interface CommentListProps {
  comments: Comment[];
}

const CommentCard: React.FC<{ comment: Comment }> = ({ comment }) => (
    <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg border border-gray-700 hover:border-blue-500 transition-colors duration-300">
        <div className="flex items-center justify-between mb-2">
            <div className="flex items-center flex-1 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm mr-3 flex-shrink-0">
                    {comment.author.charAt(0).toUpperCase()}
                </div>
                <p className="font-semibold text-gray-200 truncate">{comment.author}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400 flex-shrink-0 ml-2">
                <span>👍 {comment.likeCount}</span>
                <span>{comment.publishedAt}</span>
            </div>
        </div>
        <p className="text-gray-300 mb-3 line-clamp-4">{comment.text}</p>
        <div className="text-xs text-gray-500">
            <p className="truncate mb-1" title={comment.videoTitle}>
                Video: {comment.videoTitle}
            </p>
            <p className="truncate">
                <a href={comment.videoUrl} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">{comment.videoUrl}</a>
            </p>
        </div>
    </div>
);


const CommentList: React.FC<CommentListProps> = ({ comments }) => {
  return (
    <div className="w-full max-w-5xl mx-auto mt-8">
      <h2 className="text-2xl font-bold text-center mb-6">Extracted Comments</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {comments.map((comment, index) => (
          <CommentCard key={index} comment={comment} />
        ))}
      </div>
    </div>
  );
};

export default CommentList;
