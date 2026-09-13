import asyncio
import json
import logging
from typing import List
from pydantic import BaseModel

logger = logging.getLogger(__name__)

async def run_agent_loop(url: str, api_key: str, model_names: List[str], keyword: str):
    logger.info(f"Starting browser-use agent for {url} searching for {keyword}")
    
    from langchain_google_genai import ChatGoogleGenerativeAI
    from browser_use import Agent
    from pydantic import SecretStr
    
    # Initialize the LLM using the primary model
    # browser-use uses langchain under the hood
    llm = ChatGoogleGenerativeAI(
        model=model_names[0], 
        api_key=SecretStr(api_key),
        temperature=0.0,
        max_retries=2
    )
    
    class JobItem(BaseModel):
        title: str
        link: str
        
    class JobsResult(BaseModel):
        jobs: List[JobItem]
    
    task_prompt = f"""
    1. Go to this exact URL: {url}
    2. Search for jobs matching the keyword: '{keyword}'
    3. You must handle any weird UI setups. If a search button is a span, click it!
    4. If the page loads slowly, wait for it. 
    5. Extract all matching job postings (title and URL).
    6. If there is a "Next Page" button, click it and extract more jobs.
    7. YOU MUST RETURN THE FINAL OUTPUT EXCLUSIVELY AS A JSON ARRAY OF OBJECTS WITH 'title' AND 'link' KEYS. Do not return conversational text, only the JSON array inside ```json blocks.
    """
    
    # Create the agent
    agent = Agent(
        task=task_prompt,
        llm=llm,
        use_vision=False # Disable vision to save tokens/latency
    )
    
    logger.info("Executing browser-use agent...")
    try:
        result = await agent.run()
        
        # Parse the structured output
        # browser-use natively extracts final answers if prompted well, 
        # or we can extract the JSON from the final result text.
        final_text = result.final_result()
        logger.info(f"Agent finished with result: {final_text}")
        
        # Simple extraction logic from the agent's text response
        # In a real app we'd use Structured Outputs in the Controller
        extracted_jobs = []
        try:
            # Attempt to find JSON inside the text
            import re
            json_match = re.search(r'\[\s*\{.*?\}\s*\]', final_text, re.DOTALL)
            if json_match:
                extracted_jobs = json.loads(json_match.group(0))
        except Exception as e:
            logger.error(f"Failed to parse agent JSON output: {e}")
            
        return extracted_jobs
        
    except Exception as e:
        logger.error(f"Browser-use agent crashed: {e}")
        # Fallback to secondary model if primary fails
        if len(model_names) > 1:
            logger.info(f"Falling back to {model_names[1]}...")
            llm_fallback = ChatGoogleGenerativeAI(
                model=model_names[1], 
                api_key=SecretStr(api_key),
                temperature=0.0
            )
            agent = Agent(task=task_prompt, llm=llm_fallback, use_vision=False)
            result = await agent.run()
            # Parse result similarly...
            return []
        else:
            raise e
