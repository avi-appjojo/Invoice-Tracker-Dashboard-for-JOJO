"""
Create a new employee user: Avi (avi@appjojo.in, tech, password: avi123!@#).
Run from project root: python backend/scripts/create_avi_employee.py
Or from backend: python scripts/create_avi_employee.py (with PYTHONPATH=.)
"""

import sys
import uuid
from pathlib import Path

# Allow running from project root (backend/scripts/create_avi_employee.py)
_backend = Path(__file__).resolve().parent.parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

from datetime import datetime, timezone

from pymongo import MongoClient

from app.config import get_settings
from app.services.security import hash_password


# New details to apply (after confirmation)
NEW_NAME = "Avi"
NEW_EMAIL = "avi@appjojo.in"
NEW_DEPARTMENT = "tech"
NEW_PASSWORD = "avi123!@#"
NEW_ROLE = "employee"
NEW_STATUS = "active"


def main() -> None:
    settings = get_settings()
    client = MongoClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB_NAME]
    users = db["users"]

    email = NEW_EMAIL
    existing = users.find_one({"email": email})
    if existing:
        print("Existing user found:")
        print(f"  ID:         {existing.get('_id', '')}")
        print(f"  Name:       {existing.get('name', '')}")
        print(f"  Email:      {existing.get('email', '')}")
        print(f"  Department: {existing.get('department', '')}")
        print(f"  Role:       {existing.get('role', '')}")
        print(f"  Status:     {existing.get('status', '')}")
        print(f"  Created at: {existing.get('created_at', '')}")
        print()
        confirm = input("Update this user with new details? (y/n): ").strip().lower()
        if confirm not in ("y", "yes"):
            print("No changes made.")
            return
        users.update_one(
            {"email": email},
            {
                "$set": {
                    "name": NEW_NAME,
                    "department": NEW_DEPARTMENT,
                    "password_hash": hash_password(NEW_PASSWORD),
                    "role": NEW_ROLE,
                    "status": NEW_STATUS,
                }
            },
        )
        print("User updated successfully:")
        print(f"  Name:       {NEW_NAME}")
        print(f"  Email:      {NEW_EMAIL}")
        print(f"  Department: {NEW_DEPARTMENT}")
        print(f"  Role:       {NEW_ROLE}")
        print(f"  Password:   {NEW_PASSWORD}")
        return

    user_id = str(uuid.uuid4())
    doc = {
        "_id": user_id,
        "name": NEW_NAME,
        "email": email,
        "password_hash": hash_password(NEW_PASSWORD),
        "role": NEW_ROLE,
        "status": NEW_STATUS,
        "department": NEW_DEPARTMENT,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    users.insert_one(doc)
    print("User created successfully:")
    print(f"  Name:       {NEW_NAME}")
    print(f"  Email:      {email}")
    print(f"  Department: {NEW_DEPARTMENT}")
    print(f"  Role:       {NEW_ROLE}")
    print(f"  Password:   {NEW_PASSWORD}")
    print(f"  ID:         {user_id}")


if __name__ == "__main__":
    main()
