# -*- coding: utf-8 -*-
import sys
import contextlib

OUT = 'backend/out.log'
with open(OUT, 'w', encoding='utf-8') as f:
    with contextlib.redirect_stdout(f), contextlib.redirect_stderr(f):
        try:
            import runpy
            runpy.run_path('backend/e2e_router_test.py', run_name='__main__')
        except Exception:
            import traceback
            traceback.print_exc(file=sys.stderr)
            sys.exit(1)

