"""
AxeBench Security Manager - Encryption, Obfuscation, and Anti-Tampering
Fixed version for compatibility with older cryptography versions
"""

import os
import json
import hashlib
import hmac
import time
import logging
from pathlib import Path
from typing import Dict, Any, Optional

try:
    from cryptography.fernet import Fernet
except ImportError:
    Fernet = None

logger = logging.getLogger(__name__)

# Security configuration
SECURITY_KEY = os.environ.get('AXEBENCH_SECURITY_KEY', 'axebench-security-key-2024')
INTEGRITY_CHECK_FILE = Path.home() / '.bitaxe-benchmark' / '.integrity'
CRITICAL_FILES = [
    'licensing.py',
    'web_interface.py',
    'config.py',
    'device_manager.py'
]


class SecurityManager:
    """Handles encryption, integrity checking, and anti-tampering"""
    
    def __init__(self):
        self.security_dir = Path.home() / '.bitaxe-benchmark'
        self.security_dir.mkdir(parents=True, exist_ok=True)
        self._generate_encryption_key()
    
    def _generate_encryption_key(self):
        """Generate encryption key from security key"""
        try:
            if Fernet is None:
                logger.warning("Cryptography module not available - using basic encryption")
                self.cipher_suite = None
                return
            
            # Simple key derivation for compatibility
            import base64
            key_material = (SECURITY_KEY * 4).encode()[:32]
            key = base64.urlsafe_b64encode(key_material)
            self.cipher_suite = Fernet(key)
        except Exception as e:
            logger.error(f"Failed to generate encryption key: {e}")
            self.cipher_suite = None
    
    def encrypt_data(self, data: Dict[str, Any]) -> str:
        """Encrypt sensitive data"""
        try:
            json_data = json.dumps(data)
            
            if self.cipher_suite is None:
                # Fallback: basic encoding if cryptography not available
                import base64
                return base64.b64encode(json_data.encode()).decode()
            
            encrypted = self.cipher_suite.encrypt(json_data.encode())
            return encrypted.decode()
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            # Return as-is if encryption fails
            return json.dumps(data)
    
    def decrypt_data(self, encrypted_data: str) -> Dict[str, Any]:
        """Decrypt sensitive data"""
        try:
            if self.cipher_suite is None:
                # Fallback: basic decoding if cryptography not available
                import base64
                try:
                    decoded = base64.b64decode(encrypted_data.encode()).decode()
                    return json.loads(decoded)
                except:
                    return json.loads(encrypted_data)
            
            decrypted = self.cipher_suite.decrypt(encrypted_data.encode())
            return json.loads(decrypted.decode())
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            try:
                return json.loads(encrypted_data)
            except:
                return {}
    
    def calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of a file"""
        try:
            sha256_hash = hashlib.sha256()
            with open(file_path, 'rb') as f:
                for byte_block in iter(lambda: f.read(4096), b''):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate hash for {file_path}: {e}")
            return ""
    
    def generate_integrity_signature(self, app_dir: Path) -> Dict[str, str]:
        """Generate integrity signatures for critical files"""
        signatures = {}
        for filename in CRITICAL_FILES:
            file_path = app_dir / filename
            if file_path.exists():
                signatures[filename] = self.calculate_file_hash(file_path)
            else:
                logger.warning(f"Critical file not found: {filename}")
        
        # Add timestamp to prevent replay attacks
        signatures['timestamp'] = str(int(time.time()))
        
        return signatures
    
    def verify_integrity(self, app_dir: Path, stored_signatures: Dict[str, str]) -> bool:
        """Verify that critical files haven't been modified"""
        try:
            for filename in CRITICAL_FILES:
                file_path = app_dir / filename
                if not file_path.exists():
                    logger.error(f"Critical file missing: {filename}")
                    return False
                
                current_hash = self.calculate_file_hash(file_path)
                stored_hash = stored_signatures.get(filename, '')
                
                if current_hash != stored_hash:
                    logger.error(f"File integrity check failed for {filename}")
                    logger.error(f"Expected: {stored_hash}")
                    logger.error(f"Got: {current_hash}")
                    return False
            
            return True
        except Exception as e:
            logger.error(f"Integrity verification error: {e}")
            return False
    
    def save_integrity_check(self, signatures: Dict[str, str]):
        """Save integrity signatures to disk"""
        try:
            encrypted = self.encrypt_data(signatures)
            with open(INTEGRITY_CHECK_FILE, 'w') as f:
                f.write(encrypted)
            logger.info("Integrity signatures saved")
        except Exception as e:
            logger.error(f"Failed to save integrity check: {e}")
    
    def load_integrity_check(self) -> Optional[Dict[str, str]]:
        """Load integrity signatures from disk"""
        try:
            if INTEGRITY_CHECK_FILE.exists():
                with open(INTEGRITY_CHECK_FILE, 'r') as f:
                    encrypted = f.read()
                return self.decrypt_data(encrypted)
        except Exception as e:
            logger.warning(f"Failed to load integrity check: {e}")
        return None
    
    def verify_startup(self, app_dir: Path) -> bool:
        """Verify app integrity on startup"""
        logger.info("Performing startup integrity check...")
        
        stored_signatures = self.load_integrity_check()
        if not stored_signatures:
            logger.warning("No integrity signatures found - generating new ones")
            signatures = self.generate_integrity_signature(app_dir)
            self.save_integrity_check(signatures)
            return True
        
        # Verify integrity
        if not self.verify_integrity(app_dir, stored_signatures):
            logger.error("CRITICAL: App integrity check failed!")
            logger.error("Files may have been tampered with.")
            return False
        
        logger.info("Startup integrity check passed")
        return True
    
    def create_license_signature(self, license_data: Dict[str, Any]) -> str:
        """Create HMAC signature for license data"""
        try:
            data_str = json.dumps(license_data, sort_keys=True)
            signature = hmac.new(
                SECURITY_KEY.encode(),
                data_str.encode(),
                hashlib.sha256
            ).hexdigest()
            return signature
        except Exception as e:
            logger.error(f"Failed to create license signature: {e}")
            return ""
    
    def verify_license_signature(self, license_data: Dict[str, Any], signature: str) -> bool:
        """Verify HMAC signature for license data"""
        try:
            expected_signature = self.create_license_signature(license_data)
            return hmac.compare_digest(signature, expected_signature)
        except Exception as e:
            logger.error(f"Failed to verify license signature: {e}")
            return False


# Global instance
_security_manager: Optional[SecurityManager] = None


def get_security_manager() -> SecurityManager:
    """Get the global security manager instance"""
    global _security_manager
    if _security_manager is None:
        _security_manager = SecurityManager()
    return _security_manager
