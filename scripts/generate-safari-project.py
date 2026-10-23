#!/usr/bin/env python3
"""Generate local-only Apple packaging; keep the extension sources linked."""
from pathlib import Path
import subprocess, json, re
root = Path(__file__).resolve().parents[1]
location = root / '.build/safari'
project = location / 'Safari Agent/Safari Agent.xcodeproj/project.pbxproj'
# Regenerate this task-owned packaging so newly added extension resources are
# included. All durable custom sources live outside the generated directory.
subprocess.run(['xcrun', 'safari-web-extension-converter', str(root / 'extension'),
    '--macos-only', '--no-open', '--no-prompt', '--force', '--project-location', str(location),
    '--app-name', 'Safari Agent', '--bundle-identifier', 'app.stonehub.safari-agent'], check=True)
# Safari 27's converter normalizes the containing app's name differently from
# the requested extension prefix; embedded bundles must share the exact prefix.
source = project.read_text()
source = source.replace('app.stonehub.Safari-Agent', 'app.stonehub.safari-agent')
version=json.loads((root/'extension/manifest.json').read_text())['version']
build=sum(int(n)*100**(2-i) for i,n in enumerate(version.split('.')))
source=re.sub(r'MARKETING_VERSION = [^;]+;', 'MARKETING_VERSION = '+version+';', source)
source=re.sub(r'CURRENT_PROJECT_VERSION = [^;]+;', 'CURRENT_PROJECT_VERSION = '+str(build)+';', source)
source=source.replace('CURRENT_PROJECT_VERSION = '+str(build)+';',
    'CURRENT_PROJECT_VERSION = '+str(build)+';\n'
    '\t\t\t\tCODE_SIGN_ENTITLEMENTS = "'+str(root/'native/Connection.entitlements')+'";\n'
    '\t\t\t\tREGISTER_APP_GROUPS = NO;')
project.write_text(source)
subprocess.run(['python3', str(root/'scripts/stage-native-handler.py')], check=True)
print('Local Safari Agent project ready; signing remains locally supplied.')
