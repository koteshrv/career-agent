from backend.ai_agent import strip_code_fences


def test_strip_code_fences_plain_json_block():
    raw = "```json\n{\"a\": 1}\n```"
    assert strip_code_fences(raw) == '{"a": 1}'

def test_strip_code_fences_bare_fence_no_language():
    raw = "```\nhello\n```"
    assert strip_code_fences(raw) == "hello"

def test_strip_code_fences_no_fence_returns_unchanged():
    assert strip_code_fences("plain text, no fences") == "plain text, no fences"

def test_strip_code_fences_handles_empty_string():
    assert strip_code_fences("") == ""

def test_strip_code_fences_strips_surrounding_whitespace():
    raw = "  \n```json\n[1, 2, 3]\n```\n  "
    assert strip_code_fences(raw) == "[1, 2, 3]"
