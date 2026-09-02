import json
import os
import urllib.request
import urllib.parse
from urllib.error import HTTPError

def generate_svg_avatar(name):
    initials = "".join([w[0] for w in name.split() if w])[:2].upper()
    if not initials:
        initials = name[:2].upper()
        
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <rect width="128" height="128" rx="32" fill="#27272a"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="sans-serif" font-size="52" font-weight="bold" fill="#ffffff">{initials}</text>
</svg>"""

def download_logos():
    with open('targets.json', 'r') as f:
        targets = json.load(f)
        
    out_dir = 'frontend/public/logos'
    os.makedirs(out_dir, exist_ok=True)
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    }
    
    for t in targets:
        company = t.get('company')
        if not company: continue
        
        base_filename = company.lower().replace(' ', '')
        png_path = os.path.join(out_dir, f"{base_filename}.png")
        svg_path = os.path.join(out_dir, f"{base_filename}.svg")
        
        if os.path.exists(png_path) or os.path.exists(svg_path):
            print(f"Skipping {company}, already exists.")
            continue
            
        domain = base_filename + '.com'
        
        # We will try Clearbit. If it fails, we use Google Favicons. If that fails, we use SVG.
        urls = [
            f"https://logo.clearbit.com/{domain}",
            f"https://www.google.com/s2/favicons?domain={domain}&sz=128"
        ]
        
        success = False
        for url in urls:
            try:
                print(f"Trying {url} for {company}...")
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=5) as response:
                    content = response.read()
                    # Google generic globe is exactly 334 bytes or small. Clearbit is usually > 1000.
                    if len(content) > 600: 
                        with open(png_path, 'wb') as out_file:
                            out_file.write(content)
                        print(f"  -> Success ({url})")
                        success = True
                        break
            except Exception as e:
                pass
                
        if not success:
            print(f"  -> APIs failed, generating SVG fallback locally...")
            svg_content = generate_svg_avatar(company)
            with open(svg_path, 'w') as out_file:
                out_file.write(svg_content)
            print(f"  -> Success (Local SVG)")

if __name__ == '__main__':
    download_logos()
