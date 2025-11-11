import { GoogleGenAI, Type } from "@google/genai";
import { Comment } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      author: {
        type: Type.STRING,
        description: "The username of the commenter. Should be creative and realistic.",
      },
      text: {
        type: Type.STRING,
        description: "The content of the comment. Should be plausible for a YouTube video.",
      },
      videoUrl: {
        type: Type.STRING,
        description: "The original YouTube video URL this comment belongs to.",
      },
    },
    required: ["author", "text", "videoUrl"],
  },
};

export const extractCommentsFromVideos = async (urls: string[], startDate: string, endDate: string): Promise<Comment[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }

  const prompt = `
    You are a YouTube Comment Analysis Bot. Your task is to generate realistic, sample YouTube comments for a list of video URLs.
    All comments you generate must appear as if they were posted on a random date within the specified date range (inclusive):
    Start Date: ${startDate}
    End Date: ${endDate}

    The video URLs are:
    ${urls.join('\n')}

    For each URL, generate a large and comprehensive list of sample comments, simulating the extraction of all comments from a popular video.
    Aim for a significant number of comments per video, around 25 to 50, to ensure a thorough and realistic dataset. The comments should be plausible for the type of content likely found at a generic YouTube URL.
    Vary the dates of the comments within the provided range.
    Include a mix of positive, critical, and neutral comments, as well as some questions. Create believable usernames for the authors.

    Your response MUST be a JSON array of objects, strictly following the provided schema. Do not include any other text, markdown formatting, or explanations.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const jsonText = response.text.trim();
    const comments: Comment[] = JSON.parse(jsonText);
    return comments;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to extract comments: ${error.message}`);
    }
    throw new Error("An unknown error occurred while extracting comments.");
  }
};