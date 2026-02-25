"""
Analytics Router
────────────────
API endpoints for explainability, fairness auditing, and development roadmaps.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from app.core.security import get_current_user
from app.services.explainability_service import explainability_service
from app.services.fairness_service import fairness_service
from app.services.development_roadmap_service import development_roadmap_service

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ── Request Models ────────────────────────────────

class ExplainScoreRequest(BaseModel):
    evaluation: Dict[str, Any]


class FairnessAuditRequest(BaseModel):
    evaluation_data: List[Dict[str, Any]]


class RoadmapRequest(BaseModel):
    evaluation_summary: Dict[str, Any]
    target_role: Optional[str] = None
    weeks_available: int = 8


class ProgressRequest(BaseModel):
    baseline_scores: Dict[str, float]
    current_scores: Dict[str, float]


# ── Explainability Endpoints ─────────────────────

@router.post("/explain")
async def explain_score(
    request: ExplainScoreRequest,
    user: dict = Depends(get_current_user),
):
    """Get SHAP-based explanation for an interview score."""
    try:
        result = explainability_service.explain_score(request.evaluation)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Explanation error: {str(e)}")


# ── Fairness Endpoints ───────────────────────────

@router.post("/fairness/audit")
async def run_fairness_audit(
    request: FairnessAuditRequest,
    user: dict = Depends(get_current_user),
):
    """Run a comprehensive fairness audit on evaluation data."""
    if not request.evaluation_data:
        raise HTTPException(status_code=400, detail="No evaluation data provided")

    result = fairness_service.run_full_audit(request.evaluation_data)
    return result


@router.get("/fairness/report")
async def get_fairness_report(
    user: dict = Depends(get_current_user),
):
    """Get the latest fairness report including drift monitoring."""
    return fairness_service.generate_fairness_report()


@router.get("/fairness/drift")
async def check_drift(
    user: dict = Depends(get_current_user),
):
    """Check for score distribution drift across demographic groups."""
    return fairness_service.check_drift()


# ── Development Roadmap Endpoints ─────────────────

@router.post("/roadmap")
async def generate_roadmap(
    request: RoadmapRequest,
    user: dict = Depends(get_current_user),
):
    """Generate a personalized 4-phase development roadmap."""
    try:
        roadmap = development_roadmap_service.generate_roadmap(
            evaluation_summary=request.evaluation_summary,
            target_role=request.target_role,
            weeks_available=request.weeks_available,
        )
        return roadmap
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Roadmap generation error: {str(e)}")


@router.post("/roadmap/progress")
async def check_progress(
    request: ProgressRequest,
    user: dict = Depends(get_current_user),
):
    """Check progress against a development roadmap."""
    return development_roadmap_service.compute_progress(
        baseline_scores=request.baseline_scores,
        current_scores=request.current_scores,
    )
