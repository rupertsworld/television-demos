#!/usr/bin/env python3
"""Create the public "Send the TV a word" Tally form and point config.json at it.

Run once with TALLY_API_KEY in the environment, for example
`op run --env-file=/root/env/tv-demo-tally.env.op -- ./create-form.py`.
Pass --new to make a fresh form when config.json already points at one.
The key is used only in process memory and never printed.
"""

import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG = HERE / "config.json"
API = "https://api.tally.so"
TITLE = "Send the TV a word"
QUESTION = "One word for the fridge"


def request(method, path, data=None):
    key = os.environ["TALLY_API_KEY"]
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        API + path, data=body, method=method,
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            payload = response.read()
            return json.loads(payload) if payload else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace").replace(key, "[redacted]")
        raise RuntimeError(f"Tally returned HTTP {error.code} for {method} {path}: {raw[:200]}") from None


def block(kind, group_type, payload):
    return {"uuid": str(uuid.uuid4()), "type": kind, "groupUuid": str(uuid.uuid4()),
            "groupType": group_type, "payload": payload}


def main():
    config = json.loads(CONFIG.read_text())
    if config.get("formTitle") == TITLE and "--new" not in sys.argv[1:]:
        raise RuntimeError("config.json already points at a word form; pass --new to create another")
    result = request("POST", "/forms", {
        "status": "PUBLISHED",
        "blocks": [
            block("FORM_TITLE", "TEXT", {"html": TITLE}),
            block("TEXT", "TEXT", {"html": "It lands on the fridge in a few seconds. One word, keep it friendly."}),
            block("TITLE", "QUESTION", {"html": QUESTION}),
            block("INPUT_TEXT", "INPUT_TEXT", {"isRequired": True, "placeholder": "moon"}),
        ],
    })
    form_id = result.get("id")
    if not form_id or result.get("status") != "PUBLISHED":
        raise RuntimeError("Tally did not confirm a published form")
    questions = request("GET", f"/forms/{form_id}/questions")
    rows = questions if isinstance(questions, list) else (questions or {}).get("questions", [])
    field_id = next((row.get("id") for row in rows
                     if QUESTION.casefold() in str(row.get("title") or "").casefold()), None)
    if not field_id:
        raise RuntimeError(f"Form {form_id} created but its question field was not found")
    previous = dict(config)
    config.update({"formId": form_id, "questionFieldId": field_id, "formTitle": TITLE,
                   "shortLink": f"https://tally.so/r/{form_id}"})
    CONFIG.write_text(json.dumps(config, indent=2) + "\n")
    print(json.dumps({"formId": form_id, "questionFieldId": field_id,
                      "shortLink": config["shortLink"], "previous": previous}))


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, ValueError, RuntimeError) as error:
        print(f"create-form stopped: {error}", file=sys.stderr)
        sys.exit(1)
