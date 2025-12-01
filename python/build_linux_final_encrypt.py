#!/usr/bin/env python3
"""
AxeBench Linux Build Script (Versioned)
Creates a standalone Linux executable with UPX compression and integrity verification
Supports dynamic versioning and naming
"""

import os
import sys
import subprocess
import argparse
from pathlib import Path

# -------------------------------------------------------------
# Configuration from CLI arguments
# -------------------------------------------------------------
parser = argparse.ArgumentParser(description="AxeBench Linux Builder")
parser.add_argument("--version", default="v2.1.0", help="Version number, e.g. v2.1.0")
parser.add_argument("--name", default="axebench", help="Base application name")
args = parser.parse_args()

VERSION = args.version
BASE_NAME = args.name
APP_NAME = f"{BASE_NAME}_{VERSION}"
ARCHIVE_NAME = f"{BASE_NAME}-linux-{VERSION}.tar.gz"
CHECKSUM_NAME = f"{ARCHIVE_NAME}.sha256"

# -------------------------------------------------------------

def build_executable():
    print("=" * 60)
    print(f"AxeBench Linux Build Script - Building {APP_NAME}")
    print("=" * 60)

    app_dir = Path.cwd()
    print(f"\nBuilding from: {app_dir}")

    if not (app_dir / 'launcher.py').exists():
        print("\nERROR: launcher.py not found in working directory.")
        return False

    required_files = ['web_interface.py', 'axeshed.py', 'axepool.py']
    for file in required_files:
        if not (app_dir / file).exists():
            print(f"ERROR: Missing required file: {file}")
            return False

    if not (app_dir / 'templates').exists():
        print("ERROR: templates folder missing!")
        return False

    # Check for UPX
    upx_available = False
    try:
        if subprocess.run(['upx', '--version'], capture_output=True).returncode == 0:
            upx_available = True
            print("✓ UPX available")
    except:
        print("Note: UPX not installed")

    # Locate PyInstaller
    pyinstaller_path = None
    candidates = [
        '/home/johnny/.local/bin/pyinstaller',
        'pyinstaller',
        'python3 -m PyInstaller'
    ]

    for path in candidates:
        try:
            if path.startswith('python3'):
                cmd = ["python3", "-m", "PyInstaller", "--version"]
            else:
                cmd = [path, "--version"]
            if subprocess.run(cmd, capture_output=True).returncode == 0:
                pyinstaller_path = path
                print(f"✓ Found PyInstaller: {path}")
                break
        except:
            pass

    if not pyinstaller_path:
        print("ERROR: PyInstaller not found! Install with: pip3 install pyinstaller --user")
        return False

    # Build executable
    print("\n[1/3] Building executable with PyInstaller...")
    templates_path = str(app_dir / 'templates')

    build_cmd = []
    if pyinstaller_path.startswith('python3'):
        build_cmd = [
            'python3', '-m', 'PyInstaller',
            f'--name={APP_NAME}',
            '--onefile',
            f'--add-data={templates_path}:templates',
            '--hidden-import=flask',
            '--hidden-import=flask_cors',
            '--hidden-import=requests',
            '--hidden-import=licensing',
            '--hidden-import=config',
            '--hidden-import=device_manager',
            '--hidden-import=benchmark_engine',
            '--hidden-import=search_strategies',
            '--hidden-import=data_analyzer',
            '--hidden-import=security_manager',
            '--hidden-import=auth_decorator',
            '--hidden-import=tier_restrictions',
            '--hidden-import=axeshed',
            '--hidden-import=axepool',
            '--hidden-import=cryptography',
            '--hidden-import=aiohttp',
            '--hidden-import=asyncio',
            '--hidden-import=pandas',
            '--hidden-import=numpy',
            '--collect-all=flask',
            '--distpath=dist',
            '--workpath=build',
            '--specpath=build',
            '--clean'
        ]
    else:
        build_cmd = [
            pyinstaller_path,
            f'--name={APP_NAME}',
            '--onefile',
            f'--add-data={templates_path}:templates',
            '--hidden-import=flask',
            '--hidden-import=flask_cors',
            '--hidden-import=requests',
            '--hidden-import=licensing',
            '--hidden-import=config',
            '--hidden-import=device_manager',
            '--hidden-import=benchmark_engine',
            '--hidden-import=search_strategies',
            '--hidden-import=data_analyzer',
            '--hidden-import=security_manager',
            '--hidden-import=auth_decorator',
            '--hidden-import=tier_restrictions',
            '--hidden-import=axeshed',
            '--hidden-import=axepool',
            '--hidden-import=cryptography',
            '--hidden-import=aiohttp',
            '--hidden-import=asyncio',
            '--hidden-import=pandas',
            '--hidden-import=numpy',
            '--collect-all=flask',
            '--distpath=dist',
            '--workpath=build',
            '--specpath=build',
            '--clean'
        ]

    if upx_available:
        build_cmd.append('--upx-dir=/usr/bin')

    build_cmd.append('launcher.py')

    subprocess.run(build_cmd)

    exe_path = app_dir / 'dist' / APP_NAME
    if not exe_path.exists():
        print("ERROR: Executable not created.")
        return False

    os.chmod(exe_path, 0o755)
    print("✓ Executable built")

    # Create archive
    print("\n[2/3] Creating tar.gz archive...")
    archive_path = app_dir.parent / ARCHIVE_NAME

    subprocess.run([
        'tar', '-czf', str(archive_path), '-C', str(app_dir / 'dist'), '.'
    ])

    print(f"✓ Archive created: {ARCHIVE_NAME}")

    # Create checksum
    print("\n[3/3] Creating checksum...")
    checksum_path = app_dir.parent / CHECKSUM_NAME
    result = subprocess.run(['sha256sum', str(archive_path)], capture_output=True, text=True)
    checksum_path.write_text(result.stdout)

    print(f"✓ Checksum created: {CHECKSUM_NAME}")

    print("\nBUILD COMPLETE!")
    print(f"Executable: {exe_path}")
    print(f"Archive: {archive_path}")
    print(f"Checksum: {checksum_path}")

    return True


if __name__ == '__main__':
    build_executable()
