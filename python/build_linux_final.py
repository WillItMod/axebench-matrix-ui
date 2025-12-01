#!/usr/bin/env python3
"""
AxeBench Linux Build Script
Creates a standalone Linux executable with UPX compression and integrity verification
"""

import os
import sys
import subprocess
from pathlib import Path

def build_executable():
    """Build Linux executable"""
    
    print("=" * 60)
    print("AxeBench Linux Build Script")
    print("=" * 60)
    
    # Get the current directory (should be axebench folder)
    app_dir = Path.cwd()
    
    print(f"\nBuilding from: {app_dir}")
    
    # Check if we're in the right directory
    if not (app_dir / 'launcher.py').exists():
        print("\n✗ ERROR: launcher.py not found!")
        print(f"Make sure you're in the axebench directory")
        print(f"Current directory: {app_dir}")
        return False
    
    print("✓ Found launcher.py")
    
    # Check for required app files
    required_files = ['web_interface.py', 'axeshed.py', 'axepool.py']
    for file in required_files:
        if not (app_dir / file).exists():
            print(f"\n✗ ERROR: {file} not found!")
            return False
    
    print("✓ Found all app files (web_interface.py, axeshed.py, axepool.py)")
    
    # Check for templates folder
    if not (app_dir / 'templates').exists():
        print("\n✗ ERROR: templates folder not found!")
        print(f"Make sure templates folder exists in: {app_dir}")
        return False
    
    print("✓ Found templates folder")
    
    # Check for UPX (optional compression)
    upx_available = False
    try:
        result = subprocess.run(['upx', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            upx_available = True
            print("✓ Found UPX (will compress executable)")
    except:
        print("Note: UPX not found (optional, for compression)")
    
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
    print("\n[1/3] Building Linux executable with PyInstaller...")
    
    try:
        # Use absolute path for templates
        templates_path = str(app_dir / 'templates')
        
        if pyinstaller_path.startswith('python3'):
            build_cmd = [
                'python3', '-m', 'PyInstaller',
                '--name=axebench',
                '--onefile',
                f'--add-data={templates_path}:templates',
                '--hidden-import=flask',
                '--hidden-import=flask_cors',
                '--hidden-import=requests',
                '--collect-all=flask',
                '--distpath=dist',
                '--workpath=build',
                '--specpath=build',
                '--clean',
            ]
            if upx_available:
                build_cmd.append('--upx-dir=/usr/bin')
            build_cmd.append('launcher.py')
        else:
            build_cmd = [
                pyinstaller_path,
                '--name=axebench',
                '--onefile',
                f'--add-data={templates_path}:templates',
                '--hidden-import=flask',
                '--hidden-import=flask_cors',
                '--hidden-import=requests',
                '--hidden-import=axeshed',
                '--hidden-import=axepool',
                '--collect-all=flask',
                '--distpath=dist',
                '--workpath=build',
                '--specpath=build',
                '--clean',
            ]
            if upx_available:
                build_cmd.append('--upx-dir=/usr/bin')
            build_cmd.append('launcher.py')
        
        print(f"Running PyInstaller...")
        result = subprocess.run(build_cmd, capture_output=False, text=True)
        
        if result.returncode != 0:
            print(f"\n✗ Build failed!")
            return False
        
        print("\n✓ Executable built successfully")
    except Exception as e:
        print(f"✗ Build error: {e}")
        return False
    
    # Verify executable was created
    exe_path = app_dir / 'dist' / 'axebench'
    if not exe_path.exists():
        print(f"\n✗ ERROR: axebench executable was not created!")
        print(f"Expected location: {exe_path}")
        return False
    
    print(f"✓ Verified axebench executable exists")
    
    # Set executable permissions
    print("\n[2/3] Setting executable permissions...")
    try:
        os.chmod(exe_path, 0o755)
        print("✓ Executable permissions set")
    except Exception as e:
        print(f"✗ Failed to set permissions: {e}")
    
    # Create distribution files
    print("\n[4/4] Creating distribution files...")
    try:
        dist_dir = app_dir / 'dist'
        
        # Copy license
        license_file = app_dir / 'LICENSE'
        if license_file.exists():
            (dist_dir / 'LICENSE').write_text(license_file.read_text())
            print("✓ Copied LICENSE")
        
        # Create README
        readme = '''# AxeBench - Mining Management Suite for Linux

Official AxeBench application for Linux.

## Installation

1. Extract the axebench folder
2. Make the executable: `chmod +x axebench`
3. Run: `./axebench`
4. Open http://localhost:5000 in your browser
5. Login with your Patreon account

## Features

- AxeBench: Benchmark and optimize your Bitaxe devices
- AxeShed: Automated scheduling
- AxePool: Pool management

## System Requirements

- Linux (Ubuntu 18.04+, Debian 10+, Fedora, etc.)
- 100MB free disk space
- Internet connection for Patreon verification

## Running the App

```bash
./axebench
```

This will automatically start all three services:
- AxeBench on http://localhost:5000
- AxeShed on http://localhost:5001
- AxePool on http://localhost:5002

Then open http://localhost:5000 in your web browser to get started.

## Support

Visit: https://www.patreon.com/c/AxeBench

## License

See LICENSE file for details.
'''
        (dist_dir / 'README.txt').write_text(readme)
        print("✓ Created README.txt")
        
    except Exception as e:
        print(f"✗ Failed to create distribution files: {e}")
    
    # Create tar.gz archive
    print("\nCreating tar.gz archive...")
    try:
        archive_name = 'axebench-linux.tar.gz'
        archive_path = app_dir.parent / archive_name
        
        result = subprocess.run([
            'tar', '-czf',
            str(archive_path),
            '-C', str(dist_dir),
            '.'
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"✓ Archive created: {archive_name}")
            print(f"  Location: {archive_path}")
            
            # Create SHA256 checksum
            print("\n[4/4] Creating integrity checksum...")
            try:
                result = subprocess.run([
                    'sha256sum',
                    str(archive_path)
                ], capture_output=True, text=True)
                
                if result.returncode == 0:
                    checksum_file = app_dir.parent / 'axebench-linux.tar.gz.sha256'
                    checksum_file.write_text(result.stdout)
                    print(f"✓ Checksum created: axebench-linux.tar.gz.sha256")
                    print(f"  Users can verify with: sha256sum -c axebench-linux.tar.gz.sha256")
            except Exception as e:
                print(f"Note: Could not create checksum: {e}")
        else:
            print(f"Note: Could not create tar.gz archive")
            print(f"But your executable is ready in: {dist_dir}")
    except Exception as e:
        print(f"Note: Could not create tar.gz (tar command may not be available)")
        print(f"But your executable is ready in: {dist_dir}")
    
    # Summary
    print("\n" + "=" * 60)
    print("✓ BUILD COMPLETE!")
    print("=" * 60)
    print(f"\n✓ Executable: {exe_path}")
    print(f"✓ File size: {exe_path.stat().st_size / (1024*1024):.1f} MB")
    if upx_available:
        print(f"✓ Executable compressed with UPX")
    print(f"✓ Ready to upload to Patreon!")
    
    # Show checksum info
    checksum_file = app_dir.parent / 'axebench-linux.tar.gz.sha256'
    if checksum_file.exists():
        print(f"\n✓ Checksum file created for integrity verification")
        print(f"  Share both files with your patrons:")
        print(f"  - axebench-linux.tar.gz")
        print(f"  - axebench-linux.tar.gz.sha256")
    
    return True


def main():
    """Main function"""
    success = build_executable()
    
    if success:
        print("\nNext steps:")
        print("1. Test the executable locally: ./dist/axebench")
        print("2. Upload axebench-linux.tar.gz to your Patreon posts")
        print("3. Also upload axebench-linux.tar.gz.sha256 for integrity verification")
        print("4. Tell patrons they can verify the file with: sha256sum -c axebench-linux.tar.gz.sha256")
        print("5. Share with your patrons!")
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("BUILD FAILED")
        print("=" * 60)
        sys.exit(1)


if __name__ == '__main__':
    main()
