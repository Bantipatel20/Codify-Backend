#!/bin/bash
# Complete setup script for code compilation environment

echo "🚀 Installing all programming languages and compilers..."

# Update package list
sudo apt update

# Install Python 3
echo "📦 Installing Python 3..."
sudo apt install -y python3 python3-pip

# Install Node.js (JavaScript runtime)
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Install Java Development Kit
echo "📦 Installing Java JDK..."
sudo apt install -y default-jdk

# Install C/C++ compilers
echo "📦 Installing GCC and G++..."
sudo apt install -y gcc g++ build-essential

# Install Go
echo "📦 Installing Go..."
sudo apt install -y golang-go

# Install Ruby
echo "📦 Installing Ruby..."
sudo apt install -y ruby-full

# Install PHP
echo "📦 Installing PHP CLI..."
sudo apt install -y php-cli

# Install additional useful packages
sudo apt install -y curl wget git

echo "✅ Installation complete!"
echo "🔍 Verifying installations..."

# Verify installations
python3 --version
node --version
npm --version
javac -version
java -version
gcc --version
g++ --version
go version
ruby --version
php --version

echo "🎉 All languages installed successfully!"

# Configure PATH and environment variables
echo "🔧 Configuring PATH and environment variables..."

# Backup existing shell configuration
cp ~/.bashrc ~/.bashrc.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
cp ~/.profile ~/.profile.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true

# Function to add to PATH if not already present
add_to_path() {
    local path_to_add="$1"
    if [[ ":$PATH:" != *":$path_to_add:"* ]] && [ -d "$path_to_add" ]; then
        echo "Adding $path_to_add to PATH"
        echo "export PATH=\"$path_to_add:\$PATH\"" >> ~/.bashrc
    fi
}

# Function to set environment variable if not already set
set_env_var() {
    local var_name="$1"
    local var_value="$2"
    if ! grep -q "export $var_name=" ~/.bashrc 2>/dev/null; then
        echo "Setting $var_name=$var_value"
        echo "export $var_name=\"$var_value\"" >> ~/.bashrc
    fi
}

# Add language configuration header to .bashrc
echo "" >> ~/.bashrc
echo "# ===== Code Compilation Environment Configuration =====" >> ~/.bashrc
echo "# Added by setup script on $(date)" >> ~/.bashrc

# Python Configuration
echo "🐍 Configuring Python..."
PYTHON3_PATH=$(which python3 2>/dev/null)
if [ -n "$PYTHON3_PATH" ]; then
    PYTHON_DIR=$(dirname "$PYTHON3_PATH")
    add_to_path "$PYTHON_DIR"
    
    # Create python alias if it doesn't exist
    if ! command -v python &> /dev/null; then
        echo "alias python=python3" >> ~/.bashrc
        echo "alias pip=pip3" >> ~/.bashrc
    fi
    
    # Add user local bin to PATH for pip packages
    add_to_path "$HOME/.local/bin"
fi

# Node.js Configuration
echo "🟢 Configuring Node.js..."
NODE_PATH=$(which node 2>/dev/null)
if [ -n "$NODE_PATH" ]; then
    NODE_DIR=$(dirname "$NODE_PATH")
    add_to_path "$NODE_DIR"
    
    # Add npm global packages to PATH
    NPM_GLOBAL_PATH=$(npm config get prefix 2>/dev/null)/bin
    if [ -d "$NPM_GLOBAL_PATH" ]; then
        add_to_path "$NPM_GLOBAL_PATH"
    fi
fi

# Java Configuration
echo "☕ Configuring Java..."
JAVA_PATH=$(which java 2>/dev/null)
JAVAC_PATH=$(which javac 2>/dev/null)

if [ -n "$JAVA_PATH" ] && [ -n "$JAVAC_PATH" ]; then
    # Find JAVA_HOME
    JAVA_HOME_PATH=$(readlink -f "$JAVAC_PATH" | sed "s:/bin/javac::")
    if [ -d "$JAVA_HOME_PATH" ]; then
        set_env_var "JAVA_HOME" "$JAVA_HOME_PATH"
        add_to_path "$JAVA_HOME_PATH/bin"
    fi
    
    # Alternative JAVA_HOME detection
    if [ -z "$JAVA_HOME_PATH" ] || [ ! -d "$JAVA_HOME_PATH" ]; then
        for java_dir in /usr/lib/jvm/default-java /usr/lib/jvm/java-*-openjdk*; do
            if [ -d "$java_dir" ]; then
                set_env_var "JAVA_HOME" "$java_dir"
                add_to_path "$java_dir/bin"
                break
            fi
        done
    fi
fi

# GCC/G++ Configuration
echo "🔧 Configuring GCC/G++..."
GCC_PATH=$(which gcc 2>/dev/null)
if [ -n "$GCC_PATH" ]; then
    GCC_DIR=$(dirname "$GCC_PATH")
    add_to_path "$GCC_DIR"
fi

# Go Configuration
echo "🔷 Configuring Go..."
GO_PATH=$(which go 2>/dev/null)
if [ -n "$GO_PATH" ]; then
    GO_DIR=$(dirname "$GO_PATH")
    add_to_path "$GO_DIR"
    
    # Set GOPATH and GOROOT
    GO_ROOT=$(go env GOROOT 2>/dev/null)
    if [ -n "$GO_ROOT" ]; then
        set_env_var "GOROOT" "$GO_ROOT"
    fi
    
    # Set default GOPATH if not set
    if [ ! -d "$HOME/go" ]; then
        mkdir -p "$HOME/go"
    fi
    set_env_var "GOPATH" "$HOME/go"
    add_to_path "$HOME/go/bin"
fi

# Ruby Configuration
echo "💎 Configuring Ruby..."
RUBY_PATH=$(which ruby 2>/dev/null)
if [ -n "$RUBY_PATH" ]; then
    RUBY_DIR=$(dirname "$RUBY_PATH")
    add_to_path "$RUBY_DIR"
    
    # Add gem bin directory to PATH
    GEM_HOME=$(gem environment gemdir 2>/dev/null)/bin
    if [ -d "$GEM_HOME" ]; then
        add_to_path "$GEM_HOME"
    fi
    
    # Add user gem directory to PATH
    USER_GEM_HOME="$HOME/.gem/ruby/$(ruby -e 'puts RUBY_VERSION' 2>/dev/null)/bin"
    if [ -d "$USER_GEM_HOME" ]; then
        add_to_path "$USER_GEM_HOME"
    fi
fi

# PHP Configuration
echo "🐘 Configuring PHP..."
PHP_PATH=$(which php 2>/dev/null)
if [ -n "$PHP_PATH" ]; then
    PHP_DIR=$(dirname "$PHP_PATH")
    add_to_path "$PHP_DIR"
    
    # Add composer global bin to PATH if composer is installed
    if command -v composer &> /dev/null; then
        COMPOSER_HOME="$HOME/.composer/vendor/bin"
        add_to_path "$COMPOSER_HOME"
    fi
fi

# Additional PATH configurations
echo "🔧 Adding additional useful paths..."

# Add /usr/local/bin if it exists (common for manually installed software)
add_to_path "/usr/local/bin"

# Add /opt/bin if it exists
add_to_path "/opt/bin"

# Add current user's bin directory
if [ ! -d "$HOME/bin" ]; then
    mkdir -p "$HOME/bin"
fi
add_to_path "$HOME/bin"

# End configuration section
echo "# ===== End Code Compilation Environment Configuration =====" >> ~/.bashrc
echo "" >> ~/.bashrc

# Make the changes available in current session
echo "🔄 Reloading shell configuration..."
source ~/.bashrc
