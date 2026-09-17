# Running the Tests

This directory contains unit tests for the `career-agent` backend, including tests for the core AI logic, database schemas, and scraper heuristics. All tests are written using `pytest`.

## 1. Setup the Environment

Ensure you have your Python virtual environment activated:

```bash
# On Linux/macOS
source venv/bin/activate

# On Windows
venv\Scripts\activate
```

Next, ensure all development dependencies (including `pytest`) are installed:

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

*(Note: If `pytest` is not found after running the above, you can manually install it with `pip install pytest`).*

## 2. How to Run the Tests

You can run all tests in the entire project by running:

```bash
pytest
```

If you only want to run a specific test file (for example, the newly added heuristic tests or onboarding tests), pass the file path:

```bash
pytest tests/test_scraper_heuristics.py
pytest tests/test_onboarding.py
```

To see verbose output (including printed log statements), use the `-v` and `-s` flags:

```bash
pytest -v -s tests/test_scraper_heuristics.py
```

## 3. What We Are Testing

- **`test_scraper_heuristics.py`**: Tests the `check_liveness` cascade (404s, "no longer hiring", bot challenges) and verifies the SimHash 64-bit deduplication threshold logic (0 distance for identical text, <=5 for minor variations).
- **`test_onboarding.py`**: Mocks the Gemini API generation call to verify that our `ai_agent.onboard_resume` function perfectly parses the JSON payload outputted by the new `onboard.md` prompt, and handles API errors/empty resumes gracefully without crashing.
