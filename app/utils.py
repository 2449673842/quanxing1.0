from functools import wraps
from flask import request, jsonify, current_app
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from werkzeug.utils import secure_filename as werkzeug_secure_filename
import re
import os

from app.models import User # Assuming User model for fetching user by id

def token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            verify_jwt_in_request()
            user_identity = get_jwt_identity() # This should be the user's ID
            current_user = User.query.get(user_identity)
            if not current_user:
                return jsonify({"msg": "User not found with this token."}), 401
        except Exception as e:
            # Log the exception e for debugging
            current_app.logger.error(f"JWT Verification Error: {str(e)}")
            return jsonify({"msg": "Invalid or expired token."}), 401
        
        return f(current_user, *args, **kwargs)
    return decorated_function

def custom_secure_filename(filename):
    """
    Uses Werkzeug's secure_filename and then replaces spaces with underscores.
    Also ensures it's not empty.
    """
    s_filename = werkzeug_secure_filename(filename)
    if not s_filename: # werkzeug might return empty string for e.g. ".."
        s_filename = "unnamed_file"
    return s_filename.replace(" ", "_")


# For creating user-specific paths safely
def get_user_article_screenshot_base_path(user_id, article_id, timestamp_str):
    """
    Generates the base relative path for a screenshot:
    user_<user_id>/article_<article_id>/screenshot_<timestamp>
    Timestamp string should already be safe.
    """
    return os.path.join(
        f"user_{user_id}",
        f"article_{article_id}",
        f"screenshot_{timestamp_str}" # This is the base name for image and json
    )







