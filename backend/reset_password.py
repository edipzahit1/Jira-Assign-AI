# Run from /backend 
# Reset password for a user 
# python reset_password.py <username> <new_password>

import sys
import os
from dotenv import load_dotenv

load_dotenv()
if os.path.exists("../.env"):
    load_dotenv("../.env")

from database import SessionLocal
from models import PortalUser
from auth import get_password_hash

def reset_password(username: str, new_password: str):
    db = SessionLocal()
    try:
        user = db.query(PortalUser).filter(PortalUser.username == username).first()
        if not user:
            print(f"Error: User '{username}' not found.")
            return

        user.hashed_password = get_password_hash(new_password)
        db.commit()
        print(f"Success: Password for '{username}' has been successfully reset.")
    except Exception as e:
        print(f"An error occurred: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python reset_password.py <username> <new_password>")
        sys.exit(1)
    
    username_arg = sys.argv[1]
    new_password_arg = sys.argv[2]
    reset_password(username_arg, new_password_arg)
