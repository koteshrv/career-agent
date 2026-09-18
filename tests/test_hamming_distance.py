from backend.scraper_core import hamming_distance

# hamming_distance is pure arithmetic on two already-computed SimHash hex
# strings — it stays Python (see backend/scraper_core.py's docstring on it).
# The fingerprints themselves are computed in Node now
# (backend/universal/process-content.mjs / tests/universal/process-content.test.mjs);
# these fixed hex pairs stand in for that so this test needs no subprocess.

def test_identical_fingerprints_have_zero_distance():
    assert hamming_distance("72c058d50f69d329", "72c058d50f69d329") == 0

def test_one_bit_difference():
    assert hamming_distance("0000000000000000", "0000000000000001") == 1

def test_missing_fingerprint_is_max_distance():
    assert hamming_distance("", "72c058d50f69d329") == 64
    assert hamming_distance("72c058d50f69d329", "") == 64
    assert hamming_distance(None, None) == 64

def test_completely_different_fingerprints():
    assert hamming_distance("0000000000000000", "ffffffffffffffff") == 64
