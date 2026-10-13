from pathlib import Path
import base64, hashlib, lzma, subprocess
root=Path(__file__).parent
encoded=''.join((root/f'{i}.b64').read_text().strip() for i in range(1,8))
patch=lzma.decompress(base64.b64decode(encoded,validate=True))
if len(patch)!=204455 or hashlib.sha256(patch).hexdigest()!='460fa35a2524cdb63c078c1258d4632c02bda66b324906096514585f40bd2916':
 raise RuntimeError('Reviewed patch integrity mismatch')
allowed=set('''.github/workflows/workflow-refactor-source.yml
docs/instagram-central-workflow-20261013.md
package.json
scripts/marketing-central-harness.mjs
scripts/marketing-central-test-schema.sql
scripts/test-marketing-central-runtime.mjs
scripts/test-marketing-central-sql.mjs
scripts/test-marketing-content-library.mjs
scripts/test-marketing-copy-import.mjs
scripts/test-marketing-generator-interactions.mjs
scripts/test-marketing-runtime-assets.mjs
src/app/api/internal/marketing-content-workflows/route.ts
src/components/admin-marketing-content-library.css
src/components/admin-marketing-content-library.tsx
src/components/admin-marketing.tsx
src/components/marketing-workflow-nav.tsx
src/lib/marketing-content-automation.ts
src/lib/marketing-content-controller.ts
src/lib/marketing-content-state.ts
src/lib/marketing-content-workers.ts
src/lib/marketing-editorial.ts
src/lib/marketing-generation.ts
src/lib/marketing.ts
supabase/migrations/20261013103350_marketing_central_content_workflow.sql
supabase/migrations/20261013104132_marketing_content_workflow_dispatch.sql'''.splitlines())
paths={line.split(' b/',1)[1] for line in patch.decode().splitlines() if line.startswith('diff --git ')}
if paths!=allowed:raise RuntimeError('Unexpected patch scope')
p=Path('/tmp/roundy-central-reviewed.patch');p.write_bytes(patch)
subprocess.run(['git','apply','--check',str(p)],check=True)
subprocess.run(['git','apply',str(p)],check=True)
subprocess.run(['git','add','--',*sorted(allowed)],check=True)
print('Applied 25 reviewed paths; no credentials or font artifacts included')
