"""
Mock Interview Router — Optimized Performance Architecture
───────────────────────────────────────────────────────────
  • Two-phase evaluation: instant score → background deep analysis
  • Parallel: evaluate answer + pre-generate next question simultaneously
  • Active-time timer: pauses during AI processing
  • Pre-generation of questions for zero-wait transitions
"""

import asyncio
import time
import uuid
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.core.database import get_database
from app.core.security import get_current_user
from app.models.schemas import MockInterviewStart, QuestionResponse, AnswerSubmit
from app.services.ai_service import ai_service
from app.services.report_service import generate_pdf_report

router = APIRouter(prefix="/api/mock-interview", tags=["Mock Interview"])

TECH_CUTOFF = 70.0


# ── Start ─────────────────────────────────────────────

@router.post("/start")
async def start_mock_interview(data: MockInterviewStart, user: dict = Depends(get_current_user)):
    db = get_database()
    start_ts = time.time()

    # Analyze JD if provided (run in parallel with nothing else at start)
    jd_analysis = None
    if data.job_description:
        jd_analysis = await ai_service.analyze_job_description(
            data.job_description, data.job_role
        )

    session_doc = {
        "user_id": str(user["_id"]),
        "job_role": data.job_role,
        "difficulty": data.difficulty.value,
        "job_description": data.job_description or "",
        "experience_level": data.experience_level or "",
        "jd_analysis": jd_analysis,
        "status": "in_progress",
        "current_round": "Technical",
        "duration_minutes": data.duration_minutes,
        "questions": [],
        "responses": [],
        "current_question_index": 0,
        "technical_score": None,
        "hr_score": None,
        "processing_time_total": 0.0,  # Track cumulative AI processing time
        "created_at": datetime.utcnow(),
        "started_at": datetime.utcnow(),
    }
    result = await db.mock_sessions.insert_one(session_doc)
    session_id = str(result.inserted_id)

    # Generate the first Technical question
    question_data = await ai_service.generate_question(
        job_role=data.job_role,
        difficulty=data.difficulty.value,
        previous_questions=[],
        round_type="Technical",
        job_description=data.job_description or "",
        experience_level=data.experience_level or "",
        jd_analysis=jd_analysis,
    )

    question_doc = {
        "question_id": str(uuid.uuid4()),
        "question": question_data["question"],
        "ideal_answer": question_data.get("ideal_answer", ""),
        "keywords": question_data.get("keywords", []),
        "difficulty": data.difficulty.value,
        "round": "Technical",
        "is_coding": question_data.get("is_coding", False),
    }
    await db.mock_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$push": {"questions": question_doc}},
    )

    # Track startup processing time
    startup_processing = time.time() - start_ts
    await db.mock_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$inc": {"processing_time_total": startup_processing}},
    )

    return {
        "session_id": session_id,
        "question": QuestionResponse(
            question_id=question_doc["question_id"],
            question=question_doc["question"],
            difficulty=question_doc["difficulty"],
            question_number=1,
            round=question_doc["round"],
            is_coding=question_doc["is_coding"],
        ),
        "round": "Technical",
        "duration_minutes": data.duration_minutes,
        "time_status": ai_service.check_time_status(
            session_doc["started_at"], data.duration_minutes, startup_processing
        ),
    }


# ── Submit Answer (optimized: parallel eval + question gen) ──

@router.post("/{session_id}/answer")
async def submit_answer(
    session_id: str,
    answer: AnswerSubmit,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    db = get_database()
    processing_start = time.time()

    session = await db.mock_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Not your session")

    # Check time (using active time)
    started_at = session.get("started_at", session["created_at"])
    duration = session.get("duration_minutes", 20)
    proc_total = session.get("processing_time_total", 0.0)
    time_status = ai_service.check_time_status(started_at, duration, proc_total)

    # Find the question
    question_doc = None
    for q in session["questions"]:
        if q["question_id"] == answer.question_id:
            question_doc = q
            break
    if not question_doc:
        raise HTTPException(status_code=404, detail="Question not found")

    answer_text = answer.answer_text
    is_coding = question_doc.get("is_coding", False)
    next_q_data = None  # Will be set in parallel for non-coding path

    # ── PHASE 1: Instant evaluation (< 2 seconds) ────
    if is_coding and answer.code_text:
        # Code evaluation still uses LLM
        code_eval = await ai_service.evaluate_code(
            question=question_doc["question"],
            ideal_answer=question_doc["ideal_answer"],
            submitted_code=answer.code_text,
            language=answer.code_language or "python",
        )
        evaluation = {
            "content_score": code_eval.get("correctness_score", 0),
            "keyword_score": code_eval.get("quality_score", 0),
            "depth_score": code_eval.get("efficiency_score", 0),
            "communication_score": code_eval.get("quality_score", 0),
            "confidence_score": 50.0,
            "overall_score": code_eval.get("overall_score", 0),
            "similarity_score": code_eval.get("correctness_score", 0),
            "keyword_coverage": 0,
            "keywords_matched": [],
            "keywords_missed": [],
            "feedback": code_eval.get("feedback", ""),
            "answer_strength": "strong" if code_eval.get("overall_score", 0) >= 80 else (
                "moderate" if code_eval.get("overall_score", 0) >= 50 else "weak"
            ),
            "code_evaluation": code_eval,
        }
    else:
        # Two-phase: get instant score first for fast UX
        instant_eval = ai_service.evaluate_answer_instant(
            question=question_doc["question"],
            ideal_answer=question_doc["ideal_answer"],
            candidate_answer=answer_text,
            keywords=question_doc.get("keywords", []),
            round_type=question_doc.get("round", "Technical"),
        )

        # ── Run deep evaluation + next question generation IN PARALLEL ──
        current_round = session.get("current_round", "Technical")
        all_responses = session.get("responses", [])
        last_score = instant_eval.get("overall_score", 50)
        next_difficulty = ai_service.determine_next_difficulty(
            last_score, session.get("difficulty", "medium")
        )
        prev_questions = [q["question"] for q in session["questions"]]
        prev_answers = [r["answer_text"] for r in all_responses] + [answer_text]

        # Fire both tasks in parallel
        deep_eval_task = ai_service.evaluate_answer_deep(
            question=question_doc["question"],
            ideal_answer=question_doc["ideal_answer"],
            candidate_answer=answer_text,
            keywords=question_doc.get("keywords", []),
            instant_result=instant_eval,
            round_type=question_doc.get("round", "Technical"),
        )

        next_q_task = ai_service.generate_question(
            job_role=session["job_role"],
            difficulty=next_difficulty,
            previous_questions=prev_questions,
            round_type=current_round,
            job_description=session.get("job_description", ""),
            experience_level=session.get("experience_level", ""),
            previous_answers=prev_answers,
            last_score=last_score,
            jd_analysis=session.get("jd_analysis"),
        )

        try:
            deep_eval, next_q_data = await asyncio.gather(deep_eval_task, next_q_task)
            evaluation = deep_eval
        except Exception:
            evaluation = instant_eval
            next_q_data = None

    # Save response
    response_doc = {
        "question_id": answer.question_id,
        "answer_text": answer_text,
        "code_text": answer.code_text,
        "evaluation": evaluation,
        "answered_at": datetime.utcnow(),
    }

    current_idx = session["current_question_index"] + 1
    processing_time = time.time() - processing_start
    proc_total += processing_time

    await db.mock_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {
            "$push": {"responses": response_doc},
            "$set": {"current_question_index": current_idx},
            "$inc": {"processing_time_total": processing_time},
        },
    )

    # Re-check time with updated processing overhead
    time_status = ai_service.check_time_status(started_at, duration, proc_total)

    # ── Time expired → end interview ──
    if time_status["is_expired"]:
        await _complete_session(db, session_id, session)
        return {
            "evaluation": evaluation,
            "is_complete": True,
            "reason": "time_expired",
            "time_status": time_status,
            "message": "Interview time has expired. Generating your report.",
        }

    current_round = session.get("current_round", "Technical")
    all_responses = session.get("responses", []) + [response_doc]

    # ── Check round transition: Technical → HR ──
    if current_round == "Technical":
        tech_responses = [
            r for r in all_responses
            if any(
                q.get("round") == "Technical"
                for q in session["questions"]
                if q["question_id"] == r["question_id"]
            )
        ]
        tech_score = ai_service.calculate_round_score(tech_responses)

        tech_time_limit = duration * 0.6
        active_elapsed = time_status["elapsed_minutes"]
        if active_elapsed >= tech_time_limit and len(tech_responses) >= 3:
            if not ai_service.should_proceed_to_hr(tech_score, TECH_CUTOFF):
                await db.mock_sessions.update_one(
                    {"_id": ObjectId(session_id)},
                    {"$set": {
                        "technical_score": tech_score,
                        "status": "completed",
                        "completed_at": datetime.utcnow(),
                        "termination_reason": "technical_score_below_cutoff",
                    }},
                )
                return {
                    "evaluation": evaluation,
                    "is_complete": True,
                    "reason": "technical_cutoff_not_met",
                    "technical_score": tech_score,
                    "time_status": time_status,
                    "message": f"Technical round score ({tech_score}%) is below the {TECH_CUTOFF}% cutoff. Interview ended.",
                }
            else:
                current_round = "HR"
                await db.mock_sessions.update_one(
                    {"_id": ObjectId(session_id)},
                    {"$set": {"current_round": "HR", "technical_score": tech_score}},
                )

                # Need to generate HR question if round changed (next_q_data was for Technical)
                if not is_coding:
                    next_q_data = await ai_service.generate_question(
                        job_role=session["job_role"],
                        difficulty=ai_service.determine_next_difficulty(
                            evaluation.get("overall_score", 50), session.get("difficulty", "medium")
                        ),
                        previous_questions=[q["question"] for q in session["questions"]],
                        round_type="HR",
                        job_description=session.get("job_description", ""),
                        experience_level=session.get("experience_level", ""),
                        previous_answers=[r["answer_text"] for r in all_responses],
                        last_score=evaluation.get("overall_score", 50),
                        jd_analysis=session.get("jd_analysis"),
                    )

    # ── Generate next question (if not already done in parallel) ──
    if is_coding or not next_q_data:
        last_score = evaluation.get("overall_score", 50)
        next_difficulty = ai_service.determine_next_difficulty(
            last_score, session.get("difficulty", "medium")
        )
        prev_questions = [q["question"] for q in session["questions"]]
        prev_answers = [r["answer_text"] for r in all_responses]

        next_q_data = await ai_service.generate_question(
            job_role=session["job_role"],
            difficulty=next_difficulty,
            previous_questions=prev_questions,
            round_type=current_round,
            job_description=session.get("job_description", ""),
            experience_level=session.get("experience_level", ""),
            previous_answers=prev_answers,
            last_score=last_score,
            jd_analysis=session.get("jd_analysis"),
        )
    else:
        next_difficulty = ai_service.determine_next_difficulty(
            evaluation.get("overall_score", 50), session.get("difficulty", "medium")
        )

    next_question_doc = {
        "question_id": str(uuid.uuid4()),
        "question": next_q_data["question"],
        "ideal_answer": next_q_data.get("ideal_answer", ""),
        "keywords": next_q_data.get("keywords", []),
        "difficulty": next_difficulty,
        "round": current_round,
        "is_coding": next_q_data.get("is_coding", False),
    }
    await db.mock_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {
            "$push": {"questions": next_question_doc},
            "$set": {"difficulty": next_difficulty},
        },
    )

    return {
        "evaluation": evaluation,
        "next_question": QuestionResponse(
            question_id=next_question_doc["question_id"],
            question=next_question_doc["question"],
            difficulty=next_question_doc["difficulty"],
            question_number=current_idx + 1,
            round=current_round,
            is_coding=next_question_doc["is_coding"],
            is_wrap_up=time_status["is_wrap_up"],
        ),
        "is_complete": False,
        "round": current_round,
        "time_status": time_status,
    }


# ── Time Check ────────────────────────────────────────

@router.get("/{session_id}/time")
async def check_time(session_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    session = await db.mock_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    started_at = session.get("started_at", session["created_at"])
    duration = session.get("duration_minutes", 20)
    proc_total = session.get("processing_time_total", 0.0)
    return ai_service.check_time_status(started_at, duration, proc_total)


# ── Force End ─────────────────────────────────────────

@router.post("/{session_id}/end")
async def end_interview(session_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    session = await db.mock_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Not your session")

    await _complete_session(db, session_id, session)
    return {"detail": "Interview ended", "session_id": session_id}


# ── Report ────────────────────────────────────────────

@router.get("/{session_id}/report")
async def get_report(session_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    session = await db.mock_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Not your session")

    report = await ai_service.generate_report(session=session, user=user)
    return report


@router.get("/{session_id}/report/pdf")
async def get_report_pdf(session_id: str, user: dict = Depends(get_current_user)):
    db = get_database()
    session = await db.mock_sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Not your session")

    report = await ai_service.generate_report(session=session, user=user)
    pdf_bytes = generate_pdf_report(report)

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=interview_report_{session_id}.pdf"},
    )


# ── History ───────────────────────────────────────────

@router.get("/history/me")
async def my_history(user: dict = Depends(get_current_user)):
    db = get_database()
    cursor = db.mock_sessions.find(
        {"user_id": str(user["_id"])}
    ).sort("created_at", -1).limit(20)

    sessions = []
    async for s in cursor:
        sessions.append({
            "session_id": str(s["_id"]),
            "job_role": s.get("job_role", ""),
            "status": s.get("status", ""),
            "current_round": s.get("current_round", "Technical"),
            "questions_answered": len(s.get("responses", [])),
            "technical_score": s.get("technical_score"),
            "hr_score": s.get("hr_score"),
            "created_at": s.get("created_at"),
            "completed_at": s.get("completed_at"),
        })
    return sessions


# ── Helpers ───────────────────────────────────────────

async def _complete_session(db, session_id: str, session: dict):
    """Mark session as completed and compute round scores."""
    questions = session.get("questions", [])
    responses = session.get("responses", [])

    tech_responses = [
        r for r in responses
        if any(
            q.get("round") == "Technical"
            for q in questions
            if q["question_id"] == r["question_id"]
        )
    ]
    hr_responses = [
        r for r in responses
        if any(
            q.get("round") == "HR"
            for q in questions
            if q["question_id"] == r["question_id"]
        )
    ]

    tech_score = ai_service.calculate_round_score(tech_responses)
    hr_score = ai_service.calculate_round_score(hr_responses)

    await db.mock_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.utcnow(),
            "technical_score": tech_score,
            "hr_score": hr_score,
        }},
    )
