
import { GoogleGenAI, Type } from "@google/genai";
import { YouTubeVideo } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Uses Gemini 3 Pro Preview for high-intelligence image analysis/OCR.
 * As per feature request: "MUST add image understanding... using model gemini-3-pro-preview"
 */
export async function processDoubtImage(base64Image: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
        { text: "Analyze this educational image. Extract the core academic question or mathematical problem. If it's a diagram, describe the known values and the goal. Output only the refined question text." }
      ]
    },
  });
  return response.text || "";
}

/**
 * Uses Gemini 3 Pro Preview with Thinking mode for complex reasoning.
 * As per feature request: "MUST use the gemini-3-pro-preview model and set thinkingBudget to 32768"
 */
export async function getStepByStepSolution(question: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Act as a world-class academic tutor. Solve this problem with extreme precision: "${question}".
    
    CRITICAL FORMATTING:
    - Use LaTeX for ALL math/science notation.
    - Inline: $x^2$. Display: $$ ... $$.
    - Break into logical, bite-sized teaching steps.
    
    Structure the response as JSON:
    1. summary: Conceptual overview.
    2. steps: Array of {title, content}.
    3. finalAnswer: The result in display LaTeX.
    4. tips: Array of key takeaways.
    5. youtubeKeywords: Targeted search query for video lessons.`,
    config: {
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 32768 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING }
              },
              required: ["title", "content"]
            }
          },
          finalAnswer: { type: Type.STRING },
          tips: { type: Type.ARRAY, items: { type: Type.STRING } },
          youtubeKeywords: { type: Type.STRING }
        },
        required: ["summary", "steps", "finalAnswer", "tips", "youtubeKeywords"]
      }
    }
  });
  
  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("JSON parsing error", e);
    return {
      summary: "Error generating structured solution.",
      steps: [{ title: "Analysis", content: response.text || "Processing failed." }],
      finalAnswer: "Check Question",
      tips: ["Try providing a clearer image."],
      youtubeKeywords: question
    };
  }
}

/**
 * Fetches real video data from YouTube Data API v3.
 * Falls back to mock data if API call fails (e.g. key permissions).
 */
export async function fetchYouTubeVideos(query: string): Promise<YouTubeVideo[]> {
  const API_KEY = process.env.API_KEY;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=4&q=${encodeURIComponent(query + " educational lesson")}&type=video&key=${API_KEY}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.items && data.items.length > 0) {
      return data.items.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
        channelTitle: item.snippet.channelTitle
      }));
    }
  } catch (e) {
    console.error("YouTube API error, falling back to mock", e);
  }

  // Fallback logic
  return [
    {
      id: "dQw4w9WgXcQ",
      title: `Lesson: ${query.split(' ')[0]} Fundamentals`,
      thumbnail: `https://picsum.photos/seed/yt1/320/180`,
      channelTitle: "Academy Pro"
    },
    {
      id: "3JZ_D3ELwOQ",
      title: "Problem Solving Walkthrough",
      thumbnail: `https://picsum.photos/seed/yt2/320/180`,
      channelTitle: "Tutor Express"
    }
  ];
}
