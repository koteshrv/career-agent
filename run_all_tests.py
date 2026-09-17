import sys
from tests.test_scraper_heuristics import (
    test_liveness_active_apply_button,
    test_liveness_expired_phrases,
    test_liveness_http_errors,
    test_liveness_bot_challenge,
    test_liveness_too_short,
    test_liveness_uncertain,
    test_simhash_identical_text,
    test_simhash_small_variations,
    test_simhash_completely_different
)
from tests.test_onboarding import (
    test_onboard_resume_success,
    test_onboard_resume_empty,
    test_onboard_resume_api_error
)

def run():
    tests = [
        test_liveness_active_apply_button,
        test_liveness_expired_phrases,
        test_liveness_http_errors,
        test_liveness_bot_challenge,
        test_liveness_too_short,
        test_liveness_uncertain,
        test_simhash_identical_text,
        test_simhash_small_variations,
        test_simhash_completely_different,
        test_onboard_resume_success,
        test_onboard_resume_empty,
        test_onboard_resume_api_error
    ]
    
    passed = 0
    for t in tests:
        try:
            t()
            print(f"PASSED: {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"FAILED: {t.__name__} - {e}")
            
    print(f"\n{passed}/{len(tests)} tests passed.")
    if passed != len(tests):
        sys.exit(1)

if __name__ == "__main__":
    run()
