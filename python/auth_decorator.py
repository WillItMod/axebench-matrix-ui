"""
Authentication decorator for AxeBench
Protects API endpoints to require Patreon login
"""

from functools import wraps
from flask import jsonify
from licensing import get_licensing


def require_patreon_auth(f):
    """
    Decorator for API endpoints - allows all users through.
    Free tier gets full access with nag, paid tiers get clean experience.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # All users can access all features
        # Nag/upgrade prompts are handled by the frontend
        return f(*args, **kwargs)
    
    return decorated_function


def require_patron_only(f):
    """
    Stricter decorator - kept for backwards compatibility but now allows all.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        return f(*args, **kwargs)
    
    return decorated_function


def require_auth(f):
    """
    Lighter decorator - just requires authentication (not necessarily a patron)
    Useful for endpoints that should work for free users too
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        licensing = get_licensing()
        status = licensing.get_status()
        
        if not status.get('authenticated'):
            return jsonify({
                'error': 'Not authenticated',
                'message': 'Please login with Patreon',
                'auth_url': status.get('auth_url')
            }), 401
        
        return f(*args, **kwargs)
    
    return decorated_function
