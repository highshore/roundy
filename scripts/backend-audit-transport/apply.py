"""Temporary integrity-checked transport of the locally reviewed source diff."""
from pathlib import Path
import base64
import hashlib
import lzma
import subprocess

root = Path(__file__).parent
encoded = ''.join((root / f'{number}.b64').read_text().strip() for number in range(1, 5))
patch = lzma.decompress(base64.b64decode(encoded, validate=True))
if len(patch) != 75369 or hashlib.sha256(patch).hexdigest() != '9c7230ee49c71376861f624738bec3a1fc0d408514fb259f45884b1b5274584e':
    raise RuntimeError('Patch transport integrity mismatch')
allowed = {'docs/instagram-backend-resilience-audit-20261013.md','next.config.ts','package.json','scripts/test-marketing-backend-resilience.mjs','scripts/test-marketing-generation-retry.mjs','scripts/test-marketing-generation.mjs','src/components/admin-marketing.tsx','src/lib/marketing-content-policy.ts','src/lib/marketing-editorial.ts','src/lib/marketing-generation-retry.ts','src/lib/marketing-generation.ts','src/lib/marketing-prompt-budget.ts','src/lib/marketing-render-assets.ts','src/lib/marketing-stock-photos.ts','src/lib/marketing-workflow.ts','src/lib/marketing.ts'}
paths = {line.split(' b/', 1)[1] for line in patch.decode('utf-8').splitlines() if line.startswith('diff --git ')}
if paths != allowed:
    raise RuntimeError('Unexpected patch scope')
target = Path('/tmp/roundy-backend-audit.patch')
target.write_bytes(patch)
subprocess.run(['git','apply','--check',str(target)], check=True)
subprocess.run(['git','apply',str(target)], check=True)
print(f'Applied {len(paths)} integrity-checked source changes')
