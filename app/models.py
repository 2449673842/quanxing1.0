from app import db
from werkzeug.security import generate_password_hash, check_password_hash
import json
from sqlalchemy.dialects.postgresql import JSONB # For potential future use with PostgreSQL
from sqlalchemy.types import JSON as FallbackJSON # Fallback for SQLite
from sqlalchemy.orm.attributes import flag_modified # For SQLite JSON updates

# Use JSONB for PostgreSQL, JSON for SQLite
JSONType = JSONB if db.engine.dialect.name == 'postgresql' else FallbackJSON

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), index=True, unique=True, nullable=False)
    email = db.Column(db.String(120), index=True, unique=True, nullable=False)
    password_hash = db.Column(db.String(256))

    literature_articles = db.relationship('LiteratureArticle', backref='author_user', lazy='dynamic')
    # MODIFICATION: Establish relationship from User to ScreenshotMetadata
    screenshots = db.relationship('ScreenshotMetadata', backref='owner_user', lazy='dynamic', cascade="all, delete-orphan")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.username}>'

class LiteratureArticle(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    title = db.Column(db.String(512), nullable=False)
    original_columns_data = db.Column(JSONType, nullable=True, default=lambda: {})

    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), server_onupdate=db.func.now())

    # MODIFICATION: Establish relationship from LiteratureArticle to ScreenshotMetadata
    screenshots = db.relationship('ScreenshotMetadata', backref='literature_article', lazy='dynamic', cascade="all, delete-orphan")

    def __repr__(self):
        return f'<LiteratureArticle {self.id}: {self.title[:50]}>'

    @property
    def pdf_url(self):
        return (self.original_columns_data or {}).get('pdf_url')

    @pdf_url.setter
    def pdf_url(self, url):
        if self.original_columns_data is None:
            self.original_columns_data = {}
        self.original_columns_data['pdf_url'] = url
        # For SQLAlchemy to detect changes in mutable JSON types if not using JSONB events
        if db.engine.dialect.name != 'postgresql':
             flag_modified(self, "original_columns_data")

    # Method to update general fields in original_columns_data
    def update_original_data(self, data_dict):
        if self.original_columns_data is None:
            self.original_columns_data = {}
        
        for key, value in data_dict.items():
            self.original_columns_data[key] = value
        
        if db.engine.dialect.name != 'postgresql':
            flag_modified(self, "original_columns_data")


# MODIFICATION: Define the new ScreenshotMetadata model
class ScreenshotMetadata(db.Model):
    __tablename__ = 'screenshot_metadata' # Explicit table name

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    literature_article_id = db.Column(db.Integer, db.ForeignKey('literature_article.id'), nullable=False)

    # File paths relative to USER_DATA_ROOT
    image_path = db.Column(db.String(1024), nullable=False) # e.g., user_1/article_123/screenshot_timestamp.png
    metadata_path = db.Column(db.String(1024), nullable=False) # e.g., user_1/article_123/screenshot_timestamp.json

    # Core Metadata fields
    page_number = db.Column(db.Integer, nullable=True)
    capture_scale = db.Column(db.Float, nullable=True) # PDF page zoom at capture time
    original_page_dimensions = db.Column(JSONType, nullable=True) # {width: X, height: Y} of PDF page at scale 1.0

    # User-editable/annotated fields
    chart_type = db.Column(db.String(128), nullable=True)
    description = db.Column(db.Text, nullable=True)
    wpd_data = db.Column(JSONType, nullable=True) # Data from WebPlotDigitizer

    # Timestamps
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(db.DateTime, server_default=db.func.now(), server_onupdate=db.func.now())

    def __repr__(self):
        return f'<ScreenshotMetadata {self.id} for Article {self.literature_article_id}>'

    def get_full_image_path(self, user_data_root_abs_path):
        import os
        return os.path.join(user_data_root_abs_path, self.image_path) if self.image_path else None

    def get_full_metadata_path(self, user_data_root_abs_path):
        import os
        return os.path.join(user_data_root_abs_path, self.metadata_path) if self.metadata_path else None

    def update_json_file(self, user_data_root_abs_path):
        """Updates the JSON metadata file on disk with current model data."""
        import os
        import json as py_json # Alias to avoid conflict with sqlalchemy.types.JSON
        from flask import current_app # For logging

        full_path = self.get_full_metadata_path(user_data_root_abs_path)
        if not full_path:
             current_app.logger.warning(f"No metadata_path for screenshot {self.id}. Cannot update JSON file.")
             return False

        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        # Prepare data from the model instance
        data_to_save = {
            'id': self.id, # DB ID
            'user_id': self.user_id,
            'literature_article_id': self.literature_article_id,
            'image_server_path': self.image_path, # Relative path
            'metadata_server_path': self.metadata_path, # Relative path
            'page_number': self.page_number,
            'capture_scale': self.capture_scale,
            'original_page_dimensions': self.original_page_dimensions,
            'chart_type': self.chart_type,
            'description': self.description,
            'wpd_data': self.wpd_data,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        try:
            with open(full_path, 'w') as f:
                py_json.dump(data_to_save, f, indent=4)
            current_app.logger.info(f"JSON metadata file updated for screenshot {self.id} at {full_path}")
            return True
        except IOError as e:
            current_app.logger.error(f"Error writing JSON metadata to {full_path}: {e}")
            return False

    def to_dict(self, user_data_root_abs_path_for_full_urls=None):
        """Converts model instance to a dictionary, optionally including full URLs."""
        from flask import url_for # For generating URLs if needed
        
        data = {
            'id': self.id,
            'user_id': self.user_id,
            'literature_article_id': self.literature_article_id,
            'image_path': self.image_path,
            'metadata_path': self.metadata_path,
            'page_number': self.page_number,
            'capture_scale': self.capture_scale,
            'original_page_dimensions': self.original_page_dimensions,
            'chart_type': self.chart_type,
            'description': self.description,
            'wpd_data': self.wpd_data,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            # Optionally include literature article details if needed, assuming eager loading or separate query
            'literature_article': {
                'id': self.literature_article.id,
                'title': self.literature_article.title
            } if self.literature_article else None
        }
        # Construct URL relative to the domain, assuming API is at /api/*
        # Frontend js/api.js `API_BASE_URL` will be prepended there.
        # For now, image_url is just the path to the download endpoint.
        # This logic is better suited for the route that serves this data.
        # data['image_url'] = f"/api/download_screenshot_image/{self.id}" # Example
        return data



