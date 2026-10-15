# -*- coding: utf-8 -*-
import io
import os
import sys

# Resolve the target file relative to the project root (one dir up from backend).
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(PROJECT_ROOT, 'backend', 'e2e_router_test.py')
with io.open(p, encoding='utf-8') as f:
    t = f.read()

old_block = (
    "def install_openai_shim(monkeypatch, side_effect):\n"
    "    import rag_pipeline\n"
    "    import fastapi.testclient as tc\n"
    "    monkeypatch.setattr(tc, 'OpenAI', _FakeChatCompletions(side_effect))\n"
)
new_block = (
    "def install_openai_shim(monkeypatch, side_effect):\n"
    "    import rag_pipeline\n"
    "    import openai\n"
    "    monkeypatch.setattr(openai, 'OpenAI', _FakeChatCompletions(side_effect))\n"
)
assert old_block in t, 'pattern not found'
t = t.replace(old_block, new_block, 1)

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(t)
print('OK: patched')

