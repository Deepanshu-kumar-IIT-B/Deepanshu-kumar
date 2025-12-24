
import { GoogleGenAI, Type } from "@google/genai";
import { SolutionResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function processDoubtImage(base64Image: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
        { text: "Extract ONLY the text of the primary academic question in this image. Do not include instructions or surrounding UI text." }
      ]
    },
  });
  return response.text || "";
}

export async function getStepByStepSolution(question: string): Promise<{ explanation: string, videoKeywords: string }> {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Act as an expert teacher. Provide a detailed, step-by-step solution for this academic doubt: "${question}". 
    Format your response in Markdown. 
    Also, at the very end of your response, provide 3 specific keywords for a YouTube search in a line starting with 'KEYWORDS:' separated by commas.`,
    config: {
      temperature: 0.7,
    }
  });
  
  const fullText = response.text || "";
  const parts = fullText.split('KEYWORDS:');
  return {
    explanation: parts[0].trim(),
    videoKeywords: parts[1] ? parts[1].trim() : question
  };
}

export async function fetchMockVideos(query: string) {
  // Since we don't have a real YouTube API Key safely handled here, 
  // we simulate results based on keywords using Gemini or a high-quality mock.
  // In a real app, this would call YouTube Data API v3.
  return [
    {
      id: "dQw4w9WgXcQ", // Placeholder
      title: `Detailed lesson on: ${query.split(',')[0]}`,
      thumbnail: `https://picsum.photos/seed/${Math.random()}/320/180`,
      channelTitle: "Education Academy"
    },
    {
      id: "3JZ_D3ELwOQ",
      title: "Problem Solving Workshop",
      thumbnail: `https://picsum.photos/seed/${Math.random()}/320/180`,
      channelTitle: "Master Class"
    },
    {
      id: "L_jWHffIx5E",
      title: "Exam Prep: Core Concepts",
      thumbnail: `https://picsum.photos/seed/${Math.random()}/320/180`,
      channelTitle: "Study Guide"
    }
  ];
}
