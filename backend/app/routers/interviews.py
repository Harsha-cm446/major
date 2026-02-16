import uuid
from datetime import datetime
from typing import List

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_database
from app.core.security import get_hr_user
from app.models.schemas import (
    InterviewSessionCreate,
    InterviewSessionResponse,
    CandidateInvite,
    CandidateResponse,
)
from app.services.email_service import send_interview_invitations

router = APIRouter(prefix="/api/interviews", tags=["Interview Sessions"])


@router.post("/sessions", response_model=InterviewSessionResponse, status_code=201)
async def create_session(data: InterviewSessionCreate, hr_user: dict = Depends(get_hr_user)):
    db = get_database()
    session_token = str(uuid.uuid4())

    doc = {
        "job_role": data.job_role,
        "scheduled_time": data.scheduled_time,
        "duration_minutes": data.duration_minutes,
        "company_name": data.company_name or hr_user.get("name", "Company"),
        "description": data.description,
        "job_description": data.job_description or "",
        "experience_level": data.experience_level or "",
        "session_token": session_token,
        "status": "pending",
        "created_by": str(hr_user["_id"]),
        "created_by_email": hr_user["email"],
        "candidate_count": 0,
        "created_at": datetime.utcnow(),
    }
    result = await db.interview_sessions.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return InterviewSessionResponse(**doc)


@router.get("/sessions", response_model=List[InterviewSessionResponse])
async def list_sessions(hr_user: dict = Depends(get_hr_user)):
    db = get_database()
    cursor = db.interview_sessions.find({"created_by": str(hr_user["_id"])}).sort("created_at", -1)
    sessions = []
    async for s in cursor:
        s["id"] = str(s["_id"])
        sessions.append(InterviewSessionResponse(**s))
    return sessions


@router.get("/sessions/{session_id}", response_model=InterviewSessionResponse)
async def get_session(session_id: str, hr_user: dict = Depends(get_hr_user)):
    db = get_database()
    session = await db.interview_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session["id"] = str(session["_id"])
    return InterviewSessionResponse(**session)


@router.post("/sessions/{session_id}/invite", response_model=List[CandidateResponse])
async def invite_candidates(
    session_id: str, invite: CandidateInvite, hr_user: dict = Depends(get_hr_user)
):
    db = get_database()
    session = await db.interview_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    candidates = []
    for email in invite.emails:
        unique_token = str(uuid.uuid4())
        candidate_doc = {
            "email": email,
            "interview_session_id": session_id,
            "unique_token": unique_token,
            "status": "invited",
            "invited_at": datetime.utcnow(),
            "joined_at": None,
        }
        result = await db.candidates.insert_one(candidate_doc)
        candidate_doc["id"] = str(result.inserted_id)
        candidates.append(CandidateResponse(**candidate_doc))

    # Update candidate count
    await db.interview_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$inc": {"candidate_count": len(invite.emails)}},
    )

    # Send invitation emails (fire-and-forget style via background)
    await send_interview_invitations(
        candidates=candidates,
        session=session,
        company_name=session.get("company_name", "Company"),
    )

    return candidates


@router.get("/sessions/{session_id}/candidates", response_model=List[CandidateResponse])
async def list_candidates(session_id: str, hr_user: dict = Depends(get_hr_user)):
    db = get_database()
    cursor = db.candidates.find({"interview_session_id": session_id})
    result = []
    async for c in cursor:
        c["id"] = str(c["_id"])
        result.append(CandidateResponse(**c))
    return result


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, hr_user: dict = Depends(get_hr_user)):
    db = get_database()
    await db.interview_sessions.delete_one({"_id": ObjectId(session_id)})
    await db.candidates.delete_many({"interview_session_id": session_id})
    return {"detail": "Session deleted"}
