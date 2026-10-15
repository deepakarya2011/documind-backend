# -*- coding: utf-8 -*-
import io
import os

p = os.path.join('backend', 'e2e_router_test.py')
t = io.open(p, encoding='utf-8').read()
print('literal backtick-n count:', t.count(chr(96) + 'n'))
print('total newlines:', t.count(chr(10)))
print('total bytes:', len(t.encode('utf-8')))
