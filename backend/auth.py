import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import jwt
import bcrypt
from pydantic import BaseModel
from models import PortalUser
from database import get_db
from rate_limiter import limiter

class UpdateCredentialsRequest(BaseModel):
    current_password: str
    new_username: Optional[str] = None
    new_password: Optional[str] = None

# Constants
env_secret = os.environ.get("JWT_SECRET")
if not env_secret:
    if os.environ.get("DATABASE_URL", "").startswith("postgresql"):
        # We are likely in production/docker. Crash intentionally.
        raise ValueError("CRITICAL: 'JWT_SECRET' environment variable is NOT set. Hardcoded fallbacks are administratively disabled for production.")
    else:
        # Development fallback only
        JWT_SECRET = "super-secret-key-fallback"
else:
    JWT_SECRET = env_secret
JWT_ALGORITHM = "HS256"
try:
    JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "24"))
except ValueError:
    JWT_EXPIRE_HOURS = 24

# Removed OAuth2PasswordBearer because we are migrating to HttpOnly Cookies for security.

router = APIRouter(prefix="/auth", tags=["Authentication"])

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if isinstance(hashed_password, str):
            hashed_password = hashed_password.encode('utf-8')
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    # bcrypt limits passwords to 72 bytes
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def get_current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("access_token")
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
        
    user = db.query(PortalUser).filter(PortalUser.username == username).first()
    if user is None:
        raise credentials_exception
    return user

@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, response: Response, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Rate limiting is now applied via the @limiter.limit decorator above.
    
    user = db.query(PortalUser).filter(PortalUser.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    
    access_token_expires = timedelta(hours=JWT_EXPIRE_HOURS)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    # Set HttpOnly Cookie
    # SECURE_COOKIES=true  → set in production .env (HTTPS via corporate TLS proxy)
    # SECURE_COOKIES=false → set in dev .env (plain http://localhost)
    secure_cookies = os.environ.get("SECURE_COOKIES", "false").lower() == "true"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=secure_cookies,
        samesite="lax",
        max_age=JWT_EXPIRE_HOURS * 3600
    )
    return {"message": "Login successful"}

@router.post("/logout")
def logout(response: Response):
    # Overwrite the cookie with an immediate expiration
    response.delete_cookie(key="access_token", httponly=True, samesite="lax")
    return {"message": "Successfully logged out"}

@router.put("/credentials")
def update_credentials(
    payload: UpdateCredentialsRequest,
    current_user: PortalUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    
    if payload.new_username and payload.new_username != current_user.username:
        # Check if username exists
        existing = db.query(PortalUser).filter(PortalUser.username == payload.new_username).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists"
            )
        current_user.username = payload.new_username
        
    if payload.new_password:
        current_user.hashed_password = get_password_hash(payload.new_password)
        
    db.commit()
    return {"message": "Credentials updated successfully"}

@router.get("/me")
def read_users_me(current_user: PortalUser = Depends(get_current_user)):
    return {"username": current_user.username}
