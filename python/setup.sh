#!/bin/bash
# Setup script for Bitaxe Benchmark Pro

set -e

echo "========================================="
echo "Bitaxe Benchmark Pro - Setup"
echo "========================================="
echo

# Check Python version
echo "Checking Python version..."
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Found Python $python_version"

# Check if Python is 3.8+
required_version="3.8"
if ! python3 -c "import sys; exit(0 if sys.version_info >= (3,8) else 1)"; then
    echo "Error: Python 3.8 or higher is required"
    exit 1
fi

# Create virtual environment
echo
echo "Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "Activating virtual environment..."
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    source venv/Scripts/activate
else
    source venv/bin/activate
fi

# Upgrade pip
echo
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo
echo "Installing dependencies..."
pip install -r requirements.txt

# Create config directory
echo
echo "Setting up configuration directory..."
mkdir -p ~/.bitaxe-benchmark/sessions

# Create example device config
echo
echo "Creating example configuration..."
cat > ~/.bitaxe-benchmark/devices.json.example <<EOF
[
  {
    "name": "My Bitaxe",
    "ip_address": "192.168.1.100",
    "model": "supra"
  }
]
EOF

# Create launcher scripts
echo
echo "Creating launcher scripts..."

# Linux/Mac launcher
cat > run_benchmark.sh <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
python bitaxe_benchmark_pro.py "$@"
EOF
chmod +x run_benchmark.sh

# Windows launcher
cat > run_benchmark.bat <<'EOF'
@echo off
cd /d "%~dp0"
call venv\Scripts\activate
python bitaxe_benchmark_pro.py %*
EOF

# Web interface launcher (Linux/Mac)
cat > run_web.sh <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate
python web_interface.py
EOF
chmod +x run_web.sh

# Web interface launcher (Windows)
cat > run_web.bat <<'EOF'
@echo off
cd /d "%~dp0"
call venv\Scripts\activate
python web_interface.py
EOF

echo
echo "========================================="
echo "Setup Complete! ✓"
echo "========================================="
echo
echo "Next steps:"
echo "1. Add your Bitaxe device:"
echo "   ./run_benchmark.sh add-device \"My Bitaxe\" <IP_ADDRESS> --model supra"
echo
echo "2. Run a quick test:"
echo "   ./run_benchmark.sh benchmark \"My Bitaxe\" --preset quick_test"
echo
echo "3. Or start the web interface:"
echo "   ./run_web.sh"
echo "   Then open http://localhost:5000 in your browser"
echo
echo "Configuration directory: ~/.bitaxe-benchmark/"
echo "See README.md for full documentation"
echo
