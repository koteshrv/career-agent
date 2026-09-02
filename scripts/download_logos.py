import json
import os
import urllib.request
from urllib.error import URLError, HTTPError

def download_logos():
    with open('targets.json', 'r') as f:
        targets = json.load(f)
        
    out_dir = 'frontend/public/logos'
    
    for t in targets:
        company = t.get('company')
        if not company: continue
        
        filename = company.lower().replace(' ', '') + '.png'
        filepath = os.path.join(out_dir, filename)
        
        if os.path.exists(filepath):
            continue
            
        domain = company.lower().replace(' ', '') + '.com'
        clearbit_url = f"https://logo.clearbit.com/{domain}"
        
        print(f"Downloading logo for {company}...")
        try:
            # Try Clearbit first
            req = urllib.request.Request(clearbit_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response, open(filepath, 'wb') as out_file:
                out_file.write(response.read())
            print(f"  -> Success (Clearbit)")
        except HTTPError as e:
            # Fallback to UI Avatars
            print(f"  -> Clearbit failed ({e.code}), falling back to UI Avatars")
            ui_avatar_url = f"https://ui-avatars.com/api/?name={urllib.parse.quote(company)}&background=27272a&color=fff&size=128&rounded=true&font-size=0.4"
            req = urllib.request.Request(ui_avatar_url, headers={'User-Agent': 'Mozilla/5.0'})
            try:
                with urllib.request.urlopen(req) as response, open(filepath, 'wb') as out_file:
                    out_file.write(response.read())
                print(f"  -> Success (UI Avatars)")
            except Exception as e:
                print(f"  -> Failed UI Avatars: {e}")
        except Exception as e:
            print(f"  -> Failed: {e}")

if __name__ == '__main__':
    download_logos()
