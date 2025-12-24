
export interface SolutionResult {
  extractedText: string;
  explanation: string;
  videos: YouTubeVideo[];
}

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
}

export enum AppStep {
  DASHBOARD = 'DASHBOARD',
  CROPPING = 'CROPPING',
  OCR_EDIT = 'OCR_EDIT',
  RESULTS = 'RESULTS'
}
