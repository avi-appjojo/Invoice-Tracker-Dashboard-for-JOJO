"""
Update the tech user email:
- From: appmanager@appjojo.in
- To:   social.avidedania@gmail.com

Run from backend:
    python -m scripts.update_tech_user_email
"""

from __future__ import annotations

from pymongo import MongoClient

from app.config import get_settings


def main() -> None:
    settings = get_settings()
    client = MongoClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DB_NAME]
    users = db["users"]

    old_email = "appmanager@appjojo.in"
    new_email = "social.avidedania@gmail.com"

    user = users.find_one({"email": old_email})
    if not user:
        print(f"No user found with email {old_email!r}")
        return

    users.update_one({"_id": user["_id"]}, {"$set": {"email": new_email, "department": "tech"}})
    print("Updated user", user["_id"], "email ->", new_email, "department -> tech")


if __name__ == "__main__":
    main()

