#!/usr/bin/env python3
"""Stage the reviewed native handler after Safari's project converter runs."""
from pathlib import Path
import plistlib

root = Path(__file__).resolve().parents[1]
source = root / 'native/SafariWebExtensionHandler.swift'
destination = root / '.build/safari/Safari Agent/Safari Agent Extension/SafariWebExtensionHandler.swift'
if not destination.is_file() or destination.is_symlink():
    raise SystemExit('Generate the local Safari project first; native handler was not staged.')
combined = (root / 'native/ConnectionStore.swift').read_bytes() + b'\n' + source.read_bytes()
if combined != destination.read_bytes():
    destination.write_bytes(combined)
app_delegate = destination.parent.parent/'Safari Agent/AppDelegate.swift'
if not app_delegate.is_file() or app_delegate.is_symlink():
    raise SystemExit('Generated containing app delegate is unavailable; headless entry was not staged.')
app_source = (root/'native/AppDelegate.swift').read_bytes()
if app_delegate.read_bytes() != app_source:
    app_delegate.write_bytes(app_source)
for info_path in [destination.parent/'Info.plist',destination.parent.parent/'Safari Agent/Info.plist']:
    info=plistlib.loads(info_path.read_bytes())
    info['SafariAgentGroupIdentifier']='$(DEVELOPMENT_TEAM).app.stonehub.safari-agent'
    info_path.write_bytes(plistlib.dumps(info))
print('Reviewed native connection handler staged; build/install verification remains separate.')
