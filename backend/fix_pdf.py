# -*- coding: utf-8 -*-
# Replace the DOC_1_BYTES section in e2e_router_test.py.
import io

p = 'backend/e2e_router_test.py'
t = io.open(p, encoding='utf-8').read()

# Find the DOC_1_BYTES = ( ... ) block and replace it entirely.
start = t.find('DOC_1_BYTES = (')
if start == -1:
    raise SystemExit('START NOT FOUND')

# Find the matching closing paren of the tuple.
depth = 0
i = start
while i < len(t):
    if t[i] == '(':
        depth += 1
    elif t[i] == ')':
        depth -= 1
        if depth == 0:
            end = i + 1
            break
    i += 1
else:
    raise SystemExit('END NOT FOUND')

new_block = """DOC_1_BYTES = (
    b'%PDF-1.4\\n'
    b'1 0 obj\\n'
    b'<< /Type /Catalog /Pages 2 0 R >>\\n'
    b'endobj\\n'
    b'2 0 obj\\n'
    b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>\\n'
    b'endobj\\n'
    b'3 0 obj\\n'
    b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\\n'
    b'endobj\\n'
    b'4 0 obj\\n'
    b'<< /Length 70 >>\\n'
    b'stream\\n'
    b'BT /F1 12 Tf 72 700 Td (Budget 2000: total two million dollars, contingency two hundred thousand. Autumn budget approved.)\\n'
    b'Tj ET\\n'
    b'endstream\\n'
    b'endobj\\n'
    b'5 0 obj\\n'
    b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\\n'
    b'endobj\\n'
    b'xref\\n'
    b'0 6\\n'
    b'trailer\\n'
    b'<< /Size 6 /Root 1 0 R >>\\n'
    b'startxref\\n'
    b'0\\n'
    b'%%EOF\\n'
)"""

t = t[:start] + new_block + t[end:]
io.open(p, 'w', encoding='utf-8').write(t)
print('UPDATED DOC_1_BYTES block (length %d -> %d)' % (end - start, len(new_block)))
