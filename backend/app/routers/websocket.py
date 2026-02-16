import json
from datetime import datetime
from typing import Dict, Set

from bson import ObjectId
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.database import get_database

router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections for interview rooms."""

    def __init__(self):
        # room_id -> {connection_id: websocket}
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}
        # room_id -> hr websocket
        self.hr_connections: Dict[str, WebSocket] = {}
        # connection_id -> candidate info
        self.participant_info: Dict[str, dict] = {}

    async def join_room(self, room_id: str, conn_id: str, ws: WebSocket, role: str, info: dict):
        await ws.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = {}

        self.rooms[room_id][conn_id] = ws
        self.participant_info[conn_id] = {**info, "role": role, "conn_id": conn_id}

        if role == "hr":
            self.hr_connections[room_id] = ws

        # Notify everyone in the room
        await self.broadcast(room_id, {
            "type": "user_joined",
            "conn_id": conn_id,
            "role": role,
            "info": info,
            "participants": self._get_participants(room_id),
        }, exclude=conn_id)

        # Send current participants to the new joiner
        await ws.send_json({
            "type": "room_state",
            "participants": self._get_participants(room_id),
            "your_id": conn_id,
        })

    async def leave_room(self, room_id: str, conn_id: str):
        if room_id in self.rooms:
            self.rooms[room_id].pop(conn_id, None)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
                self.hr_connections.pop(room_id, None)

        info = self.participant_info.pop(conn_id, {})
        await self.broadcast(room_id, {
            "type": "user_left",
            "conn_id": conn_id,
            "info": info,
            "participants": self._get_participants(room_id),
        })

    async def broadcast(self, room_id: str, message: dict, exclude: str = None):
        if room_id not in self.rooms:
            return
        dead = []
        for cid, ws in self.rooms[room_id].items():
            if cid == exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(cid)
        for cid in dead:
            self.rooms[room_id].pop(cid, None)

    async def send_to(self, room_id: str, target_id: str, message: dict):
        ws = self.rooms.get(room_id, {}).get(target_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def remove_participant(self, room_id: str, conn_id: str):
        ws = self.rooms.get(room_id, {}).get(conn_id)
        if ws:
            await ws.send_json({"type": "removed", "message": "You have been removed by the host."})
            await ws.close()
        await self.leave_room(room_id, conn_id)

    def _get_participants(self, room_id: str) -> list:
        if room_id not in self.rooms:
            return []
        return [
            self.participant_info.get(cid, {"conn_id": cid})
            for cid in self.rooms[room_id]
        ]


manager = ConnectionManager()


@router.websocket("/ws/interview/{room_id}")
async def interview_websocket(websocket: WebSocket, room_id: str):
    """
    WebSocket endpoint for interview rooms.
    
    Query params:
      - token: unique candidate token or JWT for HR
      - role: 'candidate' or 'hr'
      - name: display name
    """
    params = websocket.query_params
    token = params.get("token", "")
    role = params.get("role", "candidate")
    name = params.get("name", "Anonymous")

    db = get_database()
    conn_id = token or f"{role}_{id(websocket)}"

    # Validate candidate token if candidate
    if role == "candidate" and token:
        candidate = await db.candidates.find_one({"unique_token": token})
        if not candidate:
            await websocket.close(code=4001, reason="Invalid token")
            return
        # Mark as joined
        await db.candidates.update_one(
            {"unique_token": token},
            {"$set": {"status": "joined", "joined_at": datetime.utcnow()}},
        )
        name = candidate.get("email", name)

    info = {"name": name, "email": params.get("email", ""), "token": token}

    try:
        await manager.join_room(room_id, conn_id, websocket, role, info)

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "webrtc_offer":
                await manager.send_to(room_id, data["target"], {
                    "type": "webrtc_offer",
                    "offer": data["offer"],
                    "from": conn_id,
                })

            elif msg_type == "webrtc_answer":
                await manager.send_to(room_id, data["target"], {
                    "type": "webrtc_answer",
                    "answer": data["answer"],
                    "from": conn_id,
                })

            elif msg_type == "ice_candidate":
                await manager.send_to(room_id, data["target"], {
                    "type": "ice_candidate",
                    "candidate": data["candidate"],
                    "from": conn_id,
                })

            elif msg_type == "request_stream":
                # HR requests a candidate's stream
                await manager.send_to(room_id, data["target"], {
                    "type": "request_stream",
                    "from": conn_id,
                })

            elif msg_type == "stream_ready":
                # Candidate signals they have streams available
                await manager.broadcast(room_id, {
                    "type": "stream_ready",
                    "from": conn_id,
                    "name": name,
                    "has_camera": data.get("has_camera", False),
                    "has_screen": data.get("has_screen", False),
                }, exclude=conn_id)

            elif msg_type == "chat_message":
                await manager.broadcast(room_id, {
                    "type": "chat_message",
                    "from": conn_id,
                    "name": name,
                    "message": data.get("message", ""),
                    "timestamp": datetime.utcnow().isoformat(),
                })

            elif msg_type == "mute_candidate" and role == "hr":
                await manager.send_to(room_id, data["target"], {
                    "type": "muted",
                    "message": "You have been muted by the host.",
                })

            elif msg_type == "remove_candidate" and role == "hr":
                await manager.remove_participant(room_id, data["target"])

            elif msg_type == "end_interview" and role == "hr":
                await manager.broadcast(room_id, {
                    "type": "interview_ended",
                    "message": "The interview has been ended by the host.",
                })

    except WebSocketDisconnect:
        await manager.leave_room(room_id, conn_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        await manager.leave_room(room_id, conn_id)
