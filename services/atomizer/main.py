from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import uuid
import os
import litellm

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
        model = request.get("model") or os.environ.get("MODEL", "claude-3-5-sonnet-20241022")

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

        system_prompt = (
            "You are a Senior Software Architect. Decompose the user's request into a valid "
            "JSON array of atomic sub-tasks. Each sub-task must include an id, label, and description. "
            "Output ONLY the JSON array."
        )

        model = request.get("model") or os.environ.get("MODEL", "claude-3-5-sonnet-20241022")
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]

        response = await litellm.acompletion(
            model=model,
            messages=messages,
            stream=True,
            api_base=os.environ.get("OLLAMA_API_BASE") if model.startswith("ollama/") else None
        )

        # We'll buffer the text to find complete JSON objects incrementally
        buffer = ""
        in_string = False
        escape_char = False
        bracket_count = 0
        brace_count = 0
        current_obj_start = -1

        async for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                for char in delta:
                    buffer += char
                    # Simple state machine to find valid JSON objects inside the array
                    if not escape_char and char == '"':
                        in_string = not in_string
                    elif not in_string:
                        if char == '{':
                            if brace_count == 0:
                                current_obj_start = len(buffer) - 1
                            brace_count += 1
                        elif char == '}':
                            brace_count -= 1
                            if brace_count == 0 and current_obj_start != -1:
                                # Found a complete object
                                obj_str = buffer[current_obj_start:]
                                try:
                                    task = json.loads(obj_str)
                                    task_id = task.get("id", str(uuid.uuid4()))
                                    await websocket.send_json({
                                        "type": "node",
                                        "data": {
                                            "id": task_id,
                                            "label": task.get("label", "Unnamed Task"),
                                            "description": task.get("description", ""),
                                            "parentId": root_id
                                        }
                                    })
                                    # Clear buffer up to the end of the object to save memory
                                    # Actually, just reset current_obj_start to look for next one
                                    current_obj_start = -1
                                    buffer = "" # We can clear buffer completely since we only care about the objects inside the array
                                except json.JSONDecodeError:
                                    pass

                    if char == '\\' and in_string:
                        escape_char = not escape_char
                    else:
                        escape_char = False

        await websocket.send_json({"type": "done"})

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")
        try:
            await websocket.close()
        except:
            pass
