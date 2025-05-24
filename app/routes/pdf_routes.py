from flask import Blueprint, request, jsonify, current_app
from app import db
from app.models import LiteratureArticle, User
from app.utils import token_required # Using custom token_required for consistency with screenshots
# from flask_jwt_extended import jwt_required, get_jwt_identity # Alternative if using Flask-JWT-Extended directly

pdf_bp = Blueprint('pdf_api', __name__)

@pdf_bp.route('/associate_link', methods=['POST'])
@token_required # Or @jwt_required() if User is fetched via get_jwt_identity()
def associate_pdf_link(current_user: User):
    data = request.get_json()
    article_id = data.get('article_id')
    pdf_url = data.get('pdf_url')

    if not article_id or not pdf_url:
        return jsonify({"error": "Missing article_id or pdf_url"}), 400

    article = LiteratureArticle.query.filter_by(id=article_id, user_id=current_user.id).first()

    if not article:
        return jsonify({"error": "LiteratureArticle not found or access denied"}), 404

    try:
        # Store the pdf_url in the original_columns_data JSON field
        if article.original_columns_data is None:
            article.original_columns_data = {}
        
        article.original_columns_data['pdf_url'] = pdf_url
        # If using plain JSON on SQLite, you might need to flag_modified
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(article, "original_columns_data")
        
        db.session.commit()
        current_app.logger.info(f"Associated PDF URL '{pdf_url}' with article ID {article_id} for user {current_user.id}")
        return jsonify({
            "message": "PDF URL associated successfully",
            "article_id": article.id,
            "pdf_url": article.original_columns_data.get('pdf_url')
        }), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error associating PDF link for article {article_id}: {str(e)}")
        return jsonify({"error": "Failed to associate PDF URL", "details": str(e)}), 500

# Future: GET /api/pdfs/<int:pdf_file_id>/raw (if PDFs are stored on server and associated with a PDF file entity)
# This would require a PdfFile model or similar, linked to LiteratureArticle.
# For now, the frontend js/pdf-viewer.js loadPdfForViewing calls this,
# but this backend part is not fully specified to be implemented yet beyond linking.
# It would serve a file, not JSON.







