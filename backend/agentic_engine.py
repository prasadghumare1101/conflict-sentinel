import os
import json
import sys
import io

# Force UTF-8 output to avoid Windows charmap errors with emojis
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from crewai import Agent, Task, Crew, Process, LLM
from crewai.tools import tool
from duckduckgo_search import DDGS

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# HuggingFace LLM via OpenAI-compatible router
hf_llm = LLM(
    model="openai/Qwen/Qwen2.5-72B-Instruct:novita",
    base_url="https://router.huggingface.co/v1",
    api_key=os.environ.get("HF_TOKEN", ""),
)

# Custom Tool for DuckDuckGo Search
@tool("ddg_search")
def ddg_search(query: str):
    """Search the web using DuckDuckGo to get the latest news and information."""
    try:
        with DDGS() as ddgs:
            results = [r for r in ddgs.text(query, max_results=5)]
            return str(results)
    except Exception as e:
        return f"Search failed: {e}"

def _build_agents(llm):
    """Build CrewAI agents with the given LLM."""
    news_researcher = Agent(
        role='News Researcher',
        goal='Scrape and summarize recent global news about emerging conflicts.',
        backstory="You are a specialized intelligence officer monitoring real-time news.",
        tools=[ddg_search],
        llm=llm,
        verbose=True,
        allow_delegation=False,
        max_iter=2,
        max_rpm=10
    )
    conflict_analyst = Agent(
        role='Conflict Strategic Analyst',
        goal='Analyze geopolitical news to predict high-value conflict zones.',
        backstory="You are a veteran geopolitical strategist who predicts outcomes.",
        tools=[ddg_search],
        llm=llm,
        verbose=True,
        allow_delegation=False,
        max_iter=2,
        max_rpm=10
    )
    artemis_red_teamer = Agent(
        role='Artemis Red Team Supervisor',
        goal='Critically evaluate predicted conflict zones for tactical vulnerabilities.',
        backstory="You specialize in identifying vulnerabilities and strategic flaws.",
        tools=[ddg_search],
        llm=llm,
        verbose=True,
        allow_delegation=False,
        max_iter=2,
        max_rpm=10
    )
    return news_researcher, conflict_analyst, artemis_red_teamer

def _run_crew(llm, query):
    """Build and run the crew with the given LLM."""
    news_researcher, conflict_analyst, artemis_red_teamer = _build_agents(llm)

    research_task = Task(
        description=f"""Research for emerging conflict signals: {query}.

        Perform the following OSINT collection steps in order:
        1. Search for latest mainstream news articles about the topic.
        2. Search Reddit discussions by appending 'site:reddit.com' to your query. For each Reddit thread found, perform SENTIMENT ANALYSIS: classify the community sentiment as Positive/Negative/Neutral and note the emotional tone (fear, outrage, skepticism, etc.).
        3. Search for X/Twitter posts by appending 'site:twitter.com OR site:x.com' to your query. For each X post found, VERIFY it against at least one secondary mainstream news source — note if it is Verified, Unverified, or Contradicted by secondary sources.
        4. Compile all source URLs found.

        For each source, explicitly note:
        - The platform (Reddit/X/News)
        - The URL
        - A brief summary of the content
        - For Reddit: Sentiment analysis result
        - For X/Twitter: Verification status against secondary sources
        """,
        agent=news_researcher,
        expected_output="A structured summary of 3-5 potential conflict flashpoints, including Reddit thread sentiment analysis, X post verification status, and all source URLs."
    )

    prediction_task = Task(
        description="""Predict the most likely conflict area based on the research. Provide a JSON response:
        {
            "location_name": "string",
            "coordinates": {"lat": float, "lng": float},
            "radius_km": float,
            "conflict_probability": float,
            "reasoning": "string",
            "strategic_value": "string"
        }
        Respond ONLY with the JSON object.""",
        agent=conflict_analyst,
        expected_output="A JSON object containing location, coordinates, radius, probability, and reasoning."
    )

    red_team_task = Task(
        description="""Review the prediction and the original research. Perform a Red Team analysis.
        Compile the FINAL intelligence brief into a JSON response containing ALL of these fields:
        {
            "location_name": "string",
            "coordinates": {"lat": float, "lng": float},
            "radius_km": float,
            "conflict_probability": float,
            "reasoning": "string",
            "strategic_value": "string",
            "news_sources": ["List of actual URLs, X posts, or Reddit threads found in research"],
            "news_summary": "Detailed summary of the news, X posts, and Reddit discussions",
            "red_team_critique": "string",
            "deception_score": float,
            "tactical_vulnerabilities": ["string"]
        }
        Respond ONLY with the JSON object.""",
        agent=artemis_red_teamer,
        expected_output="A comprehensive JSON object with location, reasoning, news sources/summary, and red team critique."
    )

    crew = Crew(
        agents=[news_researcher, conflict_analyst, artemis_red_teamer],
        tasks=[research_task, prediction_task, red_team_task],
        process=Process.sequential,
        verbose=True
    )

    return crew.kickoff()


def predict_conflict(query="global geopolitical hotspots"):
    # Use HuggingFace API
    try:
        print("Attempting with HuggingFace API...")
        return _run_crew(hf_llm, query)
    except Exception as e:
        print(f"HuggingFace API failed ({e}), using mock data.")

    # Final fallback: mock data
    return {
        "location_name": "Ukraine-Russia Border (MOCK)",
        "coordinates": {"lat": 48.3794, "lng": 38.0297},
        "radius_km": 60.0,
        "conflict_probability": 0.92,
        "reasoning": "Fallback mode active. Both Gemini and HuggingFace APIs are unavailable. This mock ROI demonstrates the mapping functionality.",
        "strategic_value": "Primary industrial sector and tactical transit corridor.",
        "news_sources": ["https://reddit.com/r/worldnews/mock_post", "https://x.com/mock_osint_account/status/123", "https://reuters.com/mock-news"],
        "news_summary": "Mock summary: Heavy discussions on Reddit regarding troop movements. OSINT accounts on X reporting satellite imagery of armor buildup. Mainstream news confirms diplomatic stall.",
        "red_team_critique": "Mock analysis: Supply chain vulnerability identified in northern sectors. Sources on X may be state-sponsored disinformation.",
        "deception_score": 0.1,
        "tactical_vulnerabilities": ["Logistics overextension", "Electronic warfare interference"]
    }

if __name__ == "__main__":
    user_query = sys.argv[1] if len(sys.argv) > 1 else "current geopolitical tensions"
    prediction = predict_conflict(user_query)
    
    if isinstance(prediction, dict):
        print(json.dumps(prediction))
    else:
        try:
            # Try to parse the result if it's a CrewAI output object
            print(json.dumps(json.loads(str(prediction))))
        except:
            # Final fallback to raw string if JSON parsing fails
            print(str(prediction))
