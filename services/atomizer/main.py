from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import uuid
import os
import litellm
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

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

async def decompose(websocket: WebSocket, prompt: str, root_id: str, model: str):
    """Two-phase decomposition: reason first, then emit structured tree."""

    # Phase 1: reason about the program structure
    reasoning_prompt = """You are a Senior Software Architect. Before producing any JSON, reason carefully about the program.

For the given task, write out:
1. The main data structures/classes needed (just list them, don't make them nodes)
2. The complete execution flow from program start to end
3. Every distinct FUNCTION needed — use verb phrases like "validate_move(board, move) -> bool"
4. Group functions by responsibility (init, input handling, game logic, rendering, etc.)
5. Any special cases (e.g. castling, en passant, bughouse piece drops)

Important: nodes in the tree represent FUNCTIONS TO IMPLEMENT, not classes or data structures."""

    reasoning_response = await litellm.acompletion(
        model=model,
        messages=[
            {"role": "system", "content": reasoning_prompt},
            {"role": "user", "content": f'Task: "{prompt}"'}
        ],
        api_base=os.environ.get("OLLAMA_API_BASE") if model.startswith("ollama/") else None
    )
    reasoning = reasoning_response.choices[0].message.content

    # Phase 2: produce the tree using the reasoning as context
    system_prompt = """You are a Senior Software Architect. Using the provided reasoning, produce a precise implementation tree.

Output a flat JSON array. Each node:
{"id": "<valid uuid4>", "label": "<short verb phrase>", "description": "<full implementation spec>", "parentId": "<parent uuid or root_id>", "atomic": <bool>}

For LEAF nodes (atomic=true), the description must include:
- Function signature (name, parameters, return type)
- Exact responsibility — what it does, step by step
- Edge cases it must handle
- Any dependencies on other functions

For GROUP nodes (atomic=false), description is a one-liner summary of what the group covers.

Other rules:
- Zero overlap between siblings — each owns a distinct slice
- Every id must be a fresh valid uuid4 (xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
- Max depth: 3 levels below root
- Output ONLY the raw JSON array, no markdown, no explanation"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f'Task: "{prompt}"\nRoot node id: "{root_id}"\n\nReasoning about this program:\n{reasoning}\n\nNow produce the complete implementation tree as a flat JSON array.'}
    ]

    response = await litellm.acompletion(
        model=model,
        messages=messages,
        stream=True,
        api_base=os.environ.get("OLLAMA_API_BASE") if model.startswith("ollama/") else None
    )

    buffer = ""
    in_string = False
    escape_char = False
    brace_count = 0
    current_obj_start = -1
    emitted_ids = {root_id}  # prevent duplicate root or reused IDs

    async for chunk in response:
        delta = chunk.choices[0].delta.content
        if delta:
            for char in delta:
                buffer += char
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
                            obj_str = buffer[current_obj_start:]
                            try:
                                task = json.loads(obj_str)
                                task_id = task.get("id") or str(uuid.uuid4())
                                # Skip if ID reused or invalid
                                if task_id in emitted_ids:
                                    task_id = str(uuid.uuid4())
                                emitted_ids.add(task_id)
                                parent_id = task.get("parentId") or root_id
                                # If parentId not yet seen, attach to root
                                if parent_id not in emitted_ids:
                                    parent_id = root_id
                                atomic = task.get("atomic", True)
                                await websocket.send_json({
                                    "type": "node",
                                    "data": {
                                        "id": task_id,
                                        "label": task.get("label", "Unnamed Task"),
                                        "description": task.get("description", ""),
                                        "parentId": parent_id,
                                        "atomic": atomic,
                                    }
                                })
                                current_obj_start = -1
                                buffer = ""
                            except json.JSONDecodeError:
                                pass
                if char == '\\' and in_string:
                    escape_char = not escape_char
                else:
                    escape_char = False


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

        await decompose(websocket, prompt, root_id, model)
        await websocket.send_json({"type": "done"})

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")
        try:
            await websocket.close()
        except:
            pass
