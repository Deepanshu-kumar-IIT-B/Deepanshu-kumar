
export interface SolutionStep {
  title: string;
  content: string;
}

export interface SolutionResult {
  extractedText: string;
  explanation: {
    summary: string;
    steps: SolutionStep[];
    finalAnswer: string;
    tips: string[];
  };
  videos: YouTubeVideo[];
}

export interface SavedSolution extends SolutionResult {
  id: string;
  timestamp: number;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
}

export interface User {
  name: string;
  email: string;
  phone: string;
  classLevel: string;
  exam: string;
  password?: string;
}

export enum AppStep {
  LANDING = 'LANDING',
  SIGN_UP = 'SIGN_UP',
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  OCR_EDIT = 'OCR_EDIT',
  RESULTS = 'RESULTS'
}
