# Temporary, hash-checked UI polish. Remove before merge.
import hashlib
from pathlib import Path
p=Path('src/components/admin-marketing.tsx');s=p.read_text()
hash=lambda v:hashlib.sha256(v.encode()).hexdigest()
before='0478ea6e267813f7d44d6cf547858b37058c889e5e3bfa95e0f12d95da67e88b'
after='101f3fa288a83ca3cb1afa4f0231c71eb9b233c9a7d58f081dacef356bdbcbb5'
if hash(s)!=after:
    if hash(s)!=before:raise RuntimeError('Composer source changed')
    s=s.replace("     </details>\n     <p className=\"admin-help\">{t('Roundy logo", "     <p className=\"admin-help\">{t('Roundy logo",1)
    needle='     <button type="button" className="admin-primary" disabled={busy||!!running||blocked||(basis===\'growth_carousel\'&&!direction.trim())'
    if needle not in s:raise RuntimeError('Composer action missing')
    s=s.replace(needle,'     </details>\n'+needle,1)
    if hash(s)!=after:raise RuntimeError('Composer result mismatch')
    p.write_text(s)
print('Composer polish verified')
