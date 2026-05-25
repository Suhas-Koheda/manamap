import { GoogleGenAI } from "@google/genai";

export async function analyzePost(title: string, description: string) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === '') {
    console.warn("Gemini API Key is missing. Skipping AI analysis.");
    return { category: 'Community', priority: 'medium', safe: true };
  }

  try {
    const ai = new GoogleGenAI(apiKey);
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        As a civic intelligence AI for Telangana, analyze this report:
        Title: ${title}
        Description: ${description}
        
        Return a JSON object with:
        1. category (e.g., Road, Water, Electricity, Heritage, Food, Park)
        2. priority (low, medium, high) - only for issues
        3. safe (boolean) - true if not spam or offensive
        
        Format: JSON only.
      `,
    });
    
    const text = response.text || '';
    
    // Simple JSON extraction
    const jsonStr = text.match(/\{.*\}/s)?.[0];
    if (jsonStr) {
      return JSON.parse(jsonStr);
    }
  } catch (error) {
    console.error("Gemini analysis error:", error);
  }
  return { category: 'Other', priority: 'medium', safe: true };
}

export async function summarizeProjectDescription(rawText: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === '') {
    console.warn("Gemini API Key is missing. Returning raw description.");
    return rawText;
  }

  try {
    const ai = new GoogleGenAI(apiKey);
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // Using gemini-2.5-flash or gemini-1.5-flash as default, or whatever GoogleGenAI package standard is. Let's use "gemini-2.5-flash"
      contents: `
        As a civil engineering and infrastructure expert who communicates with everyday citizens in Telangana, translate the following raw government project description or engineering jargon into a clear, 1-sentence, plain-English explanation of what is actually being built/maintained, why, and where:
        
        Raw description: ${rawText}
        
        Rules:
        - Output ONLY the 1-sentence explanation.
        - Do not include prefixes like "Here is your summary:" or "This project will...".
        - Focus on clarity, simplicity, and public utility.
      `,
    });
    
    return response.text?.trim() || rawText;
  } catch (error) {
    console.error("Gemini project description summarization error:", error);
    return rawText;
  }
}

