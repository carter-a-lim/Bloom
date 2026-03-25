from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import json
import uuid
import os
import litellm
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "ok"}

CANONICAL_LAYERS = ["Frontend", "Backend"]

ARCHITECT_PERSONA = """You are **Software Architect** — strategic, pragmatic, trade-off-conscious, domain-focused.
- Domain first, technology second — understand the business problem before picking tools
- No architecture astronautics — every abstraction must justify its complexity
- Trade-offs over best practices — name what you're giving up
- The best architecture is the one the team can actually maintain"""

BACKEND_PERSONA = """You are **Backend Architect** — senior backend architect specializing in scalable system design, database architecture, API development, and cloud infrastructure.
- Security-first: defense in depth, principle of least privilege, encrypt at rest and in transit
- Performance-conscious: sub-200ms API responses, proper DB indexing, Redis caching strategies
- Reliability-obsessed: circuit breakers, graceful degradation, 99.9% uptime design
- Data/schema engineering: UUID PKs, proper indexes, soft deletes, ACID compliance
- API design: versioned REST/GraphQL, rate limiting with express-rate-limit, helmet.js security headers
- Auth: bcrypt password hashing, JWT with refresh tokens, OAuth 2.0, role-based access control
- Infrastructure: horizontal scaling, container orchestration, event-driven with message queues"""

FRONTEND_PERSONA = """You are **Frontend Developer** — expert in modern web technologies, React/Vue/Angular, UI implementation, and performance optimization.
- Performance-first: Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1), code splitting, lazy loading
- Accessibility by default: WCAG 2.1 AA, semantic HTML, ARIA labels, keyboard navigation
- Component architecture: reusable typed components, design systems, proper separation of concerns
- State management: Redux/Zustand/Context API with proper patterns
- Modern patterns: React.memo, useCallback, useMemo, virtualized lists for large datasets
- Build optimization: tree shaking, dynamic imports, WebP/AVIF images, service workers
- Testing: unit tests with Jest/Vitest, integration tests, Lighthouse CI"""


async def llm(messages, stream=False, max_tokens=None):
    model = os.environ.get("GROQ_MODEL", "groq/llama-3.3-70b-versatile")
    kwargs = dict(model=model, messages=messages, stream=stream)
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    return await litellm.acompletion(**kwargs)


async def parse_and_emit(websocket, stream_response, emitted_ids, node_depth, root_id):
    """Stream-parse JSON objects and batch-emit valid nodes."""
    full_text = ""
    async for chunk in stream_response:
        delta = chunk.choices[0].delta.content
        if delta:
            full_text += delta

    # Strip markdown fences
    text = full_text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        text = text.rsplit("```", 1)[0]

    # Parse the array
    try:
        s, e = text.find('['), text.rfind(']') + 1
        if s == -1 or e <= s:
            return
        nodes = json.loads(text[s:e])
    except Exception:
        return

    batch = []
    for task in nodes:
        node_id = task.get("id") or str(uuid.uuid4())
        if node_id in emitted_ids:
            node_id = str(uuid.uuid4())
        parent_id = task.get("parentId")
        if not parent_id or parent_id not in emitted_ids:
            continue
        depth = node_depth.get(parent_id, 0) + 1
        if depth > 3:
            continue
        # Accept "label" or "name"
        label = (task.get("label") or task.get("name") or "").strip()
        if not label or label.lower() in ("unnamed", "untitled", "node", "task", "root"):
            continue
        if len(label) > 50:
            label = label[:50].rsplit(' ', 1)[0] or label[:50]
        atomic = task.get("atomic", True)
        if atomic and depth < 2:
            atomic = False
        emitted_ids.add(node_id)
        node_depth[node_id] = depth
        batch.append({
            "id": node_id, "label": label,
            "description": task.get("description", ""),
            "parentId": parent_id, "atomic": atomic,
        })
        if len(batch) >= 5:
            await websocket.send_json({"type": "nodes", "data": batch})
            batch = []

        # Handle nested features if LLM put them inside the group object
        for feat in task.get("features", task.get("children", [])):
            feat_id = feat.get("id") or str(uuid.uuid4())
            if feat_id in emitted_ids:
                feat_id = str(uuid.uuid4())
            feat_label = (feat.get("label") or feat.get("name") or "").strip()
            if not feat_label:
                continue
            if len(feat_label) > 50:
                feat_label = feat_label[:50].rsplit(' ', 1)[0] or feat_label[:50]
            emitted_ids.add(feat_id)
            node_depth[feat_id] = depth + 1
            if depth + 1 > 3:
                continue
            batch.append({
                "id": feat_id, "label": feat_label,
                "description": feat.get("description", ""),
                "parentId": node_id, "atomic": True,
            })
            if len(batch) >= 5:
                await websocket.send_json({"type": "nodes", "data": batch})
                batch = []

    if batch:
        await websocket.send_json({"type": "nodes", "data": batch})


async def decompose(websocket, prompt, root_id):
    emitted_ids = {root_id}
    node_depth = {root_id: 0}

    # Phase 1: pick tech stack in one focused call
    tech_resp = await llm([
        {"role": "system", "content": f"""{ARCHITECT_PERSONA}

Pick the best technology stack for this project. Name actual frameworks/libraries.
Respond with ONLY this JSON (no markdown):
{{"frontend": "<e.g. React, Vue, pygame>", "backend": "<e.g. Node.js + Express + PostgreSQL, FastAPI + SQLite>"}}
If no backend needed (single-player game, CLI tool), set backend to null."""},
        {"role": "user", "content": f'Project: "{prompt}"'}
    ])

    tech = {"frontend": None, "backend": None}
    try:
        text = tech_resp.choices[0].message.content
        s, e = text.find('{'), text.rfind('}') + 1
        if s != -1 and e > s:
            tech = json.loads(text[s:e])
    except Exception:
        pass

    frontend_tech = tech.get("frontend") or "React"
    backend_tech = tech.get("backend")

    # Phase 2: emit layer nodes immediately
    frontend_id = str(uuid.uuid4())
    await websocket.send_json({"type": "node", "data": {
        "id": frontend_id,
        "label": f"Frontend ({frontend_tech})",
        "description": f"Frontend layer using {frontend_tech}",
        "parentId": root_id, "atomic": False,
    }})
    emitted_ids.add(frontend_id)
    node_depth[frontend_id] = 1

    backend_id = None
    if backend_tech:
        backend_id = str(uuid.uuid4())
        await websocket.send_json({"type": "node", "data": {
            "id": backend_id,
            "label": f"Backend ({backend_tech})",
            "description": f"Backend layer using {backend_tech}",
            "parentId": root_id, "atomic": False,
        }})
        emitted_ids.add(backend_id)
        node_depth[backend_id] = 1

    layer_nodes = [{"id": frontend_id, "layer": "Frontend", "tech": frontend_tech}]
    if backend_id:
        layer_nodes.append({"id": backend_id, "layer": "Backend", "tech": backend_tech})

    # Phase 3: one MVP-focused call per layer, with sibling context to avoid overlap
    all_layer_labels = [f"{l['layer']} ({l['tech']})" for l in layer_nodes]

    for layer in layer_nodes:
        persona = BACKEND_PERSONA if layer["layer"] == "Backend" else FRONTEND_PERSONA
        other_layers = [l for l in all_layer_labels if not l.startswith(layer["layer"])]
        overlap_note = f"\nOther layers: {', '.join(other_layers)}. Do NOT duplicate features that belong there." if other_layers else ""

        resp = await llm([
            {"role": "system", "content": f"""{persona}

Break down the "{layer['layer']} ({layer['tech']})" layer of: "{prompt}"{overlap_note}
Layer node id: "{layer['id']}"

Output a flat JSON array. Each item is either a GROUP or a FEATURE:
- GROUP: {{ "id": "<uuid4>", "label": "<domain name>", "description": "<one sentence>", "parentId": "{layer['id']}", "atomic": false }}
- FEATURE: {{ "id": "<uuid4>", "label": "<concrete task>", "description": "<what it does>", "parentId": "<group uuid>", "atomic": true }}

Label rules — features must be CONCRETE implementation tasks, not vague concepts:
{"Backend examples: 'bcrypt password hash', 'JWT refresh token', 'Redis session cache', 'S3 multipart upload', 'Stripe webhook handler', 'PostgreSQL full-text search', 'rate limit middleware', 'DB connection pool'" if layer["layer"] == "Backend" else "Frontend examples: 'virtualized video grid', 'HLS.js player integration', 'Zustand auth store', 'React.lazy route split', 'ARIA live region alerts', 'IntersectionObserver lazy load', 'service worker cache', 'Lighthouse CI budget'"}

Aim for 5-8 groups, 3-5 features each. Every group must have its features immediately after it. Raw JSON array only."""},
            {"role": "user", "content": f'Project: "{prompt}"\nLayer: {layer["layer"]} ({layer["tech"]})\nList concrete implementation tasks.'}
        ], stream=True, max_tokens=4000)

        await parse_and_emit(websocket, resp, emitted_ids, node_depth, root_id)


@app.websocket("/ws/atomizer")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        data = await websocket.receive_text()
        request = json.loads(data)
        prompt = request.get("prompt", "Default Task")

        root_id = str(uuid.uuid4())
        await websocket.send_json({"type": "node", "data": {
            "id": root_id, "label": f"Main Task: {prompt}", "parentId": None
        }})

        await decompose(websocket, prompt, root_id)
        await websocket.send_json({"type": "done"})

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
        try:
            await websocket.close()
        except:
            pass
