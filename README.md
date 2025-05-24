# LitLogger: Literature and Screenshot Management Tool

## 1. Overview

LitLogger is a web application designed to help users, particularly researchers and students, manage academic literature, associated PDF documents, and extracted visual data (screenshots of charts, figures, etc.). It provides a centralized platform for organizing research materials, annotating visual extractions, and facilitating easier access to key information within PDF documents.

## 2. Key Features

*   **Literature Management**: Upload and organize literature items with metadata (title, authors, year, source, DOI).
*   **PDF Association**: Link PDF files (via URL or direct upload) to literature items.
*   **In-Browser PDF Viewer**: View PDF documents directly within the application, with controls for navigation, zoom, and fullscreen.
*   **Screenshot Capture**: Capture specific regions (e.g., charts, figures) from PDF documents.
*   **Screenshot Annotation**: Add descriptive metadata to screenshots, including chart type, textual descriptions, and structured data (e.g., from WebPlotDigitizer).
*   **Centralized Data**: "My Records" page to view and manage all personal literature and screenshot collections.
*   **User Authentication**: Secure user accounts for personal data management.
*   **Filtering and Sorting**: Filter and sort literature and screenshot lists for easier navigation.
*   **API Backend**: RESTful API for data operations.

## 3. Tech Stack

*   **Backend**:
    *   Python
    *   Flask (Web framework)
    *   Flask-SQLAlchemy (ORM for database interaction)
    *   SQLite (Default database)
    *   Flask-JWT-Extended (For token-based authentication)
    *   Flask-CORS (For Cross-Origin Resource Sharing)
    *   Flask-Migrate (For database schema migrations)
    *   python-dotenv (For environment variable management)
*   **Frontend**:
    *   HTML5
    *   Tailwind CSS (Utility-first CSS framework)
    *   Vanilla JavaScript (For client-side logic)
    *   PDF.js (Mozilla's library for rendering PDF documents)
    *   Font Awesome (For icons)
*   **Development Tools**:
    *   Git (Version control)
    *   pip (Python package installer)

## 4. Setup and Installation

These instructions assume you have Python and pip installed on your system.

1.  **Clone the Repository:**
    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

2.  **Create a Virtual Environment (Recommended):**
    ```bash
    python -m venv venv
    ```
    Activate the virtual environment:
    *   Windows: `venv\Scripts\activate`
    *   macOS/Linux: `source venv/bin/activate`

3.  **Install Dependencies:**
    *   It is assumed that a `requirements.txt` file exists for Python dependencies. If not, one should be generated from a working environment using `pip freeze > requirements.txt`.
    *   Common dependencies include: Flask, Flask-SQLAlchemy, Flask-JWT-Extended, Flask-CORS, Flask-Migrate, python-dotenv, Werkzeug.
    *   Install dependencies using:
    ```bash
    pip install -r requirements.txt 
    ```
    *   (If `requirements.txt` is missing, you would install packages individually, e.g., `pip install Flask Flask-SQLAlchemy ...`)


4.  **Set Up Environment Variables:**
    *   Create a `.env` file in the project root.
    *   Add necessary environment variables. Key variables include:
        ```
        FLASK_APP=run.py
        FLASK_ENV=development
        SECRET_KEY=your_very_secret_key_here 
        JWT_SECRET_KEY=your_jwt_secret_key_here
        USER_DATA_ROOT=./user_data # Or your preferred path for user uploads
        DATABASE_URL=sqlite:///./instance/app.db 
        ```
    *   `USER_DATA_ROOT` is where uploaded PDFs and screenshots will be stored. Ensure this directory is writable by the application.

5.  **Initialize the Database:**
    *   If using Flask-Migrate, apply database migrations:
        ```bash
        flask db upgrade
        ```
    *   If Flask-Migrate is not set up or this is the first time, you might need to initialize it (`flask db init`) and create an initial migration (`flask db migrate -m "Initial migration."`).
    *   Alternatively, for a simple setup without migrations, you might initialize the database from a Python shell:
        ```python
        from app import create_app, db
        app = create_app()
        with app.app_context():
            db.create_all()
        ```

6.  **Run the Application:**
    ```bash
    flask run
    ```
    The application should typically be available at `http://127.0.0.1:5000`.

## 5. Basic Usage Guide

1.  **Register/Login**: Create a new user account or log in with existing credentials.
2.  **Dashboard**:
    *   **Upload Literature**: Click "Upload Literature" to upload a CSV/Excel file containing literature metadata.
    *   **Select Literature**: Click on a literature item in the list to view its details and associated PDF.
    *   **View PDF**: If a PDF is associated, it will be displayed in the PDF viewer. Use controls for page navigation and zoom.
    *   **Capture Screenshot**: Click the <i class="fas fa-camera"></i> "Capture" button in the PDF controls to enter capture mode. Drag a rectangle over the desired area in the PDF.
    *   **Edit Screenshot Metadata**: After capture, a modal will appear allowing you to add a description, chart type, and other metadata for the screenshot.
    *   **Edit Literature**: Click the <i class="fas fa-edit"></i> icon on a literature item to edit its metadata or upload/change its associated PDF file.
3.  **My Records Page**:
    *   Navigate to "My Records" (usually from a user menu).
    *   View and manage your uploaded literature items and captured screenshots.
    *   Filter and sort your records.
    *   View, edit, or delete screenshots.

## 6. API Endpoints Overview (High-Level)

The application provides a RESTful API for various operations. Key endpoint groups include:

*   `/auth/...`: User registration, login, logout, token verification.
*   `/literature/...`: CRUD operations for literature items, bulk upload, PDF file upload.
*   `/screenshots/...` or `/ml/screenshots/...`: CRUD operations for screenshots, metadata updates, image downloads.
*   `/pdfs/...`: PDF association (though this might be integrated into literature endpoints).

Refer to backend route definitions (e.g., in `app/routes/`) for detailed endpoint paths and request/response formats.

## 7. Directory Structure Overview

```
/project_root
|-- /app                  # Main Flask application package
|   |-- /models           # SQLAlchemy database models
|   |-- /routes           # API route blueprints
|   |-- /static           # Static assets (CSS, JS, images)
|   |   |-- /css
|   |   |-- /js           # Frontend JavaScript files (api.js, app.js, auth.js, etc.)
|   |   |-- /assets
|   |-- /templates        # HTML templates (index.html, dashboard.html, etc.)
|   |-- __init__.py       # Application factory
|   |-- config.py         # Configuration settings
|   |-- utils.py          # Utility functions (e.g., token_required decorator)
|-- /instance             # Instance folder (e.g., for SQLite database file)
|-- /migrations           # Flask-Migrate migration scripts (if used)
|-- /user_data            # Root directory for user-uploaded files (PDFs, screenshots)
|-- venv/                 # Python virtual environment (if used)
|-- .env                  # Environment variables
|-- requirements.txt      # Python dependencies
|-- run.py                # Script to run the Flask application
|-- README.md             # This file
|-- ... (other project files)
```

## 8. Contributing

Contributions are welcome! If you'd like to contribute, please follow these steps:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix (`git checkout -b feature/your-feature-name`).
3.  Make your changes and commit them with clear, descriptive messages.
4.  Ensure your code adheres to any existing coding standards or linters.
5.  Push your changes to your forked repository (`git push origin feature/your-feature-name`).
6.  Open a pull request to the main repository, detailing the changes you've made.

Please ensure that any new features or significant changes are well-documented.

## 9. License

This project is licensed under the **MIT License**. See the `LICENSE` file (if present, otherwise assume MIT) for more details.
