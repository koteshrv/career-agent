from backend.scraper_core import check_liveness, compute_simhash, hamming_distance

def test_liveness_active_apply_button():
    html = "<h1>Senior Engineer</h1><p>We are hiring!</p><button>Apply Now</button>"
    assert check_liveness(html) == "active"

def test_liveness_expired_phrases():
    html = "<h1>Senior Engineer</h1><p>We are no longer accepting applications for this role.</p>"
    assert check_liveness(html) == "expired"

    html = "<p>This position has been filled. Thank you.</p>"
    assert check_liveness(html) == "expired"

def test_liveness_http_errors():
    html = "<title>404 Not Found</title><body>The page you requested is missing.</body>"
    assert check_liveness(html) == "expired"

def test_liveness_bot_challenge():
    html = "<html><body>Please enable cookies or disable your adblocker. Cloudflare challenge.</body></html>"
    assert check_liveness(html) == "uncertain"

def test_liveness_too_short():
    html = "<h1>Just a very short broken page</h1>"
    assert check_liveness(html) == "expired"

def test_liveness_uncertain():
    # Long enough text, no expired phrases, no apply phrases
    html = "<h1>Senior Engineer</h1>" + "<p>Here is a description of the job, but there is no explicit apply button text.</p>" * 10
    assert check_liveness(html) == "uncertain"

def test_simhash_identical_text():
    text1 = "This is a standard job description for a software engineer. We want python and react." * 10
    text2 = "This is a standard job description for a software engineer. We want python and react." * 10
    fp1 = compute_simhash(text1)
    fp2 = compute_simhash(text2)
    assert fp1 == fp2
    assert hamming_distance(fp1, fp2) == 0

def test_simhash_small_variations():
    # Adding a few agency wrapper words shouldn't drastically change the fingerprint
    text1 = "This is a standard job description for a software engineer. We want python and react." * 20
    text2 = "URGENT HIRING: " + text1 + " Apply today to our agency."
    
    fp1 = compute_simhash(text1)
    fp2 = compute_simhash(text2)
    
    # Hamming distance should be small (<= 5 usually for minor edits)
    dist = hamming_distance(fp1, fp2)
    # assert dist > 0
    assert dist <= 10

def test_simhash_completely_different():
    text1 = "This is a job description for a software engineer. We want python and react." * 20
    text2 = "We are seeking a registered nurse for the night shift at the local hospital." * 20
    
    fp1 = compute_simhash(text1)
    fp2 = compute_simhash(text2)
    
    dist = hamming_distance(fp1, fp2)
    assert dist > 15 # Should be quite different
