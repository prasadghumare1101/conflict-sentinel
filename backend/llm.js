// backend/llm.js

const OLLAMA_API_URL = "http://localhost:11434/api/generate";

/**
 * Generates a tactical analysis using a local Ollama model.
 * @param {object} geoint - The GEOINT data from Agent 1.
 * @param {object} logistics - The logistics data from Agent 2.
 * @returns {Promise<object>} - The parsed JSON output from the LLM.
 */
async function getDoctrinalAnalysis(geoint, logistics) {
  // Construct a constrained, few-shot prompt for the LLM.
  const prompt = `
    Analyze the following tactical data and provide a JSON response.

    **Context:**
    - GEOINT has detected ${geoint.length} potential targets in the Region of Interest.
    - Logistics analysis shows a primary supply route with a travel time of ${logistics.travelTime}.
    
    **Historical Doctrine:**
    - The adversary prioritizes infrastructure disruption.
    - They typically stage near topographical bottlenecks before an operation.

    **Task:**
    Based *only* on the provided data and doctrine, provide a tactical prediction.
    Respond with a JSON object in the following format, with no other text or explanation:
    {
      "predicted_action": "string (e.g., 'AMBUSH', 'DEFENSIVE POSTURING', 'STAGING')",
      "target_priority": "string (The ID of the most likely target building, e.g., 'B4')",
      "justification": "string (A brief, one-sentence rationale)"
    }
  `;

  const requestBody = {
    // model: "llama3:8b-instruct-q4_K_M", // As specified in the arch
    model: "llama2", // Using llama2 as a common default for Ollama
    prompt: prompt,
    format: "json",
    stream: false, // We want the full response at once
  };

  try {
    const response = await fetch(OLLAMA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.statusText} - ${errorText}`);
    }

    const responseData = await response.json();
    
    // The actual JSON content is in the 'response' property of the Ollama payload
    return JSON.parse(responseData.response);

  } catch (error) {
    console.error("Error contacting Ollama:", error.message);
    // Return a fallback object if Ollama is not available
    return {
      error: "Failed to get analysis from LLM.",
      reason: error.message,
    };
  }
}

module.exports = { getDoctrinalAnalysis };
