"""
AxeBench Licensing - Patreon OAuth Integration

This module handles Patreon authentication and patron status verification.
Free users get all features but see a nag screen. Patrons get a clean experience.
"""

import os
import json
import time
import logging
import requests
import hashlib
import base64
from pathlib import Path
from typing import Optional, Dict, Any
from dataclasses import dataclass
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

# ============================================================================
# PATREON CONFIGURATION - UPDATE THESE WITH YOUR CREDENTIALS
# ============================================================================
PATREON_CLIENT_ID = os.environ.get('PATREON_CLIENT_ID', 'bUJUvEGhsEelfg8lSi8p1HhEXwOqL6P-PT5eM7uPl8dBaWm1GazPxydCd9btImwd')
PATREON_CLIENT_SECRET = os.environ.get('PATREON_CLIENT_SECRET', 'jEYsOVf2Dt4qppOGy2i_kJeKMiCQTFDm1v_5JPp8bUBZYv1kU97El4VyNn4FNT6e')
PATREON_CREATOR_ID = os.environ.get('PATREON_CREATOR_ID', '101065059')
PATREON_REDIRECT_URI = os.environ.get('PATREON_REDIRECT_URI', 'http://localhost:5000/auth/patreon/callback')

# Tier IDs for device limits
PATREON_TIER_IDS = {
    'premium': os.environ.get('PATREON_TIER_PREMIUM_ID', '27377307'),  # £1/month - 25 devices
    'ultimate': os.environ.get('PATREON_TIER_ULTIMATE_ID', '27377339') # £5/month - 250 devices
}

# Device limits per tier
DEVICE_LIMITS = {
    'free': 5,        # Free tier - 5 devices with nag
    'premium': 25,    # £1/month - 25 devices, no nag
    'ultimate': 250   # £5/month - 250 devices, priority support
}

# ============================================================================
# Patreon OAuth URLs
# ============================================================================
PATREON_AUTH_URL = 'https://www.patreon.com/oauth2/authorize'
PATREON_TOKEN_URL = 'https://www.patreon.com/api/oauth2/token'
PATREON_IDENTITY_URL = 'https://www.patreon.com/api/oauth2/v2/identity'
PATREON_MEMBERS_URL = 'https://www.patreon.com/api/oauth2/v2/campaigns/{campaign_id}/members'

# Local storage for license data
LICENSE_DIR = Path.home() / '.bitaxe-benchmark'
LICENSE_FILE = LICENSE_DIR / 'license.json'


def _get_encryption_key() -> bytes:
    """Generate a consistent encryption key based on machine ID"""
    try:
        # Try to get machine ID from /etc/machine-id (Linux)
        if Path('/etc/machine-id').exists():
            machine_id = Path('/etc/machine-id').read_text().strip()
        # Fallback: use hostname + home directory
        else:
            import socket
            machine_id = socket.gethostname() + str(Path.home())
        
        # Derive a 32-byte key from the machine ID
        key_material = hashlib.sha256(machine_id.encode()).digest()
        # Fernet requires a base64-encoded 32-byte key
        encryption_key = base64.urlsafe_b64encode(key_material)
        return encryption_key
    except Exception as e:
        logger.warning(f"Could not generate encryption key: {e}")
        # Fallback: use a default key (not ideal, but better than no encryption)
        return base64.urlsafe_b64encode(b'axebench-default-key-do-not-use!!')


def _encrypt_data(data: str) -> str:
    """Encrypt data using Fernet"""
    try:
        key = _get_encryption_key()
        cipher = Fernet(key)
        encrypted = cipher.encrypt(data.encode())
        return encrypted.decode()
    except Exception as e:
        logger.error(f"Encryption failed: {e}")
        return data  # Return unencrypted as fallback


def _decrypt_data(encrypted_data: str) -> str:
    """Decrypt data using Fernet"""
    try:
        key = _get_encryption_key()
        cipher = Fernet(key)
        decrypted = cipher.decrypt(encrypted_data.encode())
        return decrypted.decode()
    except Exception as e:
        logger.warning(f"Decryption failed: {e}")
        # If decryption fails, try to return as plain text (for backwards compatibility)
        return encrypted_data


@dataclass
class PatronStatus:
    """Represents the user's Patreon status"""
    is_patron: bool = False
    patron_name: str = ''
    patron_email: str = ''
    pledge_amount: int = 0  # cents
    tier_title: str = ''
    tier_id: str = ''
    tier_level: str = 'free'  # 'free', 'premium', 'ultimate'
    device_limit: int = 5
    expires_at: float = 0  # Unix timestamp
    error: str = ''
    
    def is_valid(self) -> bool:
        """Check if patron status is valid and not expired"""
        # Status valid for 24 hours
        return time.time() < self.expires_at
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'is_patron': self.is_patron,
            'patron_name': self.patron_name,
            'patron_email': self.patron_email,
            'pledge_amount': self.pledge_amount,
            'tier_title': self.tier_title,
            'tier_id': self.tier_id,
            'tier_level': self.tier_level,
            'device_limit': self.device_limit,
            'expires_at': self.expires_at,
            'error': self.error
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PatronStatus':
        return cls(
            is_patron=data.get('is_patron', False),
            patron_name=data.get('patron_name', ''),
            patron_email=data.get('patron_email', ''),
            pledge_amount=data.get('pledge_amount', 0),
            tier_title=data.get('tier_title', ''),
            tier_id=data.get('tier_id', ''),
            tier_level=data.get('tier_level', 'free'),
            device_limit=data.get('device_limit', 5),
            expires_at=data.get('expires_at', 0),
            error=data.get('error', '')
        )


class PatreonLicensing:
    """Handles Patreon OAuth and patron verification"""
    
    def __init__(self):
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.token_expires: float = 0
        self.patron_status = PatronStatus(expires_at=time.time() + 86400)
        
        # Ensure license directory exists
        LICENSE_DIR.mkdir(parents=True, exist_ok=True)
        
        # Load saved license data
        self._load_license()
    
    def _load_license(self):
        """Load saved license data from disk"""
        try:
            if LICENSE_FILE.exists():
                encrypted_content = LICENSE_FILE.read_text()
                decrypted_content = _decrypt_data(encrypted_content)
                data = json.loads(decrypted_content)
                self.access_token = data.get('access_token')
                self.refresh_token = data.get('refresh_token')
                self.token_expires = data.get('token_expires', 0)
                patron_data = data.get('patron_status', {})
                patron_data['expires_at'] = time.time() + 86400
                self.patron_status = PatronStatus.from_dict(patron_data)
                logger.info(f"Loaded license data for {self.patron_status.patron_name or 'unknown user'}")
        except Exception as e:
            logger.warning(f"Could not load license data: {e}")
    
    def _save_license(self):
        """Save license data to disk (encrypted)"""
        try:
            data = {
                'access_token': self.access_token,
                'refresh_token': self.refresh_token,
                'token_expires': self.token_expires,
                'patron_status': self.patron_status.to_dict()
            }
            json_data = json.dumps(data, indent=2)
            encrypted_data = _encrypt_data(json_data)
            LICENSE_FILE.write_text(encrypted_data)
            logger.info("Saved license data (encrypted)")
        except Exception as e:
            logger.error(f"Could not save license data: {e}")
    
    def is_configured(self) -> bool:
        """Check if Patreon credentials are configured"""
        return bool(PATREON_CLIENT_ID and PATREON_CLIENT_SECRET and PATREON_CREATOR_ID)
    
    def get_auth_url(self, state: str = '') -> str:
        """Get the Patreon OAuth authorization URL"""
        params = {
            'response_type': 'code',
            'client_id': PATREON_CLIENT_ID,
            'redirect_uri': PATREON_REDIRECT_URI,
            'scope': 'identity identity.memberships',
            'state': state
        }
        query = '&'.join(f'{k}={requests.utils.quote(str(v))}' for k, v in params.items())
        return f'{PATREON_AUTH_URL}?{query}'
    
    def exchange_code(self, code: str) -> bool:
        """Exchange authorization code for access token"""
        try:
            # Always use the default localhost redirect URI that's registered with Patreon
            response = requests.post(PATREON_TOKEN_URL, data={
                'code': code,
                'grant_type': 'authorization_code',
                'client_id': PATREON_CLIENT_ID,
                'client_secret': PATREON_CLIENT_SECRET,
                'redirect_uri': PATREON_REDIRECT_URI
            })
            
            if response.status_code != 200:
                logger.error(f"Token exchange failed: {response.text}")
                self.patron_status.error = 'Failed to authenticate with Patreon'
                return False
            
            data = response.json()
            self.access_token = data.get('access_token')
            self.refresh_token = data.get('refresh_token')
            self.token_expires = time.time() + data.get('expires_in', 2592000)  # Default 30 days
            
            # Verify patron status
            if self.verify_patron_status():
                self._save_license()
                return True
            return False
            
        except Exception as e:
            logger.error(f"Token exchange error: {e}")
            self.patron_status.error = str(e)
            return False
    
    def refresh_access_token(self) -> bool:
        """Refresh the access token using refresh token"""
        if not self.refresh_token:
            return False
        
        try:
            response = requests.post(PATREON_TOKEN_URL, data={
                'grant_type': 'refresh_token',
                'refresh_token': self.refresh_token,
                'client_id': PATREON_CLIENT_ID,
                'client_secret': PATREON_CLIENT_SECRET
            })
            
            if response.status_code != 200:
                logger.error(f"Token refresh failed: {response.text}")
                return False
            
            data = response.json()
            self.access_token = data.get('access_token')
            self.refresh_token = data.get('refresh_token', self.refresh_token)
            self.token_expires = time.time() + data.get('expires_in', 2592000)
            
            self._save_license()
            return True
            
        except Exception as e:
            logger.error(f"Token refresh error: {e}")
            return False
    
    def _get_tier_level(self, tier_id: str) -> str:
        """Determine tier level from tier ID"""
        if tier_id == PATREON_TIER_IDS.get('ultimate'):
            return 'ultimate'
        elif tier_id == PATREON_TIER_IDS.get('premium'):
            return 'premium'
        return 'free'
    
    def verify_patron_status(self) -> bool:
        """Check if the user is an active patron at the required tier"""
        if not self.access_token:
            self.patron_status = PatronStatus(
                expires_at=time.time() + 86400,
                error='Not authenticated'
            )
            return False
        
        # Check if token needs refresh
        if time.time() > self.token_expires - 3600:  # Refresh if <1 hour left
            if self.refresh_token:
                self.refresh_access_token()
        
        try:
            headers = {'Authorization': f'Bearer {self.access_token}'}
            
            # Get user identity with memberships
            response = requests.get(
                PATREON_IDENTITY_URL,
                headers=headers,
                params={
                    'include': 'memberships,memberships.campaign,memberships.currently_entitled_tiers',
                    'fields[user]': 'full_name,email',
                    'fields[member]': 'patron_status,currently_entitled_amount_cents,campaign_lifetime_support_cents',
                    'fields[tier]': 'title,amount_cents'
                }
            )
            
            if response.status_code != 200:
                logger.error(f"Identity fetch failed: {response.text}")
                self.patron_status = PatronStatus(
                    expires_at=time.time() + 86400,
                    error='Failed to verify Patreon status'
                )
                return False
            
            data = response.json()
            user_data = data.get('data', {})
            user_attrs = user_data.get('attributes', {})
            included = data.get('included', [])
            
            # Extract user info
            patron_name = user_attrs.get('full_name', '')
            patron_email = user_attrs.get('email', '')
            
            # Find membership for our campaign
            is_active_patron = False
            pledge_amount = 0
            tier_title = ''
            tier_id = ''
            tier_level = 'free'
            device_limit = DEVICE_LIMITS.get('free', 5)
            
            for item in included:
                if item.get('type') == 'member':
                    member_attrs = item.get('attributes', {})
                    
                    # Check if this is an active patron
                    if member_attrs.get('patron_status') == 'active_patron':
                        pledge_amount = member_attrs.get('currently_entitled_amount_cents', 0)
                        
                        # Get tier name and ID
                        relationships = item.get('relationships', {})
                        tiers = relationships.get('currently_entitled_tiers', {}).get('data', [])
                        if tiers:
                            tier_id = tiers[0].get('id')
                            for inc in included:
                                if inc.get('type') == 'tier' and inc.get('id') == tier_id:
                                    tier_title = inc.get('attributes', {}).get('title', '')
                                    break
                        
                        # Determine tier level and device limit
                        tier_level = self._get_tier_level(tier_id)
                        device_limit = DEVICE_LIMITS.get(tier_level, 5)
                        is_active_patron = True
            
            self.patron_status = PatronStatus(
                is_patron=is_active_patron,
                patron_name=patron_name,
                patron_email=patron_email,
                pledge_amount=pledge_amount,
                tier_title=tier_title,
                tier_id=tier_id,
                tier_level=tier_level,
                device_limit=device_limit,
                expires_at=time.time() + 86400  # Valid for 24 hours
            )
            
            self._save_license()
            
            if is_active_patron:
                logger.info(f"Verified patron: {patron_name} ({tier_title}, ${pledge_amount/100:.2f}/mo, {device_limit} devices)")
            else:
                logger.info(f"User {patron_name} is not an active patron")
            
            return is_active_patron
            
        except Exception as e:
            logger.error(f"Patron verification error: {e}")
            self.patron_status = PatronStatus(
                expires_at=time.time() + 86400,
                error=str(e)
            )
            return False
    
    def get_status(self) -> Dict[str, Any]:
        """Get current license/patron status for UI"""
        # Always reload license from disk to ensure we have the latest data
        # This is critical for AxePool/AxeShed running on different ports
        self._load_license()
        
        # Check if we need to re-verify
        if self.access_token and not self.patron_status.is_valid():
            self.verify_patron_status()
        
        # User is authenticated if they have a valid patron status (even if token expired)
        # This allows AxeShed/AxePool to work when accessed from different ports
        is_authenticated = bool(self.access_token) or (self.patron_status.is_patron and self.patron_status.is_valid())
        
        return {
            'configured': self.is_configured(),
            'authenticated': is_authenticated,
            'is_patron': self.patron_status.is_patron,
            'patron_name': self.patron_status.patron_name,
            'tier': self.patron_status.tier_title,
            'tier_level': self.patron_status.tier_level,
            'pledge_amount': self.patron_status.pledge_amount / 100 if self.patron_status.pledge_amount else 0,
            'device_limit': self.patron_status.device_limit,
            'error': self.patron_status.error,
            'auth_url': self.get_auth_url() if self.is_configured() else None
        }
    
    def get_device_limit(self) -> int:
        """Get the device limit for the current user"""
        return self.patron_status.device_limit
    
    def logout(self):
        """Clear saved license data"""
        self.access_token = None
        self.refresh_token = None
        self.token_expires = 0
        self.patron_status = PatronStatus(expires_at=time.time() + 86400)
        
        try:
            if LICENSE_FILE.exists():
                LICENSE_FILE.unlink()
            logger.info("License data cleared")
        except Exception as e:
            logger.error(f"Could not clear license data: {e}")


# Global instance
_licensing: Optional[PatreonLicensing] = None


def get_licensing() -> PatreonLicensing:
    """Get the global licensing instance"""
    global _licensing
    if _licensing is None:
        _licensing = PatreonLicensing()
    return _licensing
