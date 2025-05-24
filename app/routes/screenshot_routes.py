from flask import Blueprint, request, jsonify, current_app, send_file
from app import db
from app.models import LiteratureArticle, ScreenshotMetadata, User
from app.utils import token_required, custom_secure_filename, get_user_article_screenshot_base_path
import os
import json as py_json # Alias to avoid name conflict
import time
from werkzeug.datastructures import FileStorage
from sqlalchemy import desc, asc, or_
from sqlalchemy.orm import joinedload

screenshot_bp = Blueprint('screenshot_api_custom', __name__)

@screenshot_bp.route('/save_screenshot', methods=['POST'])
@token_required
def save_screenshot_route(current_user: User):
    if 'image_file' not in request.files:
        return jsonify({"error": "No image file part"}), 400
    image_file: FileStorage = request.files['image_file']
    if image_file.filename == '':
        return jsonify({"error": "No selected image file"}), 400

    try:
        article_id = int(request.form.get('literature_article_id'))
        page_number_str = request.form.get('page_number')
        page_number = int(page_number_str) if page_number_str and page_number_str != 'undefined' else None
        
        capture_scale_str = request.form.get('capture_scale')
        capture_scale = float(capture_scale_str) if capture_scale_str and capture_scale_str != 'undefined' else None
        
        original_page_dimensions_str = request.form.get('original_page_dimensions')
        original_page_dimensions = py_json.loads(original_page_dimensions_str) if original_page_dimensions_str and original_page_dimensions_str != 'undefined' else None

        chart_type = request.form.get('chart_type') if request.form.get('chart_type') != 'undefined' else None
        description = request.form.get('description') if request.form.get('description') != 'undefined' else None
        wpd_data_str = request.form.get('wpd_data')
        wpd_data = py_json.loads(wpd_data_str) if wpd_data_str and wpd_data_str != 'undefined' else None

    except (ValueError, TypeError, py_json.JSONDecodeError) as e:
        current_app.logger.error(f"Error parsing form data for save_screenshot: {e}, Form: {request.form}")
        return jsonify({"error": "Invalid or missing required form data", "details": str(e)}), 400

    article = LiteratureArticle.query.filter_by(id=article_id, user_id=current_user.id).first()
    if not article:
        return jsonify({"error": "LiteratureArticle not found or access denied"}), 404

    timestamp_str = str(int(time.time() * 1000))
    base_relative_path = get_user_article_screenshot_base_path(current_user.id, article.id, timestamp_str)
    
    image_filename = f"screenshot_{timestamp_str}.png"
    metadata_filename = f"screenshot_{timestamp_str}.json"

    image_relative_path = os.path.join(base_relative_path, image_filename)
    metadata_relative_path = os.path.join(base_relative_path, metadata_filename)
    
    user_data_root_abs = current_app.config['USER_DATA_ROOT']
    full_image_path_abs = os.path.join(user_data_root_abs, image_relative_path)
    
    os.makedirs(os.path.dirname(full_image_path_abs), exist_ok=True)

    try:
        image_file.save(full_image_path_abs)

        new_screenshot = ScreenshotMetadata(
            user_id=current_user.id,
            literature_article_id=article.id,
            image_path=image_relative_path,
            metadata_path=metadata_relative_path,
            page_number=page_number,
            capture_scale=capture_scale,
            original_page_dimensions=original_page_dimensions,
            chart_type=chart_type,
            description=description,
            wpd_data=wpd_data
        )
        db.session.add(new_screenshot)
        db.session.commit() # Commit to get new_screenshot.id and other defaults

        # Update the JSON file with data from the committed DB record
        if not new_screenshot.update_json_file(user_data_root_abs):
             current_app.logger.warning(f"Failed to write JSON metadata file for new screenshot {new_screenshot.id}, but DB record was saved.")
             # Decide if this should be a critical error. For now, log and proceed.

        current_app.logger.info(f"Screenshot DB ID {new_screenshot.id} saved for user {current_user.id}. Image: {image_relative_path}")
        return jsonify({
            "message": "Screenshot saved successfully to DB and file system.",
            "screenshot_id": new_screenshot.id,
            "image_path": new_screenshot.image_path,
            "metadata_path": new_screenshot.metadata_path,
            "data": new_screenshot.to_dict() # Return full new object
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error saving screenshot (DB or file system) for article {article_id}: {str(e)}")
        if os.path.exists(full_image_path_abs): # Cleanup if image was saved but DB failed
            try: os.remove(full_image_path_abs)
            except OSError: pass
        return jsonify({"error": "Failed to save screenshot", "details": str(e)}), 500


@screenshot_bp.route('/screenshots/<int:screenshot_id>/metadata', methods=['POST'])
@token_required
def update_screenshot_metadata_route(current_user: User, screenshot_id: int):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    screenshot = ScreenshotMetadata.query.filter_by(id=screenshot_id, user_id=current_user.id).first()
    if not screenshot:
        return jsonify({"error": "Screenshot not found or access denied"}), 404

    try:
        # Update allowed fields from the ScreenshotMetadata model
        if 'chart_type' in data: screenshot.chart_type = data['chart_type']
        if 'description' in data: screenshot.description = data['description']
        if 'wpd_data' in data: screenshot.wpd_data = data['wpd_data']
        # Other fields like page_number, capture_scale, original_page_dimensions are usually set at creation
        # and might not be typical for user update via this route.

        db.session.commit() # Commit changes to the database

        # Update the JSON file on disk to reflect the DB state
        user_data_root_abs = current_app.config['USER_DATA_ROOT']
        if not screenshot.update_json_file(user_data_root_abs):
            current_app.logger.warning(f"DB metadata updated for screenshot {screenshot.id}, but failed to update JSON file.")
            # Non-critical for this response, but important for system consistency.

        current_app.logger.info(f"Screenshot metadata updated for DB ID {screenshot.id} by user {current_user.id}")
        return jsonify({
            "message": "Screenshot metadata updated successfully",
            "screenshot_id": screenshot.id,
            "data": screenshot.to_dict() # Return full updated object
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating screenshot metadata {screenshot_id}: {str(e)}")
        return jsonify({"error": "Failed to update screenshot metadata", "details": str(e)}), 500


@screenshot_bp.route('/download_screenshot_image/<int:screenshot_id>', methods=['GET'])
@token_required
def download_screenshot_image_route(current_user: User, screenshot_id: int):
    screenshot = ScreenshotMetadata.query.filter_by(id=screenshot_id, user_id=current_user.id)\
                                   .options(joinedload(ScreenshotMetadata.literature_article)).first() # Eager load for filename
    if not screenshot:
        return jsonify({"error": "Screenshot not found or access denied"}), 404

    user_data_root_abs = current_app.config['USER_DATA_ROOT']
    full_image_path = screenshot.get_full_image_path(user_data_root_abs)

    if not full_image_path or not os.path.exists(full_image_path):
        current_app.logger.error(f"Screenshot image file not found: {full_image_path} for ID {screenshot_id}")
        return jsonify({"error": "Screenshot image file not found on server"}), 404

    try:
        article_title_slug = "article"
        if screenshot.literature_article and screenshot.literature_article.title:
             article_title_slug = custom_secure_filename(screenshot.literature_article.title[:50]) # Limit length

        page_num_str = f"_p{screenshot.page_number}" if screenshot.page_number is not None else ""
        download_name = f"{article_title_slug}{page_num_str}_ss{screenshot.id}.png"
        
        return send_file(full_image_path, as_attachment=True, download_name=download_name, mimetype='image/png')
    except Exception as e:
        current_app.logger.error(f"Error sending screenshot file {screenshot_id}: {str(e)}")
        return jsonify({"error": "Could not send screenshot file"}), 500

@screenshot_bp.route('/ml/screenshots', methods=['GET'])
@token_required
def get_ml_screenshots(current_user: User):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 12, type=int)
    chart_type_filter = request.args.get('chartType')
    search_query = request.args.get('searchQuery')
    literature_id_filter = request.args.get('literatureId', type=int)
    sort_by = request.args.get('sortBy', 'created_at')
    sort_order = request.args.get('sortOrder', 'desc')

    query = ScreenshotMetadata.query.filter_by(user_id=current_user.id)\
                               .options(joinedload(ScreenshotMetadata.literature_article))

    if chart_type_filter:
        query = query.filter(ScreenshotMetadata.chart_type == chart_type_filter)
    if literature_id_filter:
        query = query.filter(ScreenshotMetadata.literature_article_id == literature_id_filter)
    if search_query:
        search_pattern = f"%{search_query}%"
        query = query.join(LiteratureArticle, ScreenshotMetadata.literature_article_id == LiteratureArticle.id)\
                     .filter(
                        or_(
                            ScreenshotMetadata.description.ilike(search_pattern),
                            ScreenshotMetadata.chart_type.ilike(search_pattern),
                            LiteratureArticle.title.ilike(search_pattern)
                        )
                    )
    
    sort_column_map = {
        'created_at': ScreenshotMetadata.created_at,
        'updated_at': ScreenshotMetadata.updated_at,
        'chart_type': ScreenshotMetadata.chart_type,
        'literature_title': LiteratureArticle.title
    }
    sort_column_attr = sort_column_map.get(sort_by)

    if sort_column_attr:
        # If sorting by related model field, ensure join is effective for ordering
        if sort_by == 'literature_title' and not search_query: # If search_query already joined
             query = query.join(LiteratureArticle, ScreenshotMetadata.literature_article_id == LiteratureArticle.id)
        
        order_func = desc if sort_order.lower() == 'desc' else asc
        query = query.order_by(order_func(sort_column_attr))
    else:
         query = query.order_by(desc(ScreenshotMetadata.created_at))

    paginated_screenshots = query.paginate(page=page, per_page=per_page, error_out=False)
    
    screenshots_data = []
    for ss_meta in paginated_screenshots.items:
        item_data = ss_meta.to_dict() # Uses the model's to_dict method
        # Add the API URL for downloading the image
        item_data['image_url'] = f"/api/download_screenshot_image/{ss_meta.id}"
        screenshots_data.append(item_data)

    return jsonify({
        'items': screenshots_data,
        'page': paginated_screenshots.page,
        'per_page': paginated_screenshots.per_page,
        'total_pages': paginated_screenshots.pages,
        'total_items': paginated_screenshots.total,
    }), 200


@screenshot_bp.route('/screenshots/<int:screenshot_id>', methods=['DELETE'])
@token_required
def delete_screenshot_route(current_user: User, screenshot_id: int):
    screenshot = ScreenshotMetadata.query.filter_by(id=screenshot_id, user_id=current_user.id).first()
    if not screenshot:
        return jsonify({"error": "Screenshot not found or access denied"}), 404

    user_data_root_abs = current_app.config['USER_DATA_ROOT']
    full_image_path = screenshot.get_full_image_path(user_data_root_abs)
    full_metadata_path = screenshot.get_full_metadata_path(user_data_root_abs)

    try:
        db.session.delete(screenshot) # Delete DB record first
        db.session.commit()

        # Attempt to delete files from disk
        if full_image_path and os.path.exists(full_image_path):
            os.remove(full_image_path)
            current_app.logger.info(f"Deleted image file: {full_image_path}")
        if full_metadata_path and os.path.exists(full_metadata_path):
            os.remove(full_metadata_path)
            current_app.logger.info(f"Deleted metadata file: {full_metadata_path}")
        
        # Check if the directory is empty after deleting files and remove it
        # This is a simple check; more robust would be needed if subdirs are complex
        if full_image_path: # Use one of the paths to get dirname
            dir_path = os.path.dirname(full_image_path)
            if os.path.exists(dir_path) and not os.listdir(dir_path): # Check if directory is empty
                 try:
                     os.rmdir(dir_path)
                     current_app.logger.info(f"Removed empty directory: {dir_path}")
                 except OSError as e:
                     current_app.logger.warning(f"Could not remove directory {dir_path}: {e}")


        current_app.logger.info(f"Screenshot DB ID {screenshot_id} and associated files deleted by user {current_user.id}")
        return jsonify({"message": "Screenshot and associated files deleted successfully"}), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting screenshot {screenshot_id}: {str(e)}")
        return jsonify({"error": "Failed to delete screenshot", "details": str(e)}), 500



