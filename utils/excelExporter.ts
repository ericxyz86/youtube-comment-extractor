
import { Comment } from '../types';

declare const XLSX: any;

// Sanitize cell values to prevent formula injection attacks
function sanitizeForExcel(value: any): any {
  if (typeof value !== 'string') {
    return value;
  }

  // Check if the value starts with dangerous characters
  // =, +, -, @, \t (tab), \r (carriage return)
  const dangerousChars = /^[=+\-@\t\r]/;

  if (dangerousChars.test(value)) {
    // Prepend single quote to neutralize potential formulas
    return "'" + value;
  }

  return value;
}

// Sanitize all comment fields
function sanitizeComment(comment: Comment): any {
  return {
    id: sanitizeForExcel(comment.id),
    author: sanitizeForExcel(comment.author),
    text: sanitizeForExcel(comment.text),
    videoUrl: sanitizeForExcel(comment.videoUrl),
    videoTitle: sanitizeForExcel(comment.videoTitle),
    publishedAt: sanitizeForExcel(comment.publishedAt),
    likeCount: comment.likeCount // Numbers are safe
  };
}

export const exportToExcel = (comments: Comment[], fileName: string): void => {
  if (typeof XLSX === 'undefined') {
    console.error('XLSX library is not loaded. Make sure the script tag is in your HTML.');
    alert('Could not download Excel file. The required library is missing.');
    return;
  }

  // Sanitize all comments before export
  const sanitizedComments = comments.map(sanitizeComment);

  const worksheet = XLSX.utils.json_to_sheet(sanitizedComments);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Comments');

  // Set column widths
  const columnWidths = [
    { wch: 15 }, // ID
    { wch: 20 }, // Author
    { wch: 80 }, // Text
    { wch: 40 }, // Video URL
    { wch: 40 }, // Video Title
    { wch: 12 }, // Published At
    { wch: 10 }, // Like Count
  ];
  worksheet['!cols'] = columnWidths;

  XLSX.writeFile(workbook, `${fileName}.xlsx`);
};
