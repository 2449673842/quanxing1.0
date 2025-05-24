from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
import os

from app.config import Config

db = SQLAlchemy()
jwt = JWTManager()

def create_app(config_class=Config):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_class)

    # Ensure the instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass # Already exists

    # Ensure USER_DATA_ROOT exists
    user_data_root = app.config.get('USER_DATA_ROOT', 'user_data')
    if not os.path.isabs(user_data_root):
        user_data_root = os.path.join(app.root_path, '..', user_data_root) # Assuming app is one level down from project root

    try:
        os.makedirs(user_data_root, exist_ok=True)
        app.config['USER_DATA_ROOT'] = os.path.abspath(user_data_root) # Store absolute path
    except OSError as e:
        app.logger.error(f"Could not create USER_DATA_ROOT at {user_data_root}: {e}")


    db.init_app(app)
    jwt.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}}) # Allow all origins for /api/*

    from app.routes.auth_routes import auth_bp
    from app.routes.pdf_routes import pdf_bp
    from app.routes.screenshot_routes import screenshot_bp
    
    # Correctly import and register the literature_bp blueprint
    from app.routes.literature_routes import literature_bp 
    app.register_blueprint(literature_bp, url_prefix='/api/literature') 

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(pdf_bp, url_prefix='/api/pdfs')
    app.register_blueprint(screenshot_bp, url_prefix='/api') # Routes like /api/save_screenshot

    @app.route('/health', methods=['GET'])
    def health_check():
        return {"status": "healthy"}, 200

    return app







