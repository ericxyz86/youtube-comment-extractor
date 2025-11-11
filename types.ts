export interface Comment {
  id: string;
  author: string;
  text: string;
  videoUrl: string;
  videoTitle: string;
  publishedAt: string;
  likeCount: number;
}

export interface VideoFilters {
  videoUrls: string[];
  startDate: string;
  endDate: string;
  keywords?: string;
}
