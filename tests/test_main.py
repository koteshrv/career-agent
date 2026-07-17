from backend.main import _extension_location_tag


def test_extension_location_tag_strips_www_and_capitalizes():
    assert _extension_location_tag("https://www.linkedin.com/jobs/view/123") == "Manual - Extension (Linkedin)"

def test_extension_location_tag_without_www():
    assert _extension_location_tag("https://naukri.com/job-listings-1") == "Manual - Extension (Naukri)"

def test_extension_location_tag_empty_domain_for_schemeless_input():
    # urlparse doesn't raise on garbage input — it just yields an empty netloc,
    # so the except-branch fallback ("Extension") is effectively unreachable in practice.
    assert _extension_location_tag("not-a-url") == "Manual - Extension ()"
