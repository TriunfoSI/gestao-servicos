#!/usr/bin/env python3
"""Atualiza a versão dos arquivos do site (evita que o navegador use arquivos antigos).

Rode antes de publicar: python3 dev/atualizar_versao.py
Reescreve o mapa de módulos (importmap) e o ?v= do CSS em docs/index.html e docs/cliente.html.
"""
import pathlib, re, datetime

DOCS = pathlib.Path(__file__).resolve().parent.parent / 'docs'
V = datetime.datetime.now().strftime('%Y%m%d%H%M')
modulos = ['config.js'] + sorted(str(p.relative_to(DOCS)) for p in (DOCS / 'js').rglob('*.js'))
mapa = ',\n'.join(f'      "./{m}": "./{m}?v={V}"' for m in modulos)
bloco = f'<script type="importmap">\n  {{\n    "imports": {{\n{mapa}\n    }}\n  }}\n  </script>'

for nome in ['index.html', 'cliente.html']:
    f = DOCS / nome
    s = f.read_text()
    s = re.sub(r'<script type="importmap">.*?</script>', bloco, s, flags=re.S) if 'importmap' in s \
        else s.replace('<link rel="stylesheet" href="css/estilo.css', bloco + '\n  <link rel="stylesheet" href="css/estilo.css', 1)
    s = re.sub(r'css/estilo\.css(\?v=\d+)?', f'css/estilo.css?v={V}', s)
    s = re.sub(r'src="js/app\.js(\?v=\d+)?"', f'src="js/app.js?v={V}"', s)
    f.write_text(s)
print('versão', V)
