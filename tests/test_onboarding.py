import json
from unittest.mock import patch
from backend.ai.ai_agent import onboard_resume

def mock_generate(prompt, api_key, model_name, user_id):
    # Simulate a successful JSON response from the LLM
    data = {
        "target_roles": ["Software Engineer", "Backend Developer"],
        "base_salary_expectations": "$150k - $180k",
        "profile_narrative": "A highly skilled backend engineer...",
        "keywords": ["Python", "FastAPI", "PostgreSQL"]
    }
    return f"```json\n{json.dumps(data)}\n```"

@patch("backend.ai.ai_agent._generate", side_effect=mock_generate)
def test_onboard_resume_success(mock_gen):
    resume_text = "I am a backend engineer with 5 years of Python experience."
    result = onboard_resume(resume_text, api_key="test", model_name="test", user_id=1)
    
    assert "target_roles" in result
    assert result["target_roles"] == ["Software Engineer", "Backend Developer"]
    assert result["base_salary_expectations"] == "$150k - $180k"
    assert "profile_narrative" in result
    assert "Python" in result["keywords"]

def test_onboard_resume_empty():
    result = onboard_resume("")
    assert result == {}

@patch("backend.ai.ai_agent._generate", return_value="Error: API Key Invalid")
def test_onboard_resume_api_error(mock_gen):
    resume_text = "I am a backend engineer."
    result = onboard_resume(resume_text, api_key="bad", model_name="test", user_id=1)
    assert result == {}
