import os
from app import create_app, db
from app.models import User, LiteratureArticle, ScreenshotMetadata # MODIFICATION: Import new model
from flask_migrate import Migrate

app = create_app()
migrate = Migrate(app, db)

@app.shell_context_processor
def make_shell_context():
    # MODIFICATION: Add new ScreenshotMetadata model to shell context
    return {'db': db, 'User': User, 'LiteratureArticle': LiteratureArticle, 'ScreenshotMetadata': ScreenshotMetadata}

@app.cli.command("init-user-dirs")
def init_user_dirs():
    """Ensures the USER_DATA_ROOT directory exists."""
    user_data_root = app.config.get('USER_DATA_ROOT')
    if not user_data_root:
        app.logger.error("USER_DATA_ROOT not configured.")
        print("USER_DATA_ROOT not configured.")
        return

    try:
        os.makedirs(user_data_root, exist_ok=True)
        print(f"User data root directory ensured at: {user_data_root}")
        app.logger.info(f"User data root directory ensured at: {user_data_root}")
    except OSError as e:
        print(f"Error creating user data root directory at {user_data_root}: {e}")
        app.logger.error(f"Error creating user data root directory at {user_data_root}: {e}")


if __name__ == '__main__':
    # Create database tables if they don't exist, only for SQLite and dev
    # For production, use Flask-Migrate
    if app.config['SQLALCHEMY_DATABASE_URI'].startswith('sqlite:///'):
        with app.app_context():
            # Check if tables already exist to avoid recreation issues with existing data
            # This is a simple check; more robust checks might be needed for complex scenarios
            # Or rely on Flask-Migrate entirely
            inspector = db.inspect(db.engine)
            if not inspector.has_table("user") or \
               not inspector.has_table("literature_article") or \
               not inspector.has_table("screenshot_metadata"): # MODIFICATION: Check new table
                db.create_all()
                app.logger.info("Database tables created (SQLite development).")
            else:
                app.logger.info("Database tables already exist (SQLite development).")


    # Ensure USER_DATA_ROOT directory exists on startup
    with app.app_context():
        user_data_root = app.config.get('USER_DATA_ROOT')
        if user_data_root:
            try:
                os.makedirs(user_data_root, exist_ok=True)
                app.logger.info(f"USER_DATA_ROOT ensured at {user_data_root}")
            except OSError as e:
                app.logger.error(f"Could not create USER_DATA_ROOT at {user_data_root}: {e}")
        else:
            app.logger.warning("USER_DATA_ROOT is not configured.")
            
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    
    app.run(host=host, port=port, debug=debug)



