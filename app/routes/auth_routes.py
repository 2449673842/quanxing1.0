from flask import Blueprint, request, jsonify, current_app
from app import db
from app.models import User
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
import datetime

auth_bp = Blueprint('auth_api', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({"msg": "Missing username, email, or password"}), 400

    if User.query.filter_by(username=username).first() or User.query.filter_by(email=email).first():
        return jsonify({"msg": "User already exists"}), 400

    user = User(username=username, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify({"msg": "User created successfully", "user_id": user.id}), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"msg": "Missing username or password"}), 400

    user = User.query.filter_by(username=username).first()

    if user and user.check_password(password):
        # Identity can be user ID or any other unique identifier
        expires = datetime.timedelta(days=7) # Token validity period
        access_token = create_access_token(identity=user.id, expires_delta=expires)
        return jsonify(access_token=access_token, user_id=user.id, username=user.username), 200
    else:
        return jsonify({"msg": "Bad username or password"}), 401

@auth_bp.route('/me', methods=['GET'])
@jwt_required() # Replaces token_required for Flask-JWT-Extended basic usage
def get_current_user_info():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
    return jsonify({"user": {"id": user.id, "username": user.username, "email": user.email}}), 200


@auth_bp.route('/verify-token', methods=['POST'])
@jwt_required()
def verify_token_route():
    # If @jwt_required passes, the token is valid.
    # We can optionally return user info or just a success message.
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if user:
        return jsonify({"message": "Token is valid", "user_id": user.id, "username": user.username}), 200
    return jsonify({"message": "Token is valid, but user not found in DB"}), 404 # Should not happen







