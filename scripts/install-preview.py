#!/usr/bin/env python3
"""Install the current signed development build, with private rollback staging."""
import argparse, hashlib, json, os, plistlib, re, shutil, subprocess, tempfile
from pathlib import Path
APP_ID = 'app.stonehub.safari-agent'
def require(test, message):
    if not test: raise RuntimeError(message)
def info(app):
    return plistlib.loads((app / 'Contents/Info.plist').read_bytes())
def hashes(root):
    return {str(p.relative_to(root)): ('link:'+os.readlink(p) if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest())
            for p in root.rglob('*') if p.is_file() or p.is_symlink()}
def team(app):
    r=subprocess.run(['codesign','-dv',str(app)],capture_output=True,text=True,check=True)
    m=re.search(r'^TeamIdentifier=(\S+)',r.stderr,re.M)
    require(m and m.group(1) != 'not set','Identified development signing required')
    return m.group(1)
def verify(app):
    subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--build-settings',type=Path,required=True)
a=p.parse_args()
settings=next(x['buildSettings'] for x in json.loads(a.build_settings.read_text()) if x['target']=='Safari Agent')
source=Path(settings['TARGET_BUILD_DIR']) / settings['FULL_PRODUCT_NAME']
destination=Path('/Applications/Safari Agent.app')
require(source.is_dir() and not source.is_symlink(),'Resolved build product missing or symlinked')
require(info(source)['CFBundleIdentifier']==APP_ID,'Unexpected build identity')
require(not destination.is_symlink(),'Destination is symlinked; inspect before replacing')
require(source.resolve()!=destination.resolve(),'Source is already installed')
for app in (source,destination):
    running=subprocess.run(['pgrep','-f','^'+re.escape(str(app / 'Contents/MacOS/'))],capture_output=True)
    require(running.returncode==1,'Setup app is running or process check failed; preserve it before updating')
verify(source); expected=hashes(source); publisher=team(source)
if destination.exists():
    require(info(destination)['CFBundleIdentifier']==APP_ID and team(destination)==publisher,'Installed product identity changed')
stage=Path(tempfile.mkdtemp(prefix='.SafariAgent-install-',suffix='.noindex',dir=destination.parent))
keep=False
try:
    prepared=stage/'prepared.app';previous=stage/'previous.app'
    subprocess.run(['ditto',str(source),str(prepared)],check=True)
    require(hashes(prepared)==expected,'Staged files differ from build');verify(prepared)
    had=destination.exists()
    if had:os.replace(destination,previous)
    try:
        os.replace(prepared,destination);verify(destination)
        require(hashes(destination)==expected,'Installed files differ from build')
        apex=next((destination/'Contents/PlugIns').glob('*.appex'))
        require(info(apex)['CFBundleIdentifier']==APP_ID+'.Extension','Unexpected extension identity')
        subprocess.run(['pluginkit','-a',str(apex)],check=True)
    except BaseException:
        try:
            if destination.exists():shutil.rmtree(destination)
            if had:os.replace(previous,destination)
        except BaseException:
            keep=True
            raise RuntimeError('Rollback requires inspection; previous product retained at '+str(previous))
        raise
    source_apex=source/'Contents/PlugIns'/apex.name
    subprocess.run(['pluginkit','-r',str(source_apex)],check=True)
    print(json.dumps({'installed':str(destination),'matchingFiles':len(expected),'strictSignature':True,'browserPermissionsChanged':False}))
finally:
    if not keep:shutil.rmtree(stage)
