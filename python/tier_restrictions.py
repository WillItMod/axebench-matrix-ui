"""
Tier-based feature restrictions for AxeBench
Controls which features are available based on subscription tier
"""

import os
from licensing import get_licensing

# Test/Development mode - set AXEBENCH_TEST_MODE=1 to bypass tier restrictions
TEST_MODE = os.environ.get('AXEBENCH_TEST_MODE', '0') == '1'


class TierRestrictions:
    """Manage feature access based on subscription tier"""
    
    # Define which features are available per tier
    # Free tier gets everything (with nag), paid tiers remove the nag
    TIER_FEATURES = {
        'free': {
            'axebench': True,      # Full AxeBench access
            'axeshed': True,       # Full scheduling access
            'axepool': True,       # Full pool management
            'device_limit': 5,
            'priority_support': False,
            'show_nag': True,      # Show nag screen
        },
        'premium': {
            'axebench': True,
            'axeshed': True,
            'axepool': True,
            'device_limit': 25,
            'priority_support': False,
            'show_nag': False,     # No nag for paid users
        },
        'ultimate': {
            'axebench': True,
            'axeshed': True,
            'axepool': True,
            'device_limit': 250,
            'priority_support': True,
            'show_nag': False,
        }
    }
    
    @staticmethod
    def get_tier_features(tier: str = None) -> dict:
        """Get available features for a tier"""
        if tier is None:
            licensing = get_licensing()
            tier = licensing.get_status().get('tier_level', 'basic')
        
        return TierRestrictions.TIER_FEATURES.get(tier, TierRestrictions.TIER_FEATURES['free'])
    
    @staticmethod
    def can_use_feature(feature: str, tier: str = None) -> bool:
        """Check if a feature is available for the tier"""
        # In test mode, all features are available
        if TEST_MODE:
            return True
        
        features = TierRestrictions.get_tier_features(tier)
        return features.get(feature, False)
    
    @staticmethod
    def get_device_limit(tier: str = None) -> int:
        """Get device limit for tier"""
        features = TierRestrictions.get_tier_features(tier)
        return features.get('device_limit', 1)
    
    @staticmethod
    def get_tier_info() -> dict:
        """Get current user's tier info"""
        licensing = get_licensing()
        status = licensing.get_status()
        tier = status.get('tier', 'free')
        features = TierRestrictions.get_tier_features(tier)
        
        return {
            'tier': tier,
            'authenticated': status.get('authenticated', False),
            'is_patron': status.get('is_patron', False),
            'features': features,
            'device_limit': features.get('device_limit', 1),
            'current_devices': status.get('current_devices', 0),
            'patron_name': status.get('patron_name', 'Guest'),
        }


def require_feature(feature: str):
    """
    Decorator to check feature access - now allows all users.
    Free tier gets everything with nag shown on frontend.
    """
    from functools import wraps
    from flask import jsonify
    
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # All features available to all users
            # Nag is handled by frontend based on tier
            return f(*args, **kwargs)
        
        return decorated_function
    
    return decorator
