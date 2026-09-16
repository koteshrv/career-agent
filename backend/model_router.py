"""Hardcoded Model Routing Configuration

This file defines exactly which AI model is used for which specific operation,
preventing the user from having to guess or manually configure models in the UI.
"""

# Available operational contexts
TASKS = {
    "JOB_EVALUATION": "gemini-3.5-flash",        # Needs deep reasoning for scoring
    "RESUME_EXTRACTION": "gemini-3.1-flash-lite", # Fast, cheap extraction
    "COVER_LETTER_GEN": "gemini-3.5-flash",      # High quality text generation
    "LOCAL_FALLBACK": "llama3.1",                # Default local model
}

def get_model_for_task(task_name: str) -> str:
    """Returns the hardcoded model for a specific operational task."""
    return TASKS.get(task_name, "gemini-3.5-flash")
