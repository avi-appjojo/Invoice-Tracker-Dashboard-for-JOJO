from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Any

from app.database import get_db
from app.services.security import decode_token


security = HTTPBearer()


class CurrentUser:
    """Represents the authenticated user extracted from JWT and MongoDB."""

    def __init__(
        self,
        id: str,
        email: str,
        role: str,
        user_db_id: str,
        name: Optional[str] = None,
        department: Optional[str] = None,
    ):
        self.id = id  # Mongo user ID
        self.email = email
        self.role = role  # 'superadmin', 'admin', or 'employee'
        self.user_db_id = user_db_id  # ID in our users collection
        self.name = name or (email.split("@")[0].title() if email else "User")
        # Default to 'accounts' if department is not set for backward compatibility
        self.department = (department or "accounts").lower()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CurrentUser:
    """
    Validate API JWT token and return the current user with their role.
    """
    token = credentials.credentials

    try:
        payload = decode_token(token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

    user_id = payload.get("sub")
    role = payload.get("role", "employee")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    db = get_db()
    user_doc = await db["users"].find_one({"_id": user_id})
    if not user_doc:
        raise HTTPException(status_code=403, detail="User not found")
    if user_doc.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="User account is inactive")

    email = user_doc.get("email", "")
    name = user_doc.get("name") or (email.split("@")[0].title() if email else "User")
    department = user_doc.get("department") or "accounts"

    return CurrentUser(
        id=user_id,
        email=email,
        role=role,
        user_db_id=user_id,
        name=name,
        department=department,
    )


def require_role(*allowed_roles: str):
    """
    Dependency that checks if the current user has one of the allowed roles.

    Usage:
        @router.get("/admin-only")
        async def admin_endpoint(user: CurrentUser = Depends(require_role("superadmin"))):
            ...

        @router.get("/admin-or-finance")
        async def endpoint(user: CurrentUser = Depends(require_role("superadmin", "admin"))):
            ...
    """

    async def role_checker(
        user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required role: {', '.join(allowed_roles)}. Your role: {user.role}",
            )
        return user

    return role_checker
