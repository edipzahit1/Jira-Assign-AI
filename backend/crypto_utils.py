"""
Utility module to securely encrypt and decrypt sensitive data (like Jira API tokens)
before saving them to the local SQLite database. Uses symmetric Fernet encryption.
"""
import os
from cryptography.fernet import Fernet

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def get_encryption_key():
    # Strict requirement: Must be provided via environment variables in production
    env_key = os.environ.get("ENCRYPTION_KEY")
    if env_key:
        return env_key.encode()

    # If it's not set, we crash intentionally in production environments.
    if os.environ.get("DATABASE_URL", "").startswith("postgresql"):
        raise ValueError("CRITICAL SECURITY ERROR: 'ENCRYPTION_KEY' environment variable is NOT set. It is mandatory for production deployments to persist encrypted data.")
    
    # Development fallback only
    return b"dev-key-placeholder-32-bytes-long!!!" # Placeholder for development

cipher = Fernet(get_encryption_key())

def encrypt_token(plain_token: str) -> str:
    if not plain_token:
        return ""
    return cipher.encrypt(plain_token.encode()).decode()

def decrypt_token(encrypted_token: str) -> str:
    if not encrypted_token:
        return ""
    try:
        return cipher.decrypt(encrypted_token.encode()).decode()
    except Exception as e:
        # Logging this error helps diagnose key mismatches or double-encryption
        print(f"[CRYPTO ERROR] Decryption failed: {str(e)}")
        return ""
