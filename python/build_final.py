#!/usr/bin/env python3
"""
Final AxeBench Build Script for Windows
Corrected template path handling
"""

import os
import sys
import subprocess
from pathlib import Path

def build_executable():
    """Build Windows executable"""
    
    print("=" * 60)
    print("AxeBench Windows Build Script")
    print("=" * 60)
    
    # Get the current directory (should be axebench folder)
    app_dir = Path.cwd()
    
    print(f"\nBuilding from: {app_dir}")
    
    # Check if we're in the right directory
    if not (app_dir / 'web_interface.py').exists():
        print("\n✗ ERROR: web_interface.py not found!")
        print(f"Make sure you're in the axebench directory")
        print(f"Current directory: {app_dir}")
        return False
    
    print("✓ Found web_interface.py")
    
    # Check for templates folder
    if not (app_dir / 'templates').exists():
        print("\n✗ ERROR: templates folder not found!")
        print(f"Make sure templates folder exists in: {app_dir}")
        return False
    
    print("✓ Found templates folder")
    
    # Find PyInstaller
    pyinstaller_path = None
    possible_paths = [
        '/home/johnny/.local/bin/pyinstaller',
        'pyinstaller',
        'python3 -m PyInstaller',
    ]
    
    for path in possible_paths:
        try:
            if path.startswith('python3'):
                result = subprocess.run([path.split()[0], '-m', 'PyInstaller', '--version'], 
                                      capture_output=True, text=True)
            else:
                result = subprocess.run([path, '--version'], 
                                      capture_output=True, text=True)
            if result.returncode == 0:
                pyinstaller_path = path
                print(f"✓ Found PyInstaller: {path}")
                break
        except:
            continue
    
    if not pyinstaller_path:
        print("\n✗ PyInstaller not found!")
        print("Try: python3 -m pip install --user PyInstaller")
        return False
    
    # Build with PyInstaller
    print("\n[1/3] Building executable with PyInstaller...")
    
    try:
        # Use absolute path for templates
        templates_path = str(app_dir / 'templates')
        
        if pyinstaller_path.startswith('python3'):
            build_cmd = [
                'python3', '-m', 'PyInstaller',
                '--name=AxeBench',
                '--onefile',
                '--windowed',
                f'--add-data={templates_path}:templates',
                '--hidden-import=flask',
                '--hidden-import=flask_cors',
                '--hidden-import=requests',
                '--collect-all=flask',
                '--distpath=dist',
                '--workpath=build',
                '--specpath=build',
                '--clean',
                'web_interface.py'
            ]
        else:
            build_cmd = [
                pyinstaller_path,
                '--name=AxeBench',
                '--onefile',
                '--windowed',
                f'--add-data={templates_path}:templates',
                '--hidden-import=flask',
                '--hidden-import=flask_cors',
                '--hidden-import=requests',
                '--collect-all=flask',
                '--distpath=dist',
                '--workpath=build',
                '--specpath=build',
                '--clean',
                'web_interface.py'
            ]
        
        print(f"Running PyInstaller...")
        print(f"Command: {' '.join(build_cmd)}")
        result = subprocess.run(build_cmd, capture_output=False, text=True)
        
        if result.returncode != 0:
            print(f"\n✗ Build failed!")
            return False
        
        print("\n✓ Executable built successfully")
    except Exception as e:
        print(f"✗ Build error: {e}")
        return False
    
    # Verify executable was created
    exe_path = app_dir / 'dist' / 'AxeBench.exe'
    if not exe_path.exists():
        print(f"\n✗ ERROR: AxeBench.exe was not created!")
        print(f"Expected location: {exe_path}")
        return False
    
    print(f"✓ Verified AxeBench.exe exists")
    
    # Create distribution files
    print("\n[2/3] Creating distribution files...")
    try:
        dist_dir = app_dir / 'dist'
        
        # Copy license
        license_file = app_dir / 'LICENSE'
        if license_file.exists():
            (dist_dir / 'LICENSE').write_text(license_file.read_text())
            print("✓ Copied LICENSE")
        
        # Create README
        readme = '''# AxeBench - Mining Management Suite

Official AxeBench application for Windows.

## Installation

1. Extract the AxeBench folder
2. Run AxeBench.exe
3. Open http://localhost:5000 in your browser
4. Login with your Patreon account

## Features

- AxeBench: Benchmark and optimize your Bitaxe devices
- AxeShed: Automated scheduling
- AxePool: Pool management

## System Requirements

- Windows 7 or later
- 100MB free disk space
- Internet connection for Patreon verification

## Support

Visit: https://www.patreon.com/c/AxeBench

## License

See LICENSE file for details.
'''
        (dist_dir / 'README.txt').write_text(readme)
        print("✓ Created README.txt")
        
    except Exception as e:
        print(f"✗ Failed to create distribution files: {e}")
    
    # Summary
    print("\n[3/3] Build complete!")
    print(f"\n✓ SUCCESS!")
    print(f"✓ Executable: {exe_path}")
    print(f"✓ File size: {exe_path.stat().st_size / (1024*1024):.1f} MB")
    print(f"✓ Ready to upload to Patreon!")
    
    return True


def main():
    """Main function"""
    success = build_executable()
    
    if success:
        print("\n" + "=" * 60)
        print("BUILD SUCCESSFUL!")
        print("=" * 60)
        print("\nNext steps:")
        print("1. Test AxeBench.exe locally")
        print("2. Upload to your Patreon posts")
        print("3. Share with your patrons!")
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("BUILD FAILED")
        print("=" * 60)
        sys.exit(1)


if __name__ == '__main__':
    main()
