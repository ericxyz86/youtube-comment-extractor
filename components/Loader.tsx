
import React from 'react';

const Loader: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent border-solid rounded-full animate-spin"></div>
      <p className="text-lg text-gray-300">AI is extracting comments...</p>
    </div>
  );
};

export default Loader;
