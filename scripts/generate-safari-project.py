#!/usr/bin/env python3
"""Generate local-only Apple packaging; keep the extension sources linked."""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[1]
location = root / '.build/safari'
project = location / 'Safari Agent/Safari Agent.xcodeproj/project.pbxproj'
if not project.exists():
    subprocess.run(['xcrun', 'safari-web-extension-converter', str(root / 'extension'),
        '--macos-only', '--no-open', '--no-prompt', '--project-location', str(location),
        '--app-name', 'Safari Agent', '--bundle-identifier', 'app.stonehub.safari-agent'], check=True)
# Safari 27's converter normalizes the containing app's name differently from
# the requested extension prefix; embedded bundles must share the exact prefix.
source = project.read_text()
source = source.replace('app.stonehub.Safari-Agent', 'app.stonehub.safari-agent')
project.write_text(source)
print('Local Safari Agent project ready; signing remains locally supplied.')
