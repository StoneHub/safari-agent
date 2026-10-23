#!/usr/bin/env python3
"""Build the native extension and embedded wake helper with existing local signing."""
import argparse, hashlib, json, os, plistlib, subprocess, tempfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
os.chdir(root)
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--xcconfig',type=Path,required=True,help='Private local signing configuration')
a=p.parse_args()
subprocess.run(['python3','scripts/generate-safari-project.py'],check=True)
args=['xcodebuild','-project','.build/safari/Safari Agent/Safari Agent.xcodeproj',
      '-scheme','Safari Agent','-configuration','Debug','-destination','platform=macOS',
      '-derivedDataPath','.build/DerivedData','-xcconfig',str(a.xcconfig.resolve())]
log=root/'.build/safari-agent-build.log'
with log.open('w') as stream:
    subprocess.run(args+['build'],stdout=stream,stderr=subprocess.STDOUT,check=True)
    settings=subprocess.run(args+['-showBuildSettings','-json'],stdout=subprocess.PIPE,stderr=stream,check=True)
    (root/'.build/safari-agent-build-settings.json').write_bytes(settings.stdout)
    values=next(x['buildSettings'] for x in json.loads(settings.stdout) if x['target']=='Safari Agent')
    app=Path(values['TARGET_BUILD_DIR'])/values['FULL_PRODUCT_NAME']
    with tempfile.TemporaryDirectory(prefix='native-signing-',dir=root/'.build') as private:
        private=Path(private)
        subprocess.run(['codesign','-d','--extract-certificates='+str(private/'cert'),str(app)],stdout=stream,stderr=stream,check=True)
        identity=hashlib.sha1((private/'cert0').read_bytes()).hexdigest()
        entitlements=subprocess.run(['codesign','-d','--entitlements',':-',str(app)],stdout=subprocess.PIPE,stderr=stream,check=True).stdout
        plistlib.loads(entitlements)
        entitlements_path=private/'app.entitlements'
        entitlements_path.write_bytes(entitlements)
        groups=plistlib.loads(entitlements).get('com.apple.security.application-groups')
        if not groups:raise RuntimeError('Native app-group signing is missing')
        extension=next((app/'Contents/PlugIns').glob('*.appex'))
        version=json.loads((root/'extension/manifest.json').read_text())['version']
        for bundle in [app,extension]:
            info=plistlib.loads((bundle/'Contents/Info.plist').read_bytes())
            if info.get('SafariAgentGroupIdentifier') not in groups or info.get('CFBundleShortVersionString') != version:
                raise RuntimeError('Native connection metadata or preview version missing from current product')
        (app/'Contents/MacOS/safari-agent-wake').unlink(missing_ok=True)
        helper=app/'Contents/MacOS/safari-agent-native'
        subprocess.run(['xcrun','swiftc','native/ConnectionStore.swift','native/Wake/main.swift','-framework','SafariServices','-o',str(helper)],stdout=stream,stderr=stream,check=True)
        # This bounded dispatcher is launched by an external MCP client, not a
        # sandboxed child of the GUI app. Giving it the GUI app's sandbox causes
        # secinit to abort before main. It carries no page data or credentials.
        helper_entitlements=private/'helper.entitlements'
        helper_entitlements.write_bytes(plistlib.dumps({'com.apple.security.application-groups':groups}))
        subprocess.run(['codesign','--force','--sign',identity,'--identifier','app.stonehub.safari-agent',
            '--timestamp=none','--entitlements',str(helper_entitlements),str(helper)],stdout=stream,stderr=stream,check=True)
        subprocess.run(['codesign','--force','--sign',identity,'--timestamp=none',
            '--entitlements',str(entitlements_path),str(app)],stdout=stream,stderr=stream,check=True)
    subprocess.run(['codesign','--verify','--deep','--strict',str(app)],stdout=stream,stderr=stream,check=True)
print('Current signed Safari Agent preview built, including native connection and wake helper.')
