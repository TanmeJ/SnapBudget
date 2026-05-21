from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user
from app.database import get_db
from app.models.models import User
from app.models.schemas import (
    AuthCredentials,
    AuthUser,
    PasswordChangeRequest,
    ProfileUpdateRequest,
    AuthResponse,
    TokenResponse,
)
from app.security import create_access_token, get_password_hash, verify_password

router = APIRouter()


def get_user_by_id(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(credentials: AuthCredentials, db: Session = Depends(get_db)):
    email = credentials.email.strip().lower()
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    user = User(email=email, hashed_password=get_password_hash(credentials.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(access_token=access_token, user=AuthUser.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(credentials: AuthCredentials, db: Session = Depends(get_db)):
    email = credentials.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(access_token=access_token, user=AuthUser.model_validate(user))


@router.patch("/me", response_model=AuthResponse)
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = get_user_by_id(db, str(current_user.id))
    email = payload.email.strip().lower()

    existing_user = db.query(User).filter(User.email == email, User.id != user.id).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already in use")

    user.email = email
    db.commit()
    db.refresh(user)
    return AuthResponse(message="Profile updated", user=AuthUser.model_validate(user))


@router.post("/change-password")
def change_password(
    payload: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = get_user_by_id(db, str(current_user.id))
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")

    user.hashed_password = get_password_hash(payload.new_password)
    db.commit()

    return {"message": "Password updated successfully"}
