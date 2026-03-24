from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.websocket("/ws/atomizer")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        data = await websocket.receive_text()
        request = json.loads(data)
        prompt = request.get("prompt", "Default Task")

        # Simulate ROMA generating a tree of sub-tasks

        # Root node
        root_id = str(uuid.uuid4())
        await websocket.send_json({
            "type": "node",
            "data": {
                "id": root_id,
                "label": f"Main Task: {prompt}",
                "parentId": None
            }
        })
        await asyncio.sleep(0.5)

        # Sub-task 1
        sub1_id = str(uuid.uuid4())
        await websocket.send_json({
            "type": "node",
            "data": {
                "id": sub1_id,
                "label": "Analyze Requirements",
                "parentId": root_id
            }
        })
        await asyncio.sleep(0.5)

        # Sub-task 2
        sub2_id = str(uuid.uuid4())
        await websocket.send_json({
            "type": "node",
            "data": {
                "id": sub2_id,
                "label": "Design Solution",
                "parentId": root_id
            }
        })
        await asyncio.sleep(0.5)

        # Sub-task 3 (child of sub-task 1)
        sub3_id = str(uuid.uuid4())
        await websocket.send_json({
            "type": "node",
            "data": {
                "id": sub3_id,
                "label": "Gather Dependencies",
                "parentId": sub1_id
            }
        })
        await asyncio.sleep(0.5)

        # Sub-task 4 (child of sub-task 2)
        sub4_id = str(uuid.uuid4())
        await websocket.send_json({
            "type": "node",
            "data": {
                "id": sub4_id,
                "label": "Implement Code",
                "parentId": sub2_id
            }
        })
        await asyncio.sleep(0.5)

        await websocket.send_json({"type": "done"})

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")
        try:
            await websocket.close()
        except:
            pass
