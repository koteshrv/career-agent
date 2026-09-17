import traceback
from tests.test_scraper_heuristics import test_simhash_small_variations

try:
    test_simhash_small_variations()
except AssertionError as e:
    print("Assertion failed!")
    traceback.print_exc()
