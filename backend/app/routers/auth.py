from fastapi import APIRouter, HTTPException, status
from app.models.schemas import UserCreate, UserLogin, UserResponse, TokenResponse
from app.core.database import get_database
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
)
from datetime import datetime

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(user_data: UserCreate):
    db = get_database()
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "name": user_data.name,
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "role": user_data.role.value,
        "created_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(user_doc)
    user_doc["id"] = str(result.inserted_id)

    token = create_access_token(data={"sub": user_data.email, "role": user_data.role.value})
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_doc["id"],
            name=user_doc["name"],
            email=user_doc["email"],
            role=user_doc["role"],
            created_at=user_doc["created_at"],
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    db = get_database()
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(data={"sub": user["email"], "role": user["role"]})
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=str(user["_id"]),
            name=user["name"],
            email=user["email"],
            role=user["role"],
            created_at=user.get("created_at"),
        ),
    )
